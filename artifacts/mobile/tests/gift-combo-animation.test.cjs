const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const refs = [], effects = [], animations = [];
let cursor = 0, cleanup;
let playbackFailed = false;
const react = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useRef: value => refs[cursor++] ??= { current: value },
  useEffect: effect => effects.push(effect),
  useState: () => [playbackFailed, value => { playbackFailed = value; }],
  useCallback: fn => fn,
};
class Value { constructor(value) { this.value = value; } setValue(value) { this.value = value; } }
const Animated = {
  Value, View: 'View', timing: (value, options) => ({ value, options }),
  parallel: steps => ({ parallel: steps }), delay: ms => ({ delay: ms }),
  sequence: steps => {
    const animation = { steps, start(callback) { this.callback = callback; }, stop() { this.stopped = true; this.callback?.({ finished: false }); } };
    animations.push(animation); return animation;
  },
};
const moduleObject = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(require.resolve('../components/GiftFloater.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
vm.runInNewContext(code, { module: moduleObject, exports: moduleObject.exports, require: name => {
  if (name === 'react') return react;
  if (name === 'react-native') return { Animated, Text: 'Text', useWindowDimensions: () => ({ width: 390, height: 844 }), Easing: { out: v => v, in: v => v, inOut: v => v }, StyleSheet: { create: v => v } };
  return { hasGiftImage: gift => ['rose','kisses','luxury_rocket','dragon'].includes(gift?.toLowerCase()), hasLuxuryGiftAnimation: gift => ['kisses','luxury_rocket','dragon'].includes(gift?.toLowerCase()), GiftImageArtwork: 'still', LuxuryGiftArtwork: 'svga' };
} });
const done = [];
function render(count, id) {
  cursor = 0;
  moduleObject.exports.GiftFloater({ gift: { id, comboCount: count, name: 'Rose' }, onDone: id => done.push(id) });
  cleanup?.(); cleanup = effects.pop()();
  return animations.at(-1);
}
const initial = render(1, 'first');
const second = render(2, 'second');
assert.equal(initial.stopped, true);
assert.equal(done.length, 0, 'interrupted animation must not remove the combo');
assert.equal(refs[0].current.value, 0);
assert.equal(refs[1].current.value, 1);
assert.equal(refs[2].current.value, 1, 'artwork holds at normal size without a repeated entrance');
assert.equal(second.steps[0].delay, 2000);
const third = render(3, 'third');
assert.equal(second.stopped, true);
assert.equal(third.steps[0].delay, 2000, 'each higher count renews the hold');
third.callback({ finished: true });
assert.deepEqual(done, ['third'], 'completion removes the latest transaction, not the initial gift');
function artwork(gift) {
  cursor = 0;
  const tree = moduleObject.exports.GiftFloater({ gift, onDone() {} });
  return tree.children[0].children[0];
}
for (const catalogId of ['kisses', 'luxury_rocket', 'dragon']) {
  const node = artwork({ name: catalogId === 'luxury_rocket' ? 'Rocket' : catalogId, catalogId });
  assert.equal(node.type, 'svga', `${catalogId} plays the Luxury animation`);
  assert.equal(node.props.style.height, 220, 'live display keeps its existing frame height');
}
assert.equal(artwork({ name: 'Rocket', catalogId: 'rocket' }).type, 'Text', 'Popular Rocket retains its emoji');
assert.equal(artwork({ name: 'Rocket', catalogId: 'luxury_rocket', reduceMotion: true }).type, 'still', 'reduced motion uses matching static Luxury art');
for (const catalogId of ['kisses', 'luxury_rocket', 'dragon']) {
  cursor = 0;
  const tree = moduleObject.exports.GiftFloater({ gift: { name: 'Luxury', catalogId, comboCount: 1 }, fullPageLuxury: true, onDone() {} });
  const player = tree.children[0].children[0];
  assert.equal(player.props.style.width, catalogId === 'luxury_rocket' ? 437 : 390);
  assert.equal(player.props.style.height, catalogId === 'luxury_rocket' ? 945 : 844, 'Luxury live animation fills the screen');
  assert.equal(tree.props.pointerEvents, 'none', 'full-page gifts cannot block live controls');
  assert.equal(tree.props.style[1].transform, undefined, 'full-page animations stay at their full size');
  assert.equal(tree.children[0].children[1].props.style[1].top, 48, 'combo remains inside the visible screen');
  assert.equal(player.props.playOnce, true, 'live Luxury plays once rather than looping');
  const before = animations.length;
  effects.pop()();
  assert.equal(animations.length, before, 'Luxury playback has no fixed-duration cutoff');
}
cursor = 0;
const completed = [];
const firstLuxury = moduleObject.exports.GiftFloater({ gift: { id: 'luxury-first', name: 'Blast Off', catalogId: 'luxury_rocket' }, fullPageLuxury: true, onDone: id => completed.push(id) });
cursor = 0;
moduleObject.exports.GiftFloater({ gift: { id: 'luxury-second', name: 'Blast Off', catalogId: 'luxury_rocket', comboCount: 2 }, fullPageLuxury: true, onDone: id => completed.push(id) });
firstLuxury.children[0].children[0].props.onFinish();
assert.deepEqual(completed, ['luxury-second'], 'native finish removes the current combo transaction');
firstLuxury.children[0].children[0].props.onPlaybackUnavailable();
cursor = 0;
moduleObject.exports.GiftFloater({ gift: { id: 'fallback', name: 'Blast Off', catalogId: 'luxury_rocket' }, fullPageLuxury: true, onDone() {} });
const beforeFallback = animations.length;
effects.pop()();
assert.ok(animations.length > beforeFallback, 'static/error fallback still cleans up automatically');
// Exercise the real shared artwork component while its asset is loading.
const artworkModule = { exports: {} };
const artworkCode = ts.transpileModule(fs.readFileSync(require.resolve('../components/GiftImageArtwork.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
let sourceFixture = null, stateIndex = 0;
vm.runInNewContext(artworkCode, { module: artworkModule, exports: artworkModule.exports, require: name => {
  if (name === 'react') return { createElement: react.createElement, useEffect() {}, useRef: value => ({ current: value }), useState: () => [stateIndex++ === 0 ? sourceFixture : false, () => {}] };
  if (name === 'react-native') return { Platform: { OS: 'android' }, StyleSheet: { flatten: values => Object.assign({}, ...values) } };
  if (name === 'expo-asset') return { Asset: {} };
  if (name === '@dasimems/react-native-svga') return { SvgaPlayer: 'native-svga' };
  if (name === '@/i18n') return { useAppLanguage: () => ({ t: value => value }) };
  if (name.startsWith('../assets/')) return name;
  throw Error(name);
} });
assert.equal(artworkModule.exports.LuxuryGiftArtwork({ gift: 'dragon', size: 390, playOnce: true }), null, 'live Dragon loading never flashes the still preview');
stateIndex = 0;
assert.ok(artworkModule.exports.LuxuryGiftArtwork({ gift: 'dragon', size: 44 }), 'drawer still preview remains visible while loading');
sourceFixture = 'file:///dragon.svga'; stateIndex = 0;
assert.equal(artworkModule.exports.LuxuryGiftArtwork({ gift: 'dragon', size: 390, playOnce: true }).props.loops, 1, 'ready live animation plays once');
console.log('PASS: combo updates cancel motion, hold steady, renew the two-second delay and complete with the latest gift ID. Native appearance remains device-pending.');
