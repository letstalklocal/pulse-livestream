import { i18nMock } from "./i18n-mock.mjs";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { unlinkSync } from "node:fs";
const dir = fileURLToPath(new URL("..", import.meta.url));
const output = `${dir}/tests/.player-${randomUUID()}.cjs`;
await build({
  entryPoints: [`${dir}/../mobile/components/MomentPlayer.native.tsx`],
  jsx: "transform",
  tsconfigRaw: { compilerOptions: { jsx: "react" } },
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
  logLevel: "silent",
  plugins: [
    {
      name: "native-player-test",
      setup(b) {
        b.onResolve({filter: /^@\/i18n$/}, args => ({path: args.path, namespace: "i18n"}));
        b.onLoad({filter: /.*/, namespace: "i18n"}, () => ({contents: i18nMock}));
        b.onResolve(
          {
            filter:
              /^(react|react-native|react-native-agora|@\/utils\/agoraState)$/,
          },
          (args) => ({ path: args.path, namespace: "test" }),
        );
        b.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
          contents:
            path === "react"
              ? `export default {createElement: (...args) => args}; export const useEffect = fn => globalThis.h.effect = fn; export const useRef = () => ({current:null}); export const useState = initial => {const i=globalThis.h.states.push(initial)-1; return [initial, v => globalThis.h.states[i]=v]};`
              : path === "react-native"
                ? `export const ActivityIndicator='loading', Text='text', TouchableOpacity='button', View='view';`
                : path === "@/utils/agoraState"
                  ? `export const isBroadcasting=()=>globalThis.h.broadcasting;`
                  : `export const createAgoraRtcEngine=()=>globalThis.h.engine; export const RtcSurfaceView='surface'; export const MediaPlayerState={PlayerStateOpenCompleted:2,PlayerStateFailed:100}; export const VideoSourceType={VideoSourceMediaPlayer:5}; export const RenderModeType={RenderModeFit:2};`,
        }));
      },
    },
  ],
});
const Player = createRequire(import.meta.url)(output).default;
function mount({
  broadcasting = false,
  videoResult = 0,
  playResult = 0,
  observerResult = 0,
  id = 1,
  uri = "file:///moments/reaction.mp4",
} = {}) {
  const calls = [],
    states = [];
  let listener;
  const player = {
    getMediaPlayerId: () => id,
    // Model native delivery: addListener alone does not register a fresh
    // player's observer in the installed SDK.
    addListener() {},
    registerPlayerSourceObserver(observer) {
      calls.push(["register"]);
      if (observerResult >= 0) listener = observer.onPlayerSourceStateChanged;
      return observerResult;
    },
    unregisterPlayerSourceObserver(observer) {
      if (observerResult >= 0)
        assert.equal(observer.onPlayerSourceStateChanged, listener);
      calls.push(["unregister"]);
      return 0;
    },
    open: (url) => {
      calls.push(["open", url]);
      return 0;
    },
    play: () => {
      calls.push(["play"]);
      return playResult;
    },
    stop: () => calls.push(["stop"]),
    removeAllListeners() {},
  };
  globalThis.h = {
    broadcasting,
    states,
    engine: {
      initialize: () => 0,
      enableVideo: () => {
        calls.push(["video"]);
        return videoResult;
      },
      enableLocalVideo: (value) => calls.push(["camera", value]),
      enableLocalAudio: (value) => calls.push(["microphone", value]),
      createMediaPlayer: () => player,
      destroyMediaPlayer: () => calls.push(["destroy"]),
      release: () => calls.push(["release"]),
    },
  };
  Player({ uri });
  const cleanup = globalThis.h.effect();
  return { calls, states, emit: (...args) => listener(...args), cleanup };
}
try {
  let h = mount();
  assert.deepEqual(h.calls, [
    ["video"],
    ["camera", false],
    ["microphone", false],
    ["register"],
    ["open", "/moments/reaction.mp4"],
  ]);
  assert.equal(h.states[2], false);
  h.emit(2, 0);
  assert.equal(h.states[2], true);
  assert.deepEqual(h.calls.at(-1), ["play"]);
  h.cleanup();
  assert.deepEqual(h.calls.slice(-4), [
    ["unregister"],
    ["stop"],
    ["destroy"],
    ["release"],
  ]);
  h.emit(100, -8);
  assert.equal(h.states[1], "");
  h = mount({ playResult: -7 });
  h.emit(2, 0);
  assert.match(h.states[1], /Could not start playback \(-7\)/);
  assert.equal(h.states[2], false);
  h.cleanup();
  h = mount({ videoResult: -4 });
  assert.match(h.states[1], /initialization failed/);
  assert.equal(
    h.calls.some((c) => c[0] === "open"),
    false,
  );
  h.cleanup();
  h = mount({ observerResult: -4 });
  assert.match(h.states[1], /playback callbacks \(-4\)/);
  assert.equal(
    h.calls.some((c) => c[0] === "open"),
    false,
  );
  h.cleanup();
  h = mount({ id: -1 });
  assert.match(h.states[1], /unavailable/);
  h.cleanup();
  h = mount({ uri: "https://example.test/clip?signature=abc" });
  assert.deepEqual(h.calls.at(-1), [
    "open",
    "https://example.test/clip?signature=abc",
  ]);
  h.emit(100, -10);
  assert.match(h.states[1], /Playback failed \(-10\)/);
  h.cleanup();
  h = mount({ broadcasting: true });
  assert.equal(h.calls.length, 0);
  assert.match(h.states[1], /Finish your live/);
  console.log(
    "PASS: video initialization, capture disabled, local/remote paths, playback errors, live guard, cleanup and late callbacks. Native decoding/rendering is mocked.",
  );
} finally {
  unlinkSync(output);
  delete globalThis.h;
}
