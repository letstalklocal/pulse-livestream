import assert from "node:assert/strict";
import { mock } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const dir = fileURLToPath(new URL("..", import.meta.url)),
  output = `${dir}/tests/.proof-${randomUUID()}.cjs`;
await build({
  stdin: {
    contents: `export * from '../mobile/utils/momentProof.native'; export * from '../mobile/utils/momentProofConfig'; export * from '../mobile/utils/momentProofFrames';`,
    resolveDir: dir,
  },
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
  logLevel: "silent",
  plugins: [
    {
      name: "proof-native",
      setup(b) {
        b.onResolve(
          {
            filter:
              /^(react-native|expo-file-system|@react-native-async-storage\/async-storage|\.\/momentRecorder)$/,
          },
          (a) => ({ path: a.path, namespace: "mock" }),
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({
          contents:
            path === "react-native"
              ? `export const Platform={OS:'android'},AppState={addEventListener:(_event,callback)=>{globalThis.h.background=callback;return {remove(){globalThis.h.removed=true}}}};`
              : path === "expo-file-system"
                ? `export const Paths={document:'file:///test'};export class Directory{constructor(...parts){this.uri=parts.map(x=>x.uri??x).join('/')}create(){}static async pickDirectoryAsync(){return new Directory('content://export')}};export class File{constructor(...parts){this.uri=parts.map(x=>x.uri??x).join('/')}get exists(){return true}get size(){return globalThis.h.fileSize??1024}write(){}copy(file){globalThis.h.exported=[this.uri,file.uri]}};`
                : path === "./momentRecorder"
                  ? `export const isMomentRecording=()=>!!globalThis.h.realRecording;`
                  : `export default {async getItem(key){return globalThis.h.saved.get(key)??null},async setItem(key,value){globalThis.h.saved.set(key,value)}};`,
        }));
      },
    },
  ],
});
const {
  startMomentProof,
  stopMomentProof,
  latestMomentProof,
  exportMomentProof,
  momentProofWatermarkOptions,
  proofFrameIndex,
  proofFramesBase64,
} = createRequire(import.meta.url)(output);
mock.timers.enable({
  apis: ["setTimeout", "setInterval", "Date"],
  now: 100000,
});
function engine(mode = "ok") {
  const calls = [],
    frames = [];
  let observer;
  globalThis.h = { saved: new Map(), calls };
  const recorder = {
    setMediaRecorderObserver(o) {
      observer = o;
      return mode === "observer-error" ? -4 : 0;
    },
    startRecording(config) {
      assert.equal(config.maxDurationMs, 7000);
      calls.push("record");
      if (mode === "start-error") return -4;
      if (mode !== "timeout")
        observer.onRecorderStateChanged("live", 123, 2, 0);
      return 0;
    },
    stopRecording() {
      calls.push("stop-record");
      observer.onRecorderInfoUpdated("live", 123, { durationMs: 7000 });
      observer.onRecorderStateChanged("live", 123, 3, 0);
      return 0;
    },
  };
  const forbidden = () => {
    assert.fail(
      "Test must not change the mixer, encoder, publication, or preview",
    );
  };
  return {
    calls,
    frames,
    startLocalVideoTranscoder: forbidden,
    updateLocalTranscoderConfiguration: forbidden,
    stopLocalVideoTranscoder: forbidden,
    updateChannelMediaOptions: forbidden,
    setVideoEncoderConfiguration: forbidden,
    startPreview: forbidden,
    stopPreview: forbidden,
    addVideoWatermark(path, options) {
      frames.push({ path, options, at: Date.now() });
      calls.push("watermark");
      assert.equal(options.visibleInPreview, true);
      return mode === "watermark-error" ||
        (mode === "animate-error" && frames.length > 1)
        ? -4
        : 0;
    },
    clearVideoWatermarks() {
      calls.push("clear-watermark");
      return mode === "clear-error" ? -4 : 0;
    },
    createMediaRecorder() {
      return mode === "no-recorder" ? undefined : recorder;
    },
    destroyMediaRecorder() {
      calls.push("destroy");
      return 0;
    },
    nativeError() {
      observer.onRecorderStateChanged("live", 123, -1, 2);
    },
    lateState() {
      observer.onRecorderStateChanged("live", 123, 3, 0);
    },
  };
}
async function begin(e, current = () => true) {
  const promise = startMomentProof(e, "live", 123, current, () => ({
    width: 960,
    height: 540,
  }));
  await Promise.resolve();
  await Promise.resolve();
  return { promise };
}
const tick = (n) => {
  for (let i = 0; i < n; i += 50) mock.timers.tick(Math.min(50, n - i));
};
try {
  let e = engine(),
    r = await begin(e);
  await assert.rejects(startMomentProof(e, "live", 123), /already active/);
  tick(950);
  assert.equal(
    e.frames.length,
    0,
    "camera baseline must have no overlay calls",
  );
  tick(50);
  assert.equal(e.frames.length, 1);
  assert.match(e.frames[0].path, /-20.png$/);
  tick(1950);
  assert.equal(e.frames.length, 1, "stationary crown must not keep reloading");
  tick(50);
  assert.equal(e.frames.length, 2, "animation starts only at three seconds");
  tick(2200);
  assert.equal(e.calls.at(-1), "clear-watermark");
  const frameCount = e.frames.length;
  assert.ok(frameCount > 20);
  assert.ok(new Set(e.frames.map((f) => f.path)).size > 20);
  for (const frame of e.frames)
    assert.deepEqual(
      frame.options,
      momentProofWatermarkOptions({ width: 960, height: 540 }),
    );
  tick(1800);
  mock.timers.tick(300);
  let row = await r.promise;
  assert.equal(row.status, "captured");
  assert.equal(row.revision, "live-crown-hd-v1");
  assert.equal(row.durationMs, 7000);
  assert.deepEqual(row.placement, momentProofWatermarkOptions(row.videoSize));
  assert.equal(e.frames.length, frameCount);
  assert.deepEqual(
    row.events
      .filter((event) =>
        [
          "camera baseline",
          "stationary crown",
          "animated crown",
          "camera after crown",
        ].includes(event.event),
      )
      .map((event) => event.event),
    [
      "camera baseline",
      "stationary crown",
      "animated crown",
      "camera after crown",
    ],
  );
  assert.equal((await latestMomentProof(123)).id, row.id);
  await exportMomentProof(row);
  assert.equal(globalThis.h.exported[0], row.uri);
  const count = e.calls.length;
  e.lateState();
  mock.timers.tick(20000);
  assert.equal(e.calls.length, count);
  for (const mode of [
    "no-recorder",
    "observer-error",
    "start-error",
    "timeout",
    "watermark-error",
    "animate-error",
    "clear-error",
  ]) {
    e = engine(mode);
    r = await begin(e);
    tick(7300);
    row = await r.promise;
    assert.equal(row.status, "failed", mode);
    assert.ok(row.error, mode);
    if (["watermark-error", "animate-error", "clear-error"].includes(mode))
      assert.ok(e.calls.includes("clear-watermark"));
  }
  for (const interruption of ["gift", "background", "native"]) {
    e = engine();
    r = await begin(e);
    tick(1500);
    if (interruption === "gift") stopMomentProof(e, "A real gift arrived");
    if (interruption === "background") globalThis.h.background("background");
    if (interruption === "native") e.nativeError();
    row = await r.promise;
    assert.equal(row.status, "failed");
    assert.ok(e.calls.includes("clear-watermark"));
    const before = e.calls.length;
    tick(10000);
    assert.equal(e.calls.length, before);
  }
  e = engine();
  globalThis.h.realRecording = true;
  await assert.rejects(startMomentProof(e, "live", 123), /already active/);
  assert.equal(e.calls.length, 0);
  e = engine();
  r = await begin(e, () => false);
  assert.equal((await r.promise).status, "failed");
  assert.equal(e.calls.length, 0);
  e = engine();
  globalThis.h.fileSize = 0;
  r = await begin(e);
  tick(7300);
  assert.equal((await r.promise).status, "failed");
  assert.equal(proofFrameIndex(999), null);
  assert.equal(proofFrameIndex(1000), 20);
  assert.equal(proofFrameIndex(2999), 20);
  assert.equal(proofFrameIndex(3000), 0);
  assert.equal(proofFrameIndex(5150), 43);
  assert.equal(proofFrameIndex(5200), null);
  for (const video of [
    { width: 960, height: 540 },
    { width: 540, height: 960 },
    { width: 640, height: 480 },
    { width: 360, height: 640 },
  ]) {
    const options = momentProofWatermarkOptions(video);
    const oldWidth =
      Math.max(
        1,
        Math.floor(
          Math.min(128, Math.min(video.width, video.height) * 0.24) / 3,
        ),
      ) * 3;
    assert.equal(
      (options.positionInPortraitMode.width * 280) / 384,
      (2 * oldWidth * 140) / 192,
    );
    assert.equal(options.mode, 0);
    assert.equal(options.watermarkRatio, undefined);
    const short = Math.min(video.width, video.height),
      long = Math.max(video.width, video.height);
    for (const [r, width, height] of [
      [options.positionInPortraitMode, short, long],
      [options.positionInLandscapeMode, long, short],
    ]) {
      assert.ok(Math.abs(r.x + r.width / 2 - width / 2) <= 0.5);
      assert.ok(Math.abs(r.y + (r.height * 384) / 576 - height / 2) <= 0.5);
      assert.equal(r.width / r.height, 384 / 576);
      assert.ok(r.x >= 0 && r.y >= 0);
      assert.ok(r.x + r.width <= width && r.y + r.height <= height);
      assert.ok(
        (r.width * 280) / 384 <= 184,
        "visible crown must not grow beyond the doubled size cap",
      );
    }
  }
  assert.throws(
    () => momentProofWatermarkOptions({ width: 0, height: 0 }),
    /dimensions/,
  );
  e = engine();
  await assert.rejects(startMomentProof(e, "live", 123), /dimensions/);
  assert.equal(e.calls.length, 0);
  // Decode real effect PNGs, separately from mocked native lifecycle checks.
  const alpha = [];
  for (const index of [0, 20, 40, 43]) {
    const png = Buffer.from(proofFramesBase64[index], "base64");
    assert.equal(png.readUInt32BE(16), 384);
    assert.equal(png.readUInt32BE(20), 576);
    assert.equal(png[25], 6, "must be RGBA, not an opaque/paletted sprite");
    const rgba = execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        "pipe:0",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "pipe:1",
      ],
      { input: png, maxBuffer: 1024 * 1024 },
    );
    let sum = 0,
      max = 0;
    for (let pixel = 0; pixel < 384 * 576; pixel++) {
      const a = rgba[pixel * 4 + 3];
      sum += a;
      max = Math.max(max, a);
      const x = pixel % 384,
        y = Math.floor(pixel / 384);
      if (x === 0 || x === 383 || y === 0 || y === 575)
        assert.equal(a, 0, "sprite perimeter must remain fully transparent");
    }
    alpha.push({ sum, max });
  }
  assert.equal(alpha[0].sum, 0);
  assert.equal(alpha[1].max, 255);
  assert.ok(alpha[2].max < alpha[1].max);
  assert.ok(alpha[3].max < alpha[2].max);
  assert.ok(
    alpha[3].sum < alpha[2].sum,
    "fade is encoded in image alpha, not the mixer layer",
  );

  console.log(
    "PASS: staged camera baseline/still/animated crown, no mixer/publication/encoder/preview changes, seven-second capture, unchanged raw export, native failures and cancellation cleanup. Real PNG alpha decoded; native video capture requires device verification.",
  );
} finally {
  mock.timers.reset();
  unlinkSync(output);
  delete globalThis.h;
}
