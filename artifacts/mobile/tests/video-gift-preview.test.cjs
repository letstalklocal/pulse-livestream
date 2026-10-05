const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require.resolve('../components/GiftPicker.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
function render(preview, coins = 0, buying = false, feedbackOverlay, onDrawerHeightChange) {
  const sent = [], writes = [], closes = [], slots = [buying, null];
  let cursor = 0, visible = true, effects = [];
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: () => { const i = cursor++; return [slots[i], value => { slots[i] = value; writes.push(value); }]; },
    useEffect: effect => effects.push(effect) };
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: id => {
    if (id === 'react') return react;
    if (id === 'react-native') return { Modal: 'Modal', ScrollView: 'ScrollView', TouchableOpacity: 'Button', Text: 'Text', View: 'View', Platform: { OS: 'android' }, StyleSheet: { create: x => x }, useWindowDimensions: () => ({ height: 800 }) };
    if (id === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 0 }) };
    if (id === '@/i18n') return { useAppLanguage: () => ({ t: x => x, appLocale: () => 'en', localizedTextStyle: () => ({}) }) };
    if (id === './CoinStoreContent') return { CoinStoreContent: 'CoinStore' };
    if (id === '@/components/GiftImageArtwork') return { GiftImageArtwork: 'GiftImageArtwork', LuxuryGiftArtwork: 'LuxuryGiftArtwork', hasGiftImage: gift => ['rose','heart','lips','strawberry','kisses','luxury_rocket','dragon'].includes(gift?.toLowerCase()), hasLuxuryGiftAnimation: gift => ['kisses','luxury_rocket','dragon'].includes(gift?.toLowerCase()) };
    if (id === './CrownArtwork') return { CrownArtwork: 'CrownArtwork' };
    if (id === './GoldCoinIcon') return { GoldCoinIcon: 'GoldCoinIcon' };
    if (id === './Avatar') return { Avatar: 'Avatar' };
    throw Error(id);
  }});
  const result = { nodes: [], sent, writes, closes };
  const update = () => {
    cursor = 0; effects = [];
    const tree = mod.exports.GiftPicker({ visible, preview, coins, feedbackOverlay, onDrawerHeightChange, onClose: () => closes.push(true), onSend: gift => sent.push(gift.id), hintText: preview ? 'Test gifts only. No coins are spent.' : undefined });
    const nodes = [];
    const walk = value => { if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') { nodes.push(value); walk(value.props?.children); } };
    walk(tree); result.nodes = nodes;
    effects.forEach(effect => effect());
  };
  result.select = name => { result.nodes.find(n => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === name).props.onPress(); update(); };
  result.send = id => { result.nodes.find(n => n.props.testID === `send-gift-${id}`).props.onPress(); update(); };
  result.openLuxury = () => { result.nodes.find(n => n.props.testID === 'gift-tab-luxury').props.onPress(); update(); };
  result.openPopular = () => { result.nodes.find(n => n.props.testID === 'gift-tab-popular').props.onPress(); update(); };
  result.reopen = () => { visible = false; update(); visible = true; update(); };
  update();
  return result;
}
const sendAll = state => {
  for (const node of state.nodes.filter(n => n.props.accessibilityRole === 'radio')) {
    state.select(node.props.accessibilityLabel);
    state.send(node.props.accessibilityLabel.toLowerCase());
  }
};

let preview = render(true);
const measuredHeights = [];
const measured = render(false, 500, false, undefined, height => measuredHeights.push(height));
measured.nodes.find(node => node.type === 'View' && node.props.onLayout).props.onLayout({ nativeEvent: { layout: { height: 260 } } });
assert.deepEqual(measuredHeights, [260]);
assert.ok(measured.nodes.some(node => node.type === 'Modal' && node.props.visible), 'DM clearance does not replace the existing native gift modal');
const feedback = { type: 'PaidGiftAnimation', props: {} };
const feedbackState = render(false, 5, false, feedback);
const overlayContainer = feedbackState.nodes.find(node => node.type === 'View' && node.props.children.includes(feedback));
assert.equal(overlayContainer?.props.pointerEvents, 'none', 'paid feedback inside the native picker modal cannot intercept drawer/backdrop touches');
assert.ok(!preview.nodes.some(node => node.type === 'PaidGiftAnimation'), 'callers without feedback retain their existing presentation');
const badge = preview.nodes.find(node => node.props?.accessibilityLabel === 'Preview gifts');
assert.equal(badge.props.disabled, true, 'preview cannot open a coin purchase');
assert.equal(preview.nodes.filter(n => n.props.testID?.startsWith('send-gift-')).length, 8, 'Each gift tile is the full-tile tap target');
sendAll(preview);
assert.equal(preview.sent.join(','), 'rose,heart,party,strawberry,diamond,lips,rocket,crown');
preview.openLuxury();
assert.equal(preview.nodes.filter(n => n.props.testID?.startsWith('send-gift-')).length, 3, 'Luxury tab contains exactly its three gifts');
assert.deepEqual(preview.nodes.filter(n => n.props.testID?.startsWith('send-gift-')).map(n => n.props.testID), ['send-gift-kisses', 'send-gift-luxury_rocket', 'send-gift-dragon']);
assert.equal(preview.nodes.find(n => n.props.testID === 'send-gift-kisses').props.accessibilityLabel, 'Kisses');
assert.equal(preview.nodes.find(n => n.props.testID === 'send-gift-luxury_rocket').props.accessibilityLabel, 'Rocket');
assert.equal(preview.nodes.find(n => n.props.testID === 'send-gift-dragon').props.accessibilityLabel, 'Dragon');
assert.equal(preview.nodes.filter(n => n.type === 'LuxuryGiftArtwork').length, 3, 'Luxury tab uses native SVGA artwork rather than static previews');
preview.openPopular();
assert.ok(!render(true, 0, true).nodes.some(node => node.type === 'CoinStore'), 'even stale purchase state cannot expose checkout in preview');
const normal = render(undefined, 0);
sendAll(normal);
assert.equal(normal.sent.length, 0, 'ordinary gifts retain wallet affordability');
const regularBadge = normal.nodes.find(node => node.props?.accessibilityLabel === 'Buy Coins');
assert.equal(regularBadge.props.disabled, false); regularBadge.props.onPress(); assert.equal(normal.writes.at(-1), true);
assert.equal(normal.nodes.filter(node => node.type === 'GoldCoinIcon').length, 9, 'Gift drawer uses explicit gold artwork for its balance and all eight gift costs');
assert.doesNotMatch(fs.readFileSync(require.resolve('../components/GiftPicker.tsx'), 'utf8'), /🪙/, 'Gift drawer never uses the platform coin emoji');
assert.ok(!normal.nodes.some(node => node.type === 'Text' && node.props.children.includes('Tap Buy Coins to top up.')), 'Gift drawer has no zero-balance instruction footer');
assert.ok(render(false, 0, true).nodes.some(node => node.type === 'CoinStore'), 'ordinary purchase sheet remains available');
const funded = render(false, 5);
sendAll(funded);
assert.equal(funded.sent.join(','), 'rose,heart');
const screen = fs.readFileSync(require.resolve('../app/video-prototype.tsx'), 'utf8');
assert.doesNotMatch(screen, /spendMutation|useSpendCoins|fetch\(|\.mutate\(/, 'sample gifts must remain local');
console.log('PASS: preview gifts have no checkout, all eight animations selectable, normal wallet/purchase behavior preserved.');

assert.equal(preview.closes.length, 0, 'Sending gifts keeps the sheet open');
preview.nodes.find(node => node.type === 'Button' && node.props.activeOpacity === 1).props.onPress();
assert.equal(preview.closes.length, 1, 'Tapping outside dismisses the sheet');

const cards = preview.nodes.filter(node => node.type === 'View' && node.props.key);
assert.equal(cards.length,8);
assert.ok(cards.every(node => !node.props.onPress), 'Artwork/card is not a send target');
assert.ok(cards.every(node => node.props.style.width === '25%'), 'Four equal columns');
assert.ok(cards.every(node => node.props.style.paddingHorizontal === 2), 'Gift cards are inset two points on each side so selected borders do not touch');
const giftCells = preview.nodes.filter(node => node.props.testID?.startsWith('send-gift-'));
assert.equal(giftCells.length, 8);
const grid = preview.nodes.find(node => node.type === 'ScrollView');
assert.ok(!grid.props.horizontal, 'Gifts scroll vertically');
assert.equal(grid.props.style[1].maxHeight, 124 * Math.min(3, Math.ceil(cards.length / 4)), 'Viewport fits content up to its row cap');
assert.ok(giftCells.every(n => n.props.style[0].height === undefined && n.props.style[0].paddingBottom === 0), 'Gift border wraps content through the bottom of Send');
assert.ok(normal.nodes.filter(node => node.props.testID?.startsWith('send-gift-')).every(node => node.props.accessibilityLabel !== 'Send Rose, 1'), 'Unaffordable gifts cannot become send-ready');

const selection = render(false, 100);
selection.send('rose'); assert.equal(selection.sent.length, 0, 'The first full-tile tap only selects');
assert.equal(selection.nodes.filter(n => n.props.testID?.startsWith('send-gift-') && n.props.accessibilityLabel === 'Send Rose, 1').length, 1);
assert.ok(selection.nodes.some(n => Array.isArray(n.props.style) && n.props.style.some(s => s?.borderColor === '#FF4D85')), 'Selection has a visible border');
selection.send('rose'); assert.deepEqual(selection.sent, ['rose'], 'A second tap anywhere on the selected tile sends it');
selection.select('Lips'); selection.send('rose'); assert.deepEqual(selection.sent, ['rose'], 'Tapping an unselected tile only changes the selection');
selection.send('rose'); assert.deepEqual(selection.sent, ['rose', 'rose'], 'The newly selected tile sends on its next full-tile tap');
selection.select('Lips'); selection.send('lips'); assert.deepEqual(selection.sent, ['rose', 'rose', 'lips']);
assert.equal(selection.closes.length, 0);
selection.reopen(); assert.ok(selection.nodes.filter(n => n.props.testID?.startsWith('send-gift-')).every(n => !n.props.accessibilityLabel.startsWith('Send ')), 'Reopening resets selection');
assert.equal(selection.nodes.find(n => n.type === 'Button' && n.props.activeOpacity === 1).props.style.backgroundColor, 'transparent', 'Backdrop does not dim the live');
console.log('PASS: first-tap selection, full selected-tile sending, affordable guard, switching/resetting selection, and transparent backdrop.');

assert.ok(preview.nodes.some(n => n.type === "View" && (Array.isArray(n.props.style) ? n.props.style : [n.props.style]).some(style => style?.maxHeight === 330)), "Gift drawer maximum height is increased by exactly 10 points");
assert.equal(grid.props.style.marginBottom, undefined, 'Gift grid uses all available sheet space without an extra footer gap');
