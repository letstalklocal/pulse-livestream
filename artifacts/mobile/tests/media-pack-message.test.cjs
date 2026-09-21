const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync(require.resolve('../components/MediaPackMessage.tsx'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...(n.children ?? []).flatMap(nodes)];
const pack = { name: 'Pack title', price: 500, itemCount: 2, unlocked: false, items: [{ id: '1', mediaType: 'image', previewUrl: 'blurred-preview', mediaUrl: 'private-image' }, { id: '2', mediaType: 'video', mediaUrl: 'private-video' }] };
let cursor = 0, width = 390;
const slots = [], alerts = [], payments = [];
const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }), useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = v; }]; } };
const colors = { card: 'black', foreground: 'white', mutedForeground: 'gray', border: 'gray', primary: 'pink' };
const mocks = {
  react: React,
  'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', FlatList: 'List', StyleSheet: { create: x => x, absoluteFillObject: {} }, useWindowDimensions: () => ({ width }), Alert: { alert: (...args) => alerts.push(args) } },
  'expo-image': { Image: 'Image' }, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/i18n': { useAppLanguage: () => ({ t: s => s, localizedTextStyle: () => ({}), appNumber: String }) },
  '@/hooks/useColors': { useColors: () => colors }, '@/context/AuthContext': { useAuth: () => ({ user: { uid: 1 } }) },
  '@tanstack/react-query': { useQueryClient: () => ({ setQueryData() {} }) },
  '@workspace/api-client-react': { useGetMediaPack: () => ({ data: { pack }, refetch: async () => {} }), useUnlockMediaPack: () => ({ isPending: false, mutateAsync: async request => { payments.push(request); return { balance: 500 }; } }), getGetCoinBalanceQueryKey: () => [] },
  './MediaPackGallery': { MediaPackGallery: 'Gallery' },
};
const mod = { exports: {} };
new Function('require', 'module', 'exports', code)(id => { assert.ok(mocks[id], id); return mocks[id]; }, mod, mod.exports);
const render = (mine = false) => { cursor = 0; return mod.exports.MediaPackMessage({ packId: '7', mine, read: true }); };
(async () => {
  let tree = render();
  assert.equal(tree.props.style[0].aspectRatio, 5 / 7);
  assert.equal(tree.children[0].children[0], 'Pack title', 'Title precedes counts and media');
  assert.equal(nodes(tree).filter(n => n.type === 'List').length, 0, 'Locked pack never renders private slides');
  assert.deepEqual(nodes(tree).filter(n => n.type === 'Image').map(n => n.props.source.uri), ['blurred-preview']);
  assert.equal(nodes(tree).find(n => n.type === 'Image').props.blurRadius, 28);
  nodes(tree).find(n => n.props.testID === 'pack-unlock-7').props.onPress();
  alerts[0][2][1].onPress();
  await new Promise(setImmediate);
  assert.equal(payments[0].data.expectedPrice, 500, 'Card keeps the displayed-price checkout');
  pack.unlocked = true;
  for (const screenWidth of [320, 390, 430]) {
    width = screenWidth; tree = render();
    assert.equal(tree.props.style[1].width, Math.min(280, screenWidth * 0.6), "Card uses 60% of the screen width");
    const list = nodes(tree).find(n => n.type === 'List');
    assert.equal(list.props.pagingEnabled, true);
    const tile = list.props.renderItem({ item: pack.items[0], index: 0 });
    const pageWidth = tile.props.style[1].width;
    assert.equal(pageWidth, tree.props.style[1].width - 28);
    assert.equal(list.props.getItemLayout(null, 19).offset, pageWidth * 19, 'Final slide uses consistent page spacing');
    tile.props.onPress();
    tree = render();
    assert.ok(nodes(tree).some(n => n.type === 'Gallery'), 'Tap retains full-screen gallery');
  }
  tree = render(true);
  assert.ok(nodes(tree).some(n => n.props.name === 'checkmark-done' && n.props.accessibilityLabel === 'Read'), 'Read status stays inside card');
  console.log('PASS: portrait DM pack layout, title/count order, paged media, protected locked preview, checkout and read state.');
})().catch(e => { console.error(e); process.exitCode = 1; });
