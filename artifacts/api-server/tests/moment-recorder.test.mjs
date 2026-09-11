import assert from "node:assert/strict";
import { mock } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { unlinkSync } from "node:fs";
const dir = fileURLToPath(new URL("..", import.meta.url)),
  out = `${dir}/tests/.record-${randomUUID()}.cjs`;
await build({
  stdin: {
    contents: `export * from '../mobile/utils/momentRecorder.native'; export {rows,uploads} from './moments';`,
    resolveDir: dir,
  },
  outfile: out,
  bundle: true,
  platform: "node",
  format: "cjs",
  logLevel: "silent",
  plugins: [
    {
      name: "native",
      setup(b) {
        b.onResolve(
          {
            filter:
              /^(react-native|expo-file-system|\.\/moments|\.\/momentGiftAssets.native)$/,
          },
          (a) => ({ path: a.path, namespace: "mock" }),
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({
          contents:
            path === "react-native"
              ? `export const Platform={OS:'android'},AppState={addEventListener:(_,cb)=>{globalThis.background=cb;return {remove(){}}}};`
              : path === "expo-file-system"
                ? `export const Paths={document:'file:///test'};export class Directory{create(){}};export class File{uri='file:///test/clip.mp4';exists=true;size=1024;delete(){this.exists=false}};`
                : path === "./momentGiftAssets.native"
                  ? `export const prepareMomentGiftSound=()=>'/default-gift.wav';export const prepareMomentGiftAssets=()=>Array.from({length:44},(_,i)=>'/frame-'+i+'.png');`
                  : `export const rows=[],uploads=[];export async function saveLocalMoment(m){rows.push(m)};export async function uploadMoment(m){uploads.push(m)}`,
        }));
      },
    },
  ],
});
const {
  recordGiftMoment,
  stopMomentRecording,
  isMomentRecording,
  rows,
  uploads,
} = createRequire(import.meta.url)(out);
mock.timers.enable({
  apis: ["Date", "setTimeout", "setInterval"],
  now: 100000,
});
const token = async () => "token";
const gift = (giftId, amount = 500) => ({
  giftId,
  amount,
  recipientUid: 123,
  giftName: "Crown",
});
const options = (events = []) => ({
  getVideoSize: () => ({ width: 960, height: 540 }),
  onGiftVisible: () => events.push("visible"),
  onVisualState: (v) => events.push(v),
  onFallback: () => events.push("fallback"),
});
function engine(mode = "ok") {
  let observer;
  const calls = [];
  const forbidden = () =>
    assert.fail("Do not change the camera, encoder, mixer or published source");
  const recorder = {
    setMediaRecorderObserver(o) {
      observer = o;
      return mode === "observer-error" ? -4 : 0;
    },
    startRecording(c) {
      calls.push("record");
      assert.equal(c.maxDurationMs, 7000);
      if (mode === "error") return -4;
      if (mode !== "timeout")
        observer.onRecorderStateChanged("live", 123, 2, 0);
      return 0;
    },
    stopRecording() {
      calls.push("stop");
      observer.onRecorderInfoUpdated("live", 123, { durationMs: 7000 });
      observer.onRecorderStateChanged("live", 123, 3, 0);
      return 0;
    },
  };
  return {
    calls,
    createMediaRecorder: () => recorder,
    destroyMediaRecorder() {
      calls.push("destroy");
      return 0;
    },
    addVideoWatermark(p, o) {
      calls.push("frame");
      assert.ok(p.startsWith("/frame-"));
      assert.equal(o.visibleInPreview, true);
      return mode === "watermark-error" ? -4 : 0;
    },
    clearVideoWatermarks() {
      calls.push("clear");
      return 0;
    },
    playEffect(id, path, loops, pitch, pan, gain, publish, start) {
      calls.push("sound");
      assert.deepEqual([id, path, loops, pitch, pan, gain, publish, start],
        [731001, '/default-gift.wav', 0, 1, 0, 65, true, 0]);
      if (mode === "sound-throw") throw new Error("audio unavailable");
      return mode === "sound-error" ? -4 : 0;
    },
    stopEffect(id) {
      assert.equal(id, 731001);
      calls.push("sound-stop");
      return 0;
    },
    muteLocalAudioStream: forbidden,
    stopAllEffects: forbidden,
    setVideoEncoderConfiguration: forbidden,
    startLocalVideoTranscoder: forbidden,
    updateChannelMediaOptions: forbidden,
    late() {
      observer.onRecorderStateChanged("live", 123, 3, 0);
    },
  };
}
const tick = (n) => {
  for (let i = 0; i < n; i += 50) mock.timers.tick(Math.min(50, n - i));
};
try {
  const e = engine(),
    events = [];
  assert.equal(
    recordGiftMoment(e, "live", gift("small", 499), token, options()),
    false,
  );
  assert.equal(e.calls.length, 0);
  assert.equal(
    recordGiftMoment(e, "live", gift("first"), token, options(events)),
    true,
  );
  assert.deepEqual(e.calls, ["record"]);
  assert.ok(isMomentRecording(e));
  recordGiftMoment(e, "live", gift("first"), token, options());
  assert.equal(rows.length, 1);
  recordGiftMoment(e, "live", gift("overlap"), token, options());
  assert.match(rows.at(-1).error, /Another reaction/);
  tick(50);
  assert.deepEqual(e.calls, ["record", "frame", "sound"]);
  assert.equal(events.filter((v) => v === "visible").length, 1);
  tick(2150);
  assert.equal(e.calls.at(-1), "clear");
  assert.equal(uploads.length, 0);
  tick(4800);
  tick(300);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].captureMode, "live-gift-v1");
  assert.equal(uploads[0].durationMs, 7000);
  assert.equal(uploads[0].uri, "file:///test/clip.mp4");
  assert.equal(isMomentRecording(e), false);
  assert.equal(e.calls.filter(c => c === "sound").length, 1);
  assert.equal(e.calls.filter(c => c === "sound-stop").length, 1);
  e.late();
  assert.equal(uploads.length, 1);
  for (const mode of [
    "error",
    "observer-error",
    "watermark-error",
    "timeout",
  ]) {
    const b = engine(mode),
      ev = [];
    recordGiftMoment(b, "live", gift(mode), token, options(ev));
    tick(5500);
    assert.equal(rows.at(-1).status, "failed");
    assert.equal(uploads.length, 1);
    assert.equal(isMomentRecording(b), false);
    assert.ok(ev.includes("fallback"));
    assert.ok(!b.calls.includes("sound"));
  }
  const b = engine();
  recordGiftMoment(b, "live", gift("background"), token, options());
  tick(50);
  globalThis.background("background");
  assert.equal(b.calls.at(-2), "clear");
  assert.match(rows.at(-1).error, /foreground/);
  assert.ok(b.calls.includes("sound-stop"));
  const c = engine();
  recordGiftMoment(c, "live", gift("cancel"), token, options());
  tick(50);
  stopMomentRecording(c);
  assert.match(rows.at(-1).error, /Stream ended/);
  assert.ok(c.calls.includes("sound-stop"));
  assert.equal(uploads.length, 1);
  const d = engine();
  recordGiftMoment(d, "live", gift("missing"), token, {
    getVideoSize: () => null,
  });
  assert.equal(d.calls.length, 0);
  for (const mode of ["sound-error", "sound-throw"]) {
    const audioEngine = engine(mode);
    const previousUploads = uploads.length;
    recordGiftMoment(audioEngine, "live", gift(mode), token, options());
    tick(7300);
    assert.equal(uploads.length, previousUploads + 1, "Sound failure must preserve the video");
    assert.equal(audioEngine.calls.filter(c => c === "sound").length, 1);
    assert.ok(audioEngine.calls.includes("sound-stop"));
  }
  console.log(
    "PASS: qualifying gift starts recording before live animation; single native overlay, unchanged raw upload, seven seconds, dedup/overlap, native failures, background, teardown and late callbacks. Published sound plays once after recording/first frame, scoped sound cleanup and nonfatal audio failures. Agora rendering/audio are mocked.",
  );
} finally {
  mock.timers.reset();
  unlinkSync(out);
  delete globalThis.background;
}
