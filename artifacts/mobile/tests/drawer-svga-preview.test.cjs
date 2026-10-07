const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');
const tick = () => new Promise(setImmediate);
const code = ts.transpileModule(fs.readFileSync(require.resolve('../components/RemoteGiftArtwork.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
function fixture({ type = 'animation', reduced = false, native = true, cached = false } = {}) {
  const slots = [], pending = [], subscriptions = {}, downloads = [], released = [];
  let cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState(value) { const i = cursor++; slots[i] ??= { value }; return [slots[i].value, value => { slots[i].value = value; }]; },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useEffect(fn, deps) { const i = cursor++; const old = slots[i];
      if (!old || deps.some((d, j) => !Object.is(d, old.deps[j]))) {
        slots[i] = { deps, cleanup: old?.cleanup };
        pending.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const listen = name => (_, cb) => { subscriptions[name] = cb; return { remove() { delete subscriptions[name]; } }; };
  const exports = {};
  vm.runInNewContext(code, { exports, require: id => {
    if (id === '@dasimems/react-native-svga') { if (!native) throw Error('old build'); return { SvgaPlayer: 'Svga' }; }
    const modules = {
      react: React,
      'react-native': { Platform: { OS: 'android' }, Image: 'Image', Text: 'Text', AppState: { currentState: 'active', addEventListener: listen('app') },
        AccessibilityInfo: { isReduceMotionEnabled: async () => reduced, addEventListener: listen('motion') } },
      '@/utils/giftAssetCache': { getCachedGiftAssetUri: asset => cached && asset?.id === 'art' ? 'file:///art' : null, acquireGiftAsset: async asset => { downloads.push(asset.id); let done = false; return { uri: `file:///${asset.id}`, release() { if (!done) { done = true; released.push(asset.id); } } }; } },
      './GiftImageArtwork': { hasGiftImage: () => false }, './CrownArtwork': { CrownArtwork: 'Crown' },
    };
    assert.ok(modules[id], id); return modules[id];
  } });
  const snapshot = { id: 'new', name: 'New', type, thumbnail: { id: 'art', sha256: 'art', format: 'png' }, androidAnimation: { id: 'movie', sha256: 'movie', format: 'svga' }, sound: { id: 'audio' } };
  const props = { snapshot, size: 44, animated: true, enabled: true };
  const render = () => { cursor = 0; const node = exports.RemoteGiftArtwork(props); pending.splice(0).forEach(fn => fn()); return node; };
  return { props, downloads, released, subscriptions, render,
    async ready() { for (let i = 0; i < 4; i++) { render(); await tick(); } return render(); },
    close() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
test('verified cached artwork appears on the first render without showing the previous revision', async () => {
  const f = fixture({ type: 'image', cached: true });
  assert.equal(f.render().props.source.uri, 'file:///art');
  await f.ready();
  f.props.snapshot = { ...f.props.snapshot, thumbnail: { id: 'replacement', sha256: 'replacement', format: 'png' } };
  assert.equal(f.render(), null);
  f.close();
});
test('visible SVGA animation gifts loop muted in their existing drawer cell without downloading sound', async () => {
  const f = fixture(); const node = await f.ready();
  assert.equal(node.type, 'Svga'); assert.equal(node.props.loops, 0); assert.equal(node.props.muteBuiltInAudio, true);
  assert.equal(node.props.style[0].width, 44); assert.deepEqual(f.downloads, ['art', 'movie']);
  node.props.onError(); assert.equal(f.render().type, 'Image'); assert.ok(f.released.includes('movie'));
  f.close(); assert.equal(f.released.length, 2);
});
test('attached artwork never substitutes an emoji while unavailable; old emoji-only gifts remain readable', () => {
  const f = fixture({type:'image'});
  f.props.snapshot.emoji = '🎁';
  assert.equal(f.render(), null);
  f.close();
  const old = fixture({type:'image'});
  old.props.snapshot.thumbnail = null;
  old.props.snapshot.androidAnimation = null;
  old.props.snapshot.emoji = '🎉';
  assert.equal(old.render().type, 'Text');
  old.close();
});
test('image type, Reduced Motion and old binaries keep still artwork; background and invisible rows release animation', async () => {
  for (const options of [{ type: 'image' }, { reduced: true }, { native: false }]) {
    const f = fixture(options); assert.equal((await f.ready()).type, 'Image'); assert.deepEqual(f.downloads, ['art']); f.close();
  }
  const f = fixture(); await f.ready(); f.subscriptions.app('background'); assert.equal(f.render().type, 'Image'); assert.ok(f.released.includes('movie')); f.close();
  const hidden = fixture(); await hidden.ready(); hidden.props.enabled = false; hidden.render(); assert.deepEqual(hidden.released.sort(), ['art', 'movie']); hidden.close();
});
