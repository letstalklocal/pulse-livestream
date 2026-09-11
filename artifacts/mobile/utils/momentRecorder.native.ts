import { AppState, Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import type { IRtcEngine, IMediaRecorder } from "react-native-agora";
import {
  saveLocalMoment,
  uploadMoment,
  type MomentGift,
  type LocalMoment,
} from "./moments";
import { DEFAULT_GIFT_SOUND_ID } from "./defaultGiftSound";
import { prepareMomentGiftAssets, prepareMomentGiftSound } from "./momentGiftAssets.native";
import {
  GIFT_ANIMATION_MS,
  MOMENT_LENGTH_MS,
  momentGiftWatermarkOptions,
  type MomentVideoSize,
} from "./momentGiftConfig";

export type MomentCaptureOptions = {
  getVideoSize: () => MomentVideoSize | null;
  onVisualState?: (active: boolean) => void;
  onGiftVisible?: () => void;
  onFallback?: () => void;
};
const active = new Map<IRtcEngine, () => void>();
const seen = new Set<string>();
export function isMomentRecording(engine: IRtcEngine | null) {
  return !!engine && active.has(engine);
}
export function stopMomentRecording(engine: IRtcEngine | null) {
  if (engine) active.get(engine)?.();
}
export function prepareMomentRecording() {
  if (Platform.OS === "android") {
    prepareMomentGiftAssets();
    try { prepareMomentGiftSound(); } catch (error) {
      console.warn("[Moments] Gift sound preparation failed", error);
    }
  }
}
export function recordGiftMoment(
  engine: IRtcEngine | null,
  channelId: string,
  gift: MomentGift,
  getToken: () => Promise<string | null>,
  options: MomentCaptureOptions,
): boolean {
  if (gift.amount < 500 || seen.has(gift.giftId)) return false;
  seen.add(gift.giftId);
  let moment: LocalMoment = {
    ...gift,
    createdAt: new Date().toISOString(),
    status: "recording",
  };
  const save = (row: LocalMoment) => {
    void saveLocalMoment(row).catch((error) =>
      console.warn("[Moments] Local save failed", error),
    );
  };
  const reject = (error: string) => {
    save({ ...moment, status: "failed", error });
    return false;
  };
  if (Platform.OS !== "android" || !engine || !channelId)
    return reject("Live gift recording requires an active Android broadcast.");
  if (active.has(engine))
    return reject(
      "Another reaction was recording. This gift was not recorded.",
    );
  // Crown is currently the only individual live gift worth 500+ coins.
  // Never substitute a crown for an unsupported future gift.
  if (gift.giftName !== "Crown")
    return reject("Live recording is not available for this gift yet.");
  const size = options.getVideoSize();
  if (!size)
    return reject(
      "Live video dimensions are not ready. This gift was not recorded.",
    );
  let recorder: IMediaRecorder | undefined;
  let soundAttempted = false;
  let soundPath: string | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined,
    stopTimer: ReturnType<typeof setTimeout> | undefined,
    animation: ReturnType<typeof setInterval> | undefined,
    finalize: ReturnType<typeof setTimeout> | undefined;
  let listener: { remove(): void } | undefined;
  let done = false,
    finalizing = false,
    watermark = false,
    visible = false,
    started = 0,
    reportedDuration = 0;
  const notify = (fn: (() => void) | undefined) => {
    try {
      fn?.();
    } catch {}
  };
  const clearCrown = () => {
    clearInterval(animation);
    if (watermark) {
      const result = engine.clearVideoWatermarks();
      if (result < 0)
        throw new Error(
          `Could not clear the gift (${result}). End the live before continuing.`,
        );
      watermark = false;
    }
    notify(() => options.onVisualState?.(false));
  };
  const cleanup = () => {
    clearTimeout(watchdog);
    clearTimeout(stopTimer);
    clearTimeout(finalize);
    clearInterval(animation);
    listener?.remove();
    if (soundAttempted) {
      soundAttempted = false;
      try {
        const result = engine.stopEffect(DEFAULT_GIFT_SOUND_ID);
        if (result < 0) console.warn("[Moments] Gift sound cleanup failed", result);
      } catch (error) { console.warn("[Moments] Gift sound cleanup failed", error); }
    }
    let error: string | undefined;
    try {
      clearCrown();
    } catch (e) {
      error = String(e);
    }
    try {
      if (recorder) engine.destroyMediaRecorder(recorder);
    } catch {
      error ??= "Could not close the recorder. End the live before continuing.";
    }
    active.delete(engine);
    notify(() => options.onVisualState?.(false));
    return error;
  };
  const fail = (error: string) => {
    if (done) return;
    done = true;
    try {
      if (!finalizing) recorder?.stopRecording();
    } catch {}
    const cleanupError = cleanup();
    try {
      if (moment.uri) {
        const f = new File(moment.uri);
        if (f.exists) f.delete();
      }
    } catch {}
    save({
      ...moment,
      status: "failed",
      uri: undefined,
      error: cleanupError ?? error,
    });
    if (!visible) notify(options.onFallback);
  };
  active.set(engine, () =>
    fail("Stream ended or changed before the reaction finished recording."),
  );
  listener = AppState.addEventListener("change", (state) => {
    if (state !== "active")
      fail("Recording was interrupted when the app left the foreground.");
  });
  try {
    const placement = momentGiftWatermarkOptions(size);
    const frames = prepareMomentGiftAssets();
    try { soundPath = prepareMomentGiftSound(); } catch (error) {
      console.warn("[Moments] Gift sound preparation failed", error);
    }
    const directory = new Directory(Paths.document, "moments");
    directory.create({ idempotent: true, intermediates: true });
    const file = new File(directory, `${gift.recipientUid}-${Date.now()}.mp4`);
    moment = { ...moment, uri: file.uri };
    save(moment);
    recorder = engine.createMediaRecorder({
      channelId,
      uid: gift.recipientUid,
      type: 0,
    });
    if (!recorder)
      throw new Error("Native recorder is unavailable in this build.");
    const registered = recorder.setMediaRecorderObserver({
      onRecorderInfoUpdated: (_channel, _uid, info) => {
        reportedDuration = Math.max(reportedDuration, info.durationMs ?? 0);
      },
      onRecorderStateChanged: (_channel, _uid, state, reason) => {
        if (done) return;
        if (state === -1) {
          fail(`Recorder failed (${reason}).`);
          return;
        }
        if (state === 2 && !started) {
          started = Date.now();
          clearTimeout(watchdog);
          notify(() => options.onVisualState?.(true));
          // Animate only after recording starts: the same pixels go to viewers
          // and the raw MP4. No diagnostic hold, mixer or encoder/source change.
          let previous = -1;
          animation = setInterval(() => {
            if (done || finalizing) return;
            try {
              const elapsed = Date.now() - started;
              if (elapsed >= GIFT_ANIMATION_MS) {
                clearCrown();
                return;
              }
              const index = Math.min(43, Math.floor(elapsed / 50));
              if (index === previous) return;
              previous = index;
              watermark = true;
              const result = engine.addVideoWatermark(frames[index], placement);
              if (result < 0)
                throw new Error(`Could not render the live gift (${result}).`);
              if (index > 0 && !visible) {
                visible = true;
                // Once on the broadcasting engine, after recording and the first
                // visible frame. Publish the effect so remote viewers hear it.
                if (soundPath) {
                  soundAttempted = true;
                  try {
                    const result = engine.playEffect(
                      DEFAULT_GIFT_SOUND_ID, soundPath, 0, 1, 0, 65, true, 0,
                    );
                    if (result < 0) console.warn("[Moments] Gift sound failed", result);
                  } catch (error) { console.warn("[Moments] Gift sound failed", error); }
                }
                notify(options.onGiftVisible);
              }
            } catch (e) {
              fail(
                e instanceof Error ? e.message : "Live gift animation failed.",
              );
            }
          }, 50);
          stopTimer = setTimeout(() => {
            try {
              const result = recorder?.stopRecording();
              if (result != null && result < 0)
                fail(`Could not finish recording (${result}).`);
            } catch {
              fail("Could not finish recording.");
            }
          }, MOMENT_LENGTH_MS);
          watchdog = setTimeout(
            () => fail("Recorder did not finish the clip."),
            11000,
          );
        }
        if (state === 3 && !finalizing) {
          finalizing = true;
          clearTimeout(stopTimer);
          clearTimeout(watchdog);
          clearInterval(animation);
          finalize = setTimeout(() => {
            if (done) return;
            done = true;
            const cleanupError = cleanup();
            const durationMs = Math.round(
              reportedDuration || (started ? Date.now() - started : 0),
            );
            try {
              if (
                cleanupError ||
                !visible ||
                !file.exists ||
                !file.size ||
                durationMs < 6500 ||
                durationMs > 8500
              ) {
                save({
                  ...moment,
                  status: "failed",
                  uri: undefined,
                  error:
                    cleanupError ??
                    "A complete live gift clip was not captured.",
                });
                return;
              }
              moment = {
                ...moment,
                durationMs,
                captureMode: "live-gift-v1",
                status: "uploading",
              };
              void uploadMoment(moment, getToken).catch((error) =>
                console.warn("[Moments] Upload failed", error),
              );
            } catch {
              save({
                ...moment,
                uri: undefined,
                status: "failed",
                error: "Could not inspect the recorded clip.",
              });
            }
          }, 300);
        }
      },
    });
    if (registered < 0)
      throw new Error(`Could not register the recorder (${registered}).`);
    watchdog = setTimeout(
      () => fail("Recorder did not start. This gift was not recorded."),
      5000,
    );
    const result = recorder.startRecording({
      storagePath: file.uri.replace(/^file:\/\//, ""),
      containerFormat: 1,
      streamType: 3,
      maxDurationMs: MOMENT_LENGTH_MS,
      recorderInfoUpdateInterval: 500,
    });
    if (result < 0) fail(`Recording unavailable (${result}).`);
  } catch (error) {
    fail(
      error instanceof Error ? error.message : "Native recording unavailable.",
    );
  }
  return !done;
}
