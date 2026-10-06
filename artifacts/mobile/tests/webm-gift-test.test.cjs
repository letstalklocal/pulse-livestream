const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const compile = path => ts.transpileModule(fs.readFileSync(require.resolve(path), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const htmlModule = { exports: {} };
vm.runInNewContext(compile('../utils/webmGiftHtml.ts'), { exports: htmlModule.exports });
const html = htmlModule.exports.webmGiftHtml('AAAA');
assert.match(html, /data:video\/webm;base64,AAAA/); assert.match(html, /autoplay playsinline/);
assert.doesNotMatch(html, /autoplay muted|video\.muted=true/);
assert.match(html, /background:transparent/); assert.match(html, /media-src data:/);
assert.doesNotMatch(html, / loop|https?:|file:\/\//);
assert.throws(() => htmlModule.exports.webmGiftHtml('<script>'), /Invalid WebM/);
const listeners = {}, posted = [], documentListeners = {};
let played = 0, paused = 0, completed = 0, background, removed = 0, available = true, platform = 'android';
const video = { addEventListener(name, fn) { listeners[name] = fn; }, play() { played++; return Promise.resolve(); }, pause() { paused++; } };
vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], { document: { hidden: true, getElementById: () => video, addEventListener(name, fn) { documentListeners[name] = fn; } }, window: { ReactNativeWebView: { postMessage: value => posted.push(value) } } });
assert.equal(played, 1); assert.equal(video.muted, false); assert.equal(video.volume, 1);
listeners.playing(); listeners.ended(); listeners.error(); documentListeners.visibilitychange();
assert.equal(posted.join(','), 'ready,ended,error,ended'); assert.equal(paused, 1);
const effects = [], slots = [html, 'ready']; let cursor = 0, downloaded = 0;
const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useRef: current => ({ current }),
  useState: initial => { const slot = cursor++; if (!(slot in slots)) slots[slot] = initial; return [slots[slot], value => slots[slot] = value]; }, useEffect: effect => effects.push(effect) };
const mod = { exports: {} };
vm.runInNewContext(compile('../components/WebmGiftTestPlayer.tsx'), { module: mod, exports: mod.exports, require(id) {
  if (id === 'react') return react;
  if (id === 'react-native') return { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', Platform: { get OS() { return platform; } },
    TurboModuleRegistry: { get: () => available ? {} : null }, StyleSheet: { absoluteFill: { position: 'absolute' }, create: v => v },
    AppState: { addEventListener(event, fn) { background = fn; return { remove() { removed++; } }; } } };
  if (id === 'react-native-webview') { if (!available) throw Error('Missing module'); return { WebView: 'WebView' }; }
  if (id === 'expo-asset') return { Asset: { fromModule: () => ({ localUri: 'file:///fixture', downloadAsync: async () => { downloaded++; } }) } };
  if (id === 'expo-file-system') return { File: class { async base64() { return 'AAAA'; } } };
  if (id === '@/utils/webmGiftHtml') return htmlModule.exports;
  if (id === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 24 }) };
  if (id === '@/i18n') return { useAppLanguage: () => ({ t: x => x }) };
  if (id.endsWith('PumpkinBrute_march_9x16.webm')) return 42;
  throw Error(id);
} });
const nodes = v => Array.isArray(v) ? v.flatMap(nodes) : v && typeof v === 'object' ? [v, ...nodes(v.props?.children)] : [];
const render = () => { cursor = 0; effects.length = 0; return mod.exports.WebmGiftTest({ onDone: () => completed++ }); };
(async () => {
  slots[0] = null; slots[1] = 'loading';
  let loadingTree = render();
  assert.ok(!nodes(loadingTree).some(n => n.type === 'Spinner'), 'Asset loading has no visible spinner');
  assert.ok(!nodes(loadingTree).some(n => n.type === 'WebView'), 'Player waits for prepared data');
  slots[0] = html;
  loadingTree = render();
  assert.ok(nodes(loadingTree).some(n => n.type === 'WebView'), 'Prepared video can start');
  assert.ok(!nodes(loadingTree).some(n => n.type === 'Spinner'), 'Player startup has no visible spinner');
  slots[1] = 'ready';
  await Promise.all([mod.exports.preloadWebmGiftTest(), mod.exports.preloadWebmGiftTest()]);
  assert.equal(downloaded, 1, 'Concurrent preloads share one preparation');
  let tree = render(), cleanups = effects.map(fn => fn()); await new Promise(setImmediate);
  assert.equal(downloaded, 1);
  const webview = nodes(tree).find(n => n.type === 'WebView');
  assert.equal(webview.props.source.html, html); assert.equal(webview.props.allowFileAccess, false);
  assert.equal(webview.props.allowsInlineMediaPlayback, undefined, 'Android player settings remain unchanged');
  assert.equal(webview.props.onShouldStartLoadWithRequest({ url: 'https://example.com' }), false);
  assert.equal(webview.props.onShouldStartLoadWithRequest({ url: 'about:blank' }), true);
  webview.props.onMessage({ nativeEvent: { data: 'ended' } }); assert.equal(completed, 1);
  background('inactive'); assert.equal(completed, 2);
  nodes(tree).find(n => n.props.testID === 'webm-test-close').props.onPress(); assert.equal(completed, 3);
  webview.props.onError(); tree = render(); assert.ok(nodes(tree).some(n => n.type === 'Text' && n.props.children.includes('Playback unavailable')));
  cleanups.forEach(fn => fn?.()); assert.equal(removed, 1);
  slots[0] = null; slots[1] = 'loading'; available = false; tree = render();
  assert.ok(!nodes(tree).some(n => n.type === 'WebView'), 'Old builds cannot mount missing native view');
  available = true; tree = render(); cleanups = effects.map(fn => fn()); cleanups.forEach(fn => fn?.()); await new Promise(setImmediate);
  assert.equal(slots[0], null, 'Late load after unmount cannot restart playback');
  platform = 'ios'; slots[0] = html; slots[1] = 'ready'; tree = render();
  const iosPlayer = nodes(tree).find(n => n.type === 'WebView');
  assert.equal(iosPlayer.props.allowsInlineMediaPlayback, true);
  assert.equal(iosPlayer.props.mediaPlaybackRequiresUserAction, false);
  assert.equal(iosPlayer.props.automaticallyAdjustContentInsets, false);
  assert.equal(iosPlayer.props.source.html, html, 'iOS tests the exact same transparent WebM');
  iosPlayer.props.onContentProcessDidTerminate(); tree = render();
  assert.ok(nodes(tree).some(n => n.type === 'Text' && n.props.children.includes('Playback unavailable')));
  available = false; tree = render();
  assert.ok(!nodes(tree).some(n => n.type === 'WebView'), 'Old iOS binaries cannot mount missing player');
  assert.ok(nodes(tree).some(n => n.type === 'Text' && n.props.children.includes('\nRNCWebView · iOS build')));
  for (const os of ['android', 'ios']) {
    const entry = { exports: {} };
    vm.runInNewContext(compile(`../components/WebmGiftTest.${os}.tsx`), { exports: entry.exports, require(id) {
      assert.equal(id, './WebmGiftTestPlayer'); return mod.exports;
    } });
    assert.equal(entry.exports.WebmGiftTest, mod.exports.WebmGiftTest);
    assert.equal(entry.exports.preloadWebmGiftTest, mod.exports.preloadWebmGiftTest);
  }
  const fallback = { exports: {} };
  vm.runInNewContext(compile('../components/WebmGiftTest.tsx'), { exports: fallback.exports, require() { throw Error('Non-Android must not load player'); } });
  assert.equal(fallback.exports.WebmGiftTest({ onDone() {} }), null);
  await fallback.exports.preloadWebmGiftTest();
  assert.equal(downloaded, 1, 'Previews reuse the prepared file');
  console.log('PASS: Android/iOS player wiring, iOS inline playback/process errors, web isolation, no spinner, audible transparent HTML, shared preload, completion and close/background/unmount cleanup. iPhone transparency/audio and device timing pending.');
})().catch(error => { console.error(error); process.exitCode = 1; });
