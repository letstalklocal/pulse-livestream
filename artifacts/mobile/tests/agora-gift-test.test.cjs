const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const compile = path => ts.transpileModule(fs.readFileSync(require.resolve(path), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const api = {};
vm.runInNewContext(compile('../utils/agoraGiftProbe.ts'), { exports: api });
function fixture() {
  const calls = []; let observer, current = true, result = 0, resourceOpened = false;
  const player = Object.fromEntries(['registerPlayerSourceObserver','unregisterPlayerSourceObserver','setLoopCount','mute','adjustPlayoutVolume','open','play','stop'].map(name => [name, (...args) => { calls.push([name, ...args]); if (name === 'registerPlayerSourceObserver') observer = args[0]; if (['setLoopCount','mute','adjustPlayoutVolume','play'].includes(name) && !resourceOpened) return -3; return result; }]));
  player.getMediaPlayerId = () => 17;
  const engine = { createMediaPlayer() { calls.push(['create']); return player; }, destroyMediaPlayer(p) { assert.equal(p, player); calls.push(['destroy']); return 0; } };
  return { calls, lease: { engine, isCurrent: () => current }, emit: (state, reason = 0) => { if (state === 2) resourceOpened = true; observer.onPlayerSourceStateChanged(state, reason); }, retire() { current = false; }, fail() { result = -1; } };
}
let f = fixture(), opened = 0, ended = 0, errors = [];
const p = api.createAgoraGiftProbe(f.lease, { opened: () => opened++, ended: () => ended++, error: c => errors.push(c) });
p.open('/pumpkin.webm'); assert.equal(opened, 0);
assert.ok(!f.calls.some(c => ['setLoopCount','mute','adjustPlayoutVolume','play'].includes(c[0])), 'No resource-dependent controls before file opens');
assert.throws(() => p.play(), /open pending/);
f.emit(2); assert.equal(opened, 1); p.play();
assert.ok(f.calls.some(c => c[0] === 'setLoopCount' && c[1] === 0));
assert.ok(f.calls.some(c => c[0] === 'mute' && c[1] === false));
f.emit(5); f.emit(6); assert.equal(ended, 1); f.emit(100, -4); assert.deepEqual(errors, [-4]);
p.dispose(); p.dispose(); f.emit(2); assert.equal(opened, 1);
assert.equal(f.calls.filter(c => c[0] === 'destroy').length, 1);
f = fixture(); const retired = api.createAgoraGiftProbe(f.lease, { opened() { throw Error('Stale callback'); }, ended() {}, error() {} });
f.retire(); f.emit(2); retired.play(); retired.dispose(); assert.ok(!f.calls.some(c => ['play','stop','destroy'].includes(c[0])));
assert.throws(() => api.createAgoraGiftProbe(f.lease, {}), /unavailable/);
f = fixture(); f.fail(); assert.throws(() => api.createAgoraGiftProbe(f.lease, {}), /registerPlayerSourceObserver error/);
assert.ok(f.calls.some(c => c[0] === 'destroy'), 'Partial setup cleans its own player');

(async () => {
  f = fixture(); const slots = []; let cursor = 0, effects = [], done = 0, background;
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef: initial => slots[cursor++] ??= { current: initial },
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => slots[i] = next]; },
    useEffect: effect => effects.push(effect) };
  const mod = { exports: {} };
  vm.runInNewContext(compile('../components/AgoraGiftTest.ios.tsx'), { exports: mod.exports, module: mod, require(id) {
    if (id === 'react') return react;
    if (id === 'react-native') return { View: 'View', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { absoluteFill: {}, create: x => x },
      TurboModuleRegistry: { get: name => { assert.equal(name, 'AgoraRtcNg'); return {}; } },
      AppState: { addEventListener(_, fn) { background = fn; return { remove() {} }; } } };
    if (id === 'react-native-agora') return { RtcSurfaceView: 'Canvas', VideoSourceType: { VideoSourceMediaPlayer: 5 }, RenderModeType: { RenderModeFit: 2 } };
    if (id === '@/utils/agoraGiftProbe') return api;
    if (id === '@/i18n') return { useAppLanguage: () => ({ t: x => x }) };
    if (id === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 20 }) };
    if (id === 'expo-asset') return { Asset: { fromModule: () => ({ localUri: 'file:///pumpkin.webm', downloadAsync: async () => {} }) } };
    if (id.endsWith('PumpkinBrute_march_9x16.webm')) return 42;
    throw Error(id);
  } });
  const nodes = v => Array.isArray(v) ? v.flatMap(nodes) : v && typeof v === 'object' ? [v, ...nodes(v.props?.children)] : [];
  const render = () => { cursor = 0; effects = []; return mod.exports.AgoraGiftTest({ getEngine: () => f.lease, onDone: () => done++ }); };
  render(); const cleanup = effects[0](); await new Promise(setImmediate);
  assert.ok(f.calls.some(c => c[0] === 'open' && c[1] === '/pumpkin.webm'));
  let tree = render(), canvas = nodes(tree).find(n => n.type === 'Canvas');
  assert.equal(canvas.props.canvas.mediaPlayerId, 17); assert.equal(canvas.props.canvas.enableAlphaMask, true);
  assert.equal(canvas.props.canvas.sourceType, 5); assert.equal(canvas.props.style[1].backgroundColor, 'transparent');
  assert.ok(!nodes(tree).some(n => n.type === 'Spinner'));
  f.emit(2); render(); effects[1](); assert.ok(f.calls.some(c => c[0] === 'play'));
  f.emit(6); assert.equal(done, 1);
  background('inactive'); assert.equal(done, 2); cleanup();
  assert.equal(f.calls.filter(c => c[0] === 'destroy').length, 1);
  const fallback = {};
  vm.runInNewContext(compile('../components/AgoraGiftTest.tsx'), { exports: fallback, require() { throw Error('Other platforms must not import native Agora'); } });
  assert.equal(fallback.AgoraGiftTest({}), null);
  console.log('PASS: existing-engine-only Agora probe, audible one-shot alpha canvas, open-before-play, no spinner/payment/publication/engine lifecycle mutations, stale lease and own-player cleanup. Native iOS decoding/transparency pending.');
})().catch(error => { console.error(error); process.exitCode = 1; });
