const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require.resolve('../components/VideoManagementPreview.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
function harness() {
  const slots = [], timers = new Map(); let index = 0, dirty = false, appState, resolve, signal, reads = 0, releases = 0, tree, active = true;
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const i = index++; slots[i] ??= { value: initial }; return [slots[i].value, next => { const value = typeof next === 'function' ? next(slots[i].value) : next; dirty ||= !Object.is(value, slots[i].value); slots[i].value = value; }]; },
    useRef: initial => slots[index++] ??= { current: initial },
    useEffect: (setup, deps) => { const i = index++, old = slots[i]; if (!old || deps.some((v, n) => v !== old.deps[n])) slots[i] = { setup, deps, cleanup: old?.cleanup, pending: true }; },
  };
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, AbortController, Date,
    setTimeout: (fn, ms) => { const id = timers.size + 1; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    require: id => {
      if (id === 'react') return react;
      if (id === 'react-native') return { ...Object.fromEntries(['ActivityIndicator','Image','Text','TouchableOpacity','View'].map(x => [x,x])), Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: (_, fn) => { appState = fn; return { remove() {} }; } }, StyleSheet: { create: x => x, absoluteFill: {} } };
      if (id === 'expo') return { requireOptionalNativeModule: () => ({}) };
      if (id === '@/i18n') return { useAppLanguage: () => ({ t: x => x }) };
      if (id === './CachedVideoPlayer') return { default: 'Player' };
      if (id === '@/utils/videoCache/core') return { VIDEO_CACHE_TTL_MS: 86400000 };
      if (id === '@/utils/videoCache') return { videoCache: { acquire: (_key, _url, s) => { reads++; signal = s; return new Promise(yes => resolve = yes); } } };
      return new Proxy({}, { get: (_, k) => k });
    } });
  function render() {
    do {
      dirty = false; index = 0;
      tree = mod.exports.VideoManagementPreview({ video: { id: 'clip', playbackUrl: 'https://test/video.mp4', thumbnailUrl: 'poster' }, active, onExpand() {} });
      for (const hook of slots) if (hook.pending) { hook.cleanup?.(); hook.pending = false; hook.cleanup = hook.setup(); }
    } while (dirty);
    const nodes = []; function walk(n) { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== 'object') return; nodes.push(n); walk(n.props?.children); } walk(tree);
    return { button: label => nodes.find(n => n.type === 'TouchableOpacity' && n.props.accessibilityLabel === label), player: nodes.find(n => n.type === 'Player') };
  }
  return { render, reads: () => reads, releases: () => releases, timers, resolve: () => resolve({ uri: 'file:///clip.mp4', createdAt: Date.now(), release: async () => { releases++; } }), signal: () => signal, background: () => appState('background'), inactive: () => { active = false; }, unmount: () => slots.forEach(s => s.cleanup?.()) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  const h = harness(); let v = h.render(); assert.equal(h.reads(), 0, 'poster does not download before Play');
  v.button('Play').props.onPress(); v = h.render(); assert.equal(h.reads(), 1); assert.equal(v.player, undefined);
  h.resolve(); await flush(); v = h.render(); assert.equal(v.player.props.uri, 'file:///clip.mp4'); assert.equal(v.player.props.paused, false);
  v.button('Pause').props.onPress(); v = h.render(); assert.equal(v.player.props.paused, true);
  v.button('Play').props.onPress(); v = h.render(); assert.equal(v.player.props.paused, false); assert.equal(h.reads(), 1, 'pause/resume retains the cache lease');
  h.background(); v = h.render(); assert.equal(v.player, undefined); assert.equal(h.releases(), 1); assert.equal(h.timers.size, 0); h.unmount();
  const late = harness(); late.render().button('Play').props.onPress(); late.render(); late.unmount();
  assert.equal(late.signal().aborted, true); late.resolve(); await flush(); assert.equal(late.releases(), 1, 'late cache completion releases after tab/close');
  const expiry = harness(); expiry.render().button('Play').props.onPress(); expiry.render(); expiry.resolve(); await flush(); expiry.render();
  [...expiry.timers.values()][0].fn(); assert.equal(expiry.render().player, undefined); assert.equal(expiry.releases(), 1); expiry.unmount();
  console.log('PASS: management preview downloads on Play, retains paused playback, stops/releases on background, expiry and close, and disposes late leases. Native player mocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
