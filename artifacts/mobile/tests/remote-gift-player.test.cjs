const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');
const tick = () => new Promise(setImmediate);
function fixture(platform, format, supportsMutedPlayback = true) {
  const slots = [], effects = []; let cursor = 0, releases = 0, completed = 0, unavailable = 0, appState;
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useRef: value => { const index = cursor++; return slots[index] ??= { current: value }; },
    useState: value => { const index = cursor++; if (!(index in slots)) slots[index] = value; return [slots[index], value => { slots[index] = value; }]; },
    useEffect: effect => effects.push(effect),
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../components/RemoteGiftPlayer.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, setTimeout, clearTimeout, require: id => ({
    react,
    'react-native': { Platform: { OS: platform }, AppState: { addEventListener: (_, cb) => { appState = cb; return { remove() {} }; } }, TurboModuleRegistry: { get: () => true }, StyleSheet: { absoluteFill: {} }, View: 'View' },
    'expo-file-system': { File: class { async base64() { return 'AAAA'; } } },
    expo: { requireOptionalNativeModule: () => ({ supportsMutedPlayback }), requireNativeView: () => 'Alpha' },
    'react-native-webview': { WebView: 'WebView' },
    '@dasimems/react-native-svga': { SvgaPlayer: 'Svga' },
    '@/utils/giftAssetCache': { acquireGiftAsset: async () => ({ uri: 'file:///verified', release: () => releases++ }) },
    '@/utils/webmGiftHtml': { webmGiftHtml: (_, muted) => `muted=${muted}` },
    '@/utils/localCatalogGiftSound': { prepareLocalCatalogGiftSound: async () => ({ play() {}, stop() {} }) },
  })[id] });
  const snapshot = { id: 'gift', revisionId: 'r1', name: 'Gift', thumbnail: null, sound: null, framing: { preset: 'contained', scale: 1, x: 0, y: 0 }, animation: { id: 'animation', sha256: 'hash', format, width: format === 'packed-alpha-mp4' ? 400 : 200, height: 400 } };
  const render = () => { cursor = 0; return exports.RemoteGiftPlayer({ snapshot, width: 300, height: 600, muted: true, onFinish: () => completed++, onUnavailable: () => unavailable++ }); };
  const initial = render(); const cleanup = effects.shift()();
  return { snapshot, initial, render, cleanup, background: () => appState('background'), get completed() { return completed; }, get unavailable() { return unavailable; }, get releases() { return releases; } };
}
for (const [platform, format, player] of [['android', 'webm-alpha', 'WebView'], ['ios', 'packed-alpha-mp4', 'Alpha'], ['android', 'svga', 'Svga']]) {
  test(`${platform} ${format} waits invisibly, mutes paid playback, finishes once and releases verified asset`, async () => {
    const f = fixture(platform, format);
    assert.ok(!f.initial.children.some(child => child));
    await tick();
    const node = f.render().children.find(child => child?.type === player);
    assert.ok(node);
    if (player === 'WebView') { assert.equal(node.props.source.html, 'muted=true'); assert.equal(node.props.allowFileAccess, false); node.props.onMessage({ nativeEvent: { data: 'ended' } }); node.props.onMessage({ nativeEvent: { data: 'ended' } }); }
    else { assert.equal(player === 'Alpha' ? node.props.muted : node.props.muteBuiltInAudio, true); node.props.onFinish(); node.props.onFinish(); }
    assert.equal(f.completed, 1);
    f.cleanup(); assert.equal(f.releases, 1);
  });
}
test('background ends playback; native error uses bounded fallback; unmount rejects late completion', async () => {
  const f = fixture('ios', 'packed-alpha-mp4'); await tick();
  const node = f.render().children.find(child => child?.type === 'Alpha');
  node.props.onError(); assert.equal(f.unavailable, 1); node.props.onFinish(); assert.equal(f.completed, 0); f.cleanup();
  const background = fixture('android', 'svga'); await tick(); background.background(); assert.equal(background.completed, 1); background.cleanup();
  const retired = fixture('ios', 'packed-alpha-mp4'); retired.cleanup(); await tick(); assert.equal(retired.releases, 1); assert.ok(!retired.render().children.some(child => child));
});
test('older AlphaPlayer binaries without mute support use static fallback and never start embedded audio', async () => {
  const f = fixture('ios', 'packed-alpha-mp4', false);
  await tick();
  assert.equal(f.unavailable, 1); assert.ok(!f.render().children.some(child => child));
});
