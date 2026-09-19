const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require.resolve('../components/GiftPicker.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
function render(preview, coins = 0, buying = false) {
  const sent = [], writes = [];
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: () => [buying, value => writes.push(value)], useEffect: () => {} };
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: id => {
    if (id === 'react') return react;
    if (id === 'react-native') return { Modal: 'Modal', ScrollView: 'ScrollView', TouchableOpacity: 'Button', Text: 'Text', View: 'View', Platform: { OS: 'android' }, StyleSheet: { create: x => x } };
    if (id === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 0 }) };
    if (id === '@/i18n') return { useAppLanguage: () => ({ t: x => x, appLocale: () => 'en', localizedTextStyle: () => ({}) }) };
    if (id === './CoinStoreContent') return { CoinStoreContent: 'CoinStore' };
    if (id === './CrownArtwork') return { CrownArtwork: 'CrownArtwork' };
    if (id === './Avatar') return { Avatar: 'Avatar' };
    throw Error(id);
  }});
  const tree = mod.exports.GiftPicker({ visible: true, preview, coins, onClose: () => {}, onSend: gift => sent.push(gift.id), hintText: preview ? 'Test gifts only. No coins are spent.' : undefined });
  const nodes = [];
  const walk = value => { if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') { nodes.push(value); walk(value.props?.children); } };
  walk(tree);
  return { nodes, sent, writes };
}
let preview = render(true);
const badge = preview.nodes.find(node => node.props?.accessibilityLabel === 'Preview gifts');
assert.equal(badge.props.disabled, true, 'preview cannot open a coin purchase');
for (const node of preview.nodes.filter(node => node.type === 'Button' && node.props.key)) node.props.onPress();
assert.equal(preview.sent.join(','), 'rose,heart,party,diamond,rocket,crown');
assert.ok(!render(true, 0, true).nodes.some(node => node.type === 'CoinStore'), 'even stale purchase state cannot expose checkout in preview');
const normal = render(undefined, 0);
for (const node of normal.nodes.filter(node => node.type === 'Button' && node.props.key)) node.props.onPress();
assert.equal(normal.sent.length, 0, 'ordinary gifts retain wallet affordability');
const regularBadge = normal.nodes.find(node => node.props?.accessibilityLabel === 'Buy Coins');
assert.equal(regularBadge.props.disabled, false); regularBadge.props.onPress(); assert.equal(normal.writes[0], true);
assert.ok(render(false, 0, true).nodes.some(node => node.type === 'CoinStore'), 'ordinary purchase sheet remains available');
const funded = render(false, 5);
for (const node of funded.nodes.filter(node => node.type === 'Button' && node.props.key)) node.props.onPress();
assert.equal(funded.sent.join(','), 'rose,heart');
const screen = fs.readFileSync(require.resolve('../app/video-prototype.tsx'), 'utf8');
assert.doesNotMatch(screen, /spendMutation|useSpendCoins|fetch\(|\.mutate\(/, 'sample gifts must remain local');
console.log('PASS: preview gifts have no checkout, all six animations selectable, normal wallet/purchase behavior preserved.');
