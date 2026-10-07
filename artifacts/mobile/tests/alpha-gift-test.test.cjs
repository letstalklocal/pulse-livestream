const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const compile = file => ts.transpileModule(fs.readFileSync(require.resolve(file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const flatten = value => Array.isArray(value) ? value.flatMap(flatten) : value && typeof value === 'object' ? [value, ...flatten(value.props?.children)] : [];
function fixture({ available = true, delayed = false } = {}) {
  const slots = []; let cursor = 0, effects = [], done = 0, background, resolveDownload, downloads = 0, viewLoads = 0;
  const pending = delayed ? new Promise(resolve => { resolveDownload = resolve; }) : Promise.resolve();
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef: initial => slots[cursor++] ??= { current: initial },
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => slots[i] = next]; },
    useEffect: effect => effects.push(effect) };
  const mod = { exports: {} };
  vm.runInNewContext(compile('../components/AlphaPlayerGiftTest.ios.tsx'), { exports: mod.exports, module: mod, require(id) {
    if (id === 'react') return react;
    if (id === 'react-native') return { View: 'View', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { absoluteFill: {}, create: x => x },
      AppState: { addEventListener(_, fn) { background = fn; return { remove() {} }; } } };
    if (id === 'expo') return { requireOptionalNativeModule(name) { assert.equal(name, 'PulseAlphaPlayer'); return available ? {} : null; },
      requireNativeView(name) { assert.equal(name, 'PulseAlphaPlayer'); viewLoads++; return 'AlphaCanvas'; } };
    if (id === '@/i18n') return { useAppLanguage: () => ({ t: x => x }) };
    if (id === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 20 }) };
    if (id === 'expo-asset') return { Asset: { fromModule: () => ({ localUri: 'file:///pumpkin.mp4', downloadAsync: () => { downloads++; return pending; } }) } };
    if (id.endsWith('pumpkin.compact-crf26.mp4')) return 42;
    throw Error(`Unexpected dependency: ${id}`);
  } });
  const render = () => { cursor = 0; effects = []; return flatten(mod.exports.AlphaPlayerGiftTest({ onDone: () => done++ })); };
  render(); const cleanup = effects[0]();
  return { render, cleanup, background: () => background('background'), release: () => resolveDownload(), get done() { return done; },
    get downloads() { return downloads; }, get viewLoads() { return viewLoads; } };
}
(async () => {
  const tick = () => new Promise(setImmediate);
  let f = fixture(); await tick();
  let nodes = f.render(), canvas = nodes.find(n => n.type === 'AlphaCanvas');
  assert.equal(canvas.props.source, 'file:///pumpkin.mp4');
  assert.ok(!nodes.some(n => /Spinner|ActivityIndicator/.test(String(n.type))), 'No startup spinner');
  assert.ok(nodes.some(n => n.props.pointerEvents === 'none'), 'Animation remains touch-through');
  canvas.props.onFinish(); canvas.props.onFinish(); assert.equal(f.done, 1, 'Completion is one-shot');
  assert.ok(!f.render().some(n => n.type === 'AlphaCanvas')); f.cleanup();
  f = fixture(); await tick(); nodes = f.render(); nodes.find(n => n.props.testID === 'alpha-gift-test-close').props.onPress();
  assert.equal(f.done, 1); assert.ok(!f.render().some(n => n.type === 'AlphaCanvas')); f.cleanup();
  f = fixture(); await tick(); f.background(); assert.equal(f.done, 1); assert.ok(!f.render().some(n => n.type === 'AlphaCanvas')); f.cleanup();
  f = fixture(); await tick(); f.render().find(n => n.type === 'AlphaCanvas').props.onError({ nativeEvent: { message: 'decoder failure' } });
  assert.ok(!f.render().some(n => n.type === 'AlphaCanvas')); assert.equal(f.done, 0, 'Error stays visible until Close'); f.cleanup();
  f = fixture({ delayed: true }); f.cleanup(); f.release(); await tick();
  assert.ok(!f.render().some(n => n.type === 'AlphaCanvas'), 'Late asset completion cannot restart an unmounted player');
  f = fixture({ available: false }); await tick();
  assert.equal(f.viewLoads, 0); assert.equal(f.downloads, 0); assert.ok(!f.render().some(n => n.type === 'AlphaCanvas')); f.cleanup();
  const fallback = {};
  vm.runInNewContext(compile('../components/AlphaPlayerGiftTest.tsx'), { exports: fallback, require() { throw Error('Other platforms must not import native code'); } });
  assert.equal(fallback.AlphaPlayerGiftTest({}), null);

  const { addAlphaPlayerPod } = require('../plugins/withAlphaPlayer');
  const podfile = "target 'mobile' do\n  use_expo_modules!\nend\n";
  const patched = addAlphaPlayerPod(podfile);
  assert.match(patched, /81718c140b4503733a96f9ebc6072ad81894cc01/);
  assert.equal(addAlphaPlayerPod(patched), patched, 'Native plugin is idempotent');
  assert.throws(() => addAlphaPlayerPod('no target'), /not found/);
  const host = fs.readFileSync(require.resolve('../modules/pulse-alpha-player/ios/PPAlphaPlayerHost.m'), 'utf8');
  assert.match(host, /MTLClearColorMake\(0, 0, 0, 0\)/);
  assert.match(host, /AVMutableComposition/);
  assert.match(host, /metalView != host.alphaView/);
  assert.doesNotMatch(host.replace(/\/\/[^\n]*/g, ''), /setCategory:|setActive:|Agora|dispatch_after|scheduledTimer/);
  console.log('PASS: isolated iOS AlphaPlayer preview, old-build guard, local asset, no spinner/charge, completion/Close/background/unmount cleanup, pinned native integration. Native compilation and iPhone playback remain pending.');
})().catch(error => { console.error(error); process.exitCode = 1; });
