import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import type { IRtcEngine, IMediaRecorder } from "react-native-agora";
import type { MomentProof } from "./momentProof";
import { isMomentRecording } from "./momentRecorder";
import { proofFramesBase64 } from "./momentProofFrames";
import {
  momentProofWatermarkOptions,
  proofStage,
  proofFrameIndex,
  PROOF_LENGTH_MS,
  PROOF_REVISION,
  type ProofVideoSize,
} from "./momentProofConfig";
export type { MomentProof } from "./momentProof";
const active = new Map<IRtcEngine, (reason: string) => void>();
const key = (uid: number) => `pulse:moment-proof:${uid}`;
export async function latestMomentProof(
  uid: number,
): Promise<MomentProof | null> {
  const raw = await AsyncStorage.getItem(key(uid));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
export function stopMomentProof(
  engine: IRtcEngine | null,
  reason = "Test cancelled because the live ended or changed.",
) {
  if (engine) active.get(engine)?.(reason);
}
export async function exportMomentProof(row: MomentProof) {
  if (!row.uri) throw new Error("No captured file is available.");
  const directory = await Directory.pickDirectoryAsync();
  const source = new File(row.uri);
  const destination = new File(directory, `${row.id}.mp4`);
  source.copy(destination);
  new File(directory, `${row.id}.json`).write(
    JSON.stringify({ ...row, uri: undefined }, null, 2),
  );
}
export async function startMomentProof(
  engine: IRtcEngine | null,
  channel: string,
  uid: number,
  isCurrent: () => boolean = () => true,
  getVideoSize: () => ProofVideoSize | null = () => null,
): Promise<MomentProof> {
  if (Platform.OS !== "android" || !engine || !channel)
    throw new Error("Start a solo Android live before running this test.");
  if (active.has(engine) || isMomentRecording(engine))
    throw new Error("A recording is already active. Wait for it to finish.");
  const videoSize = getVideoSize();
  if (!videoSize)
    throw new Error(
      "Video dimensions are not available yet. Wait a few seconds and retry.",
    );
  const watermarkOptions = momentProofWatermarkOptions(videoSize);
  const dir = new Directory(Paths.document, "moment-proof", String(uid));
  dir.create({ intermediates: true, idempotent: true });
  const imagePaths = proofFramesBase64.map((data, index) => {
    // Immutable files: the SDK may decode asynchronously. Never overwrite an
    // image still being read by the native compositor.
    const frame = new File(dir, `${PROOF_REVISION}-${index}.png`);
    if (!frame.exists) frame.write(data, { encoding: "base64" });
    return frame.uri.replace(/^file:\/\//, "");
  });
  const id = `live-gift-proof-${Date.now()}`;
  const file = new File(dir, `${id}.mp4`);
  const row: MomentProof = {
    id,
    ownerUid: uid,
    revision: PROOF_REVISION,
    videoSize,
    placement: watermarkOptions,
    createdAt: new Date().toISOString(),
    status: "running",
    events: [],
  };
  await AsyncStorage.setItem(key(uid), JSON.stringify(row));
  // Recheck after storage: an actual gift may have started a recording meanwhile.
  if (!isCurrent() || active.has(engine) || isMomentRecording(engine)) {
    row.status = "failed";
    row.error = "The live changed or another recording started. Try again.";
    await AsyncStorage.setItem(key(uid), JSON.stringify(row));
    return row;
  }
  const openedAt = Date.now();
  const log = (event: string, code?: number) =>
    row.events.push({
      ms: Date.now() - openedAt,
      event,
      ...(code == null ? {} : { code }),
    });
  return new Promise((resolve) => {
    let recorder: IMediaRecorder | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined,
      stopTimer: ReturnType<typeof setTimeout> | undefined,
      animation: ReturnType<typeof setInterval> | undefined,
      finalize: ReturnType<typeof setTimeout> | undefined;
    let finishing = false,
      done = false,
      watermark = false,
      started = 0,
      reportedDuration = 0;
    let appListener: { remove(): void } | undefined;
    const check = (name: string, code: number) => {
      log(name, code);
      if (code < 0) throw new Error(`${name} failed (${code}).`);
    };
    const finish = (error?: string) => {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      clearTimeout(stopTimer);
      clearTimeout(finalize);
      clearInterval(animation);
      appListener?.remove();
      const cleanupErrors: string[] = [];
      const clean = (name: string, action: () => number | boolean | void) => {
        try {
          const code = action();
          log(name, typeof code === "number" ? code : undefined);
          if (code === false || (typeof code === "number" && code < 0))
            cleanupErrors.push(`${name} (${code})`);
        } catch {
          cleanupErrors.push(name);
        }
      };
      if (!finishing && recorder)
        clean("stop recording", () => recorder!.stopRecording());
      if (recorder)
        clean("destroy recorder", () => engine.destroyMediaRecorder(recorder!));
      // No mixer, video source switch, encoder change, or competing preview.
      if (watermark)
        clean("clear test crown", () => engine.clearVideoWatermarks());
      active.delete(engine);
      if (cleanupErrors.length)
        error = `${error ?? "Test finished."} Could not fully restore: ${cleanupErrors.join(", ")}. End this test live before continuing.`;
      const durationMs =
        reportedDuration || (started ? Date.now() - started : 0);
      try {
        if (
          !error &&
          (!file.exists || !file.size || durationMs < 6500 || durationMs > 8500)
        )
          error = "The recorder did not produce a complete seven-second file.";
        if (file.exists && file.size) {
          row.uri = file.uri;
          row.bytes = file.size;
          row.durationMs = Math.round(durationMs);
        }
      } catch {
        error = error ?? "Could not inspect the captured file.";
      }
      row.status = error ? "failed" : "captured";
      row.error = error;
      log(
        error
          ? "test failed"
          : "raw file captured; visual proof still required",
      );
      void AsyncStorage.setItem(key(uid), JSON.stringify(row))
        .then(() => resolve(row))
        .catch(() =>
          resolve({
            ...row,
            error: "Could not save test details.",
            status: "failed",
          }),
        );
    };
    active.set(engine, (reason) => finish(reason));
    appListener = AppState.addEventListener("change", (state) => {
      if (state !== "active")
        finish("Test interrupted because the app left the foreground.");
    });
    try {
      recorder = engine.createMediaRecorder({
        channelId: channel,
        uid,
        type: 0,
      });
      if (!recorder) throw new Error("This build has no native recorder.");
      check(
        "register recorder observer",
        recorder.setMediaRecorderObserver({
          onRecorderInfoUpdated: (_channel, _uid, info) => {
            reportedDuration = Math.max(reportedDuration, info.durationMs ?? 0);
          },
          onRecorderStateChanged: (_channel, _uid, state, reason) => {
            if (done) return;
            log(`recorder state ${state}`, reason);
            if (state === -1) {
              finish(`Recording failed (${reason}).`);
              return;
            }
            if (state === 2 && !started) {
              started = Date.now();
              clearTimeout(watchdog);
              watchdog = setTimeout(
                () => finish("Recorder did not finish."),
                11000,
              );
              stopTimer = setTimeout(() => {
                try {
                  check("finish seven seconds", recorder!.stopRecording());
                } catch (e) {
                  finish(String(e));
                }
              }, PROOF_LENGTH_MS);
              let previousStage = "";
              let previousFrame: number | null = null;
              log("camera baseline");
              previousStage = "camera baseline";
              animation = setInterval(() => {
                if (done || finishing) return;
                const elapsed = Date.now() - started;
                const stage = proofStage(elapsed);
                if (stage !== previousStage) {
                  previousStage = stage;
                  log(stage);
                }
                try {
                  const frame = proofFrameIndex(elapsed);
                  if (frame === previousFrame) return;
                  previousFrame = frame;
                  if (frame === null) {
                    check(
                      "clear animated crown",
                      engine.clearVideoWatermarks(),
                    );
                    watermark = false;
                  } else {
                    // SDK renders the transparent PNG into the existing camera
                    // track before publication; this is not a playback overlay.
                    watermark = true;
                    const code = engine.addVideoWatermark(
                      imagePaths[frame],
                      watermarkOptions,
                    );
                    if (code < 0)
                      throw new Error(
                        `Camera overlay failed (${code}) during ${stage}.`,
                      );
                    if (stage === "stationary crown")
                      log("stationary crown applied", code);
                  }
                  if (elapsed >= 5200) {
                    clearInterval(animation);
                    animation = undefined;
                  }
                } catch (e) {
                  finish(String(e));
                }
              }, 50);
            }
            if (state === 3 && !finishing) {
              finishing = true;
              clearTimeout(stopTimer);
              clearInterval(animation);
              finalize = setTimeout(() => finish(), 300);
            }
          },
        }),
      );
      if (done) return;
      watchdog = setTimeout(() => finish("Recorder did not start."), 5000);
      check(
        "start native recording",
        recorder.startRecording({
          storagePath: file.uri.replace(/^file:\/\//, ""),
          containerFormat: 1,
          streamType: 3,
          maxDurationMs: PROOF_LENGTH_MS,
          recorderInfoUpdateInterval: 500,
        }),
      );
    } catch (e) {
      finish(e instanceof Error ? e.message : String(e));
    }
  });
}
