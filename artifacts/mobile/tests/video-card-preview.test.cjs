const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../components/VideoCardPreview.tsx'), 'utf8') + '\nexport { PreviewSession };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
function harness() {
  const values = [], refs = [], timers = new Map();
  let index = 0, ri = 0, effect, cleanup, resolve, rejects, timerId = 0, releases = 0, signal;
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const i = index++; if (!(i in values)) values[i] = initial; return [values[i], value => { values[i] = value; }]; },
    useRef: initial => refs[ri++] ??= { current: initial }, useEffect: fn => { effect = fn; }, useCallback: fn => fn };
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, AbortController, Date,
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    require: id => {
      if (id === 'react') return react;
      if (id === 'react-native') return { AppState: { currentState: 'active' }, Platform: { OS: 'android' }, View: 'View', StyleSheet: { absoluteFill: {} } };
      if (id === 'expo') return { requireOptionalNativeModule: () => ({}) };
      if (id === 'expo-router') return { useIsFocused: () => true };
      if (id === '@/context/LivePlaybackContext') return { useLivePlayback: () => ({ previewsBlocked: true }) };
      if (id === './CachedVideoPlayer') return { default: 'Player' };
      if (id === '@/utils/videoCache/core') return { VIDEO_CACHE_TTL_MS: 86400000 };
      if (id === '@/utils/videoCache') return { videoCache: { acquire: (_key, _url, s) => { signal = s; return new Promise((yes, no) => { resolve = yes; rejects = no; }); } } };
      throw Error(id);
    } });
  function render() { index = ri = 0; return mod.exports.PreviewSession({ url: 'https://test/clip.mp4' }); }
  render(); cleanup = effect();
  return { card: visible => { values.length = 0; index = ri = 0; return mod.exports.VideoCardPreview({ url: 'https://test/clip.mp4', isVisible: visible }); }, render, timers, done: () => values[1], cleanup: () => cleanup(), signal: () => signal,
    resolve: () => resolve({ uri: 'file:///clip.mp4', createdAt: Date.now(), release: async () => { releases++; } }),
    reject: () => rejects(Error('offline')), releases: () => releases };
}
(async () => {
  let h = harness();
  assert.equal(h.render(), null, 'poster remains while downloading');
  assert.ok(![...h.timers.values()].some(t => t.ms === 5000), 'download time does not consume preview');
  h.resolve(); await Promise.resolve();
  assert.equal(h.render().props.style[1].opacity, 0, "cached file readiness must not hide the poster before the first decoded frame");
  const player = h.render().props.children[0];
  assert.equal(player.props.muted, true); assert.equal(player.props.keepAwake, false);
  player.props.onFirstFrame(); player.props.onFirstFrame();
  assert.equal(h.render().props.style[1].opacity, 1, "first frame reveals the preview");
  const previewTimers = [...h.timers.values()].filter(t => t.ms === 5000);
  assert.equal(previewTimers.length, 1, 'looped frame callbacks cannot extend the preview');
  previewTimers[0].fn(); assert.equal(h.render(), null, 'five seconds returns to poster'); h.cleanup();
  assert.equal(h.releases(), 1); assert.equal(h.timers.size, 0);
  h = harness(); h.cleanup(); assert.equal(h.signal().aborted, true);
  h.resolve(); await Promise.resolve(); assert.equal(h.releases(), 1, 'late cache lease is released after scrolling away'); assert.equal(h.render(), null);
  h = harness(); h.reject(); await Promise.resolve(); await Promise.resolve(); assert.equal(h.done(), true); h.cleanup();
  h = harness(); assert.equal(h.done(), false, 'new visible entry gets a fresh preview'); h.cleanup();
  h = harness(); h.cleanup();
  assert.ok(h.card(true), 'cached video preview remains available while live PiP blocks Agora previews');
  assert.equal(h.card(false), null, 'offscreen recorded previews remain stopped');
  console.log('PASS: preview waits for first frame, stays muted, stops after five seconds, releases on exit/late download/error and resets for a new entry.');
})().catch(error => { console.error(error); process.exitCode = 1; });
