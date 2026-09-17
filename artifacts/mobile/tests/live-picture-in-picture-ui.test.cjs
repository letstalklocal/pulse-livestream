const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require.resolve('../components/LivePictureInPicture.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
let large = false, keyboardHeight = 0, closeCount = 0, navigations = [], settings = [], platform = 'android';
const playback = { channelId: 'room', session: { channelId: 'room', privateInvitationId: '42' }, minimized: true,
  canEnterStream: true, ended: false, accessRestricted: false, joined: true, remoteUid: 9, remoteVideoReady: true,
  partyMedia: {}, premiumGift: { request: null }, close: () => closeCount++ };
const api = {};
let panMove;
vm.runInNewContext(code, { exports: api, require(name) {
  if (name === 'react') return { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }), useState: () => [large, value => { large = typeof value === 'function' ? value(large) : value; }], useRef: initial => ({ current: initial }), useEffect: fn => fn() };
  if (name === 'react-native') return { get Platform() { return { OS: platform }; }, ActivityIndicator: 'ActivityIndicator', LayoutAnimation: { Presets: { easeInEaseOut: {} }, Types: { easeInEaseOut: "easeInEaseOut" }, configureNext() {} }, PanResponder: { create: handlers => ({ panHandlers: handlers }) }, Image: 'Image', Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }, create: v => v }, useWindowDimensions: () => ({ width: 390, height: 844 }) };
  if (name === 'react-native-screens') return { FullWindowOverlay: 'FullWindowOverlay' };
  if (name === 'expo-router') return { useRouter: () => ({ navigate: to => navigations.push(to), push: to => settings.push(to) }), usePathname: () => '/dm/9' };
  if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }) };
  if (name === 'react-native-keyboard-controller') return { useKeyboardState: selector => selector({ height: keyboardHeight }) };
  if (name === '@/context/LivePlaybackContext') return { useLivePlayback: () => playback };
  if (name === '@/hooks/useStreamKeepAwake') return { useStreamKeepAwake() {} };
  if (name === '@/i18n') return { useAppLanguage: () => ({ t: key => key, appNumber: n => String(n) }) };
  if (name === '@/utils/agora') return { RtcTextureViewComponent: 'TextureVideo', RtcSurfaceViewComponent: 'SurfaceVideo', VideoSourceType: { VideoSourceRemote: 1 } };
  if (name === '@/components/DemoVideo') return { DemoVideo: 'DemoVideo' };
  throw Error(name);
} });
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...tree.children.flatMap(nodes)];
const render = () => { const tree = api.LivePictureInPicture(); return tree?.type(tree.props); };
const button = (tree, label) => nodes(tree).find(n => n.type === 'Pressable' && n.props.accessibilityLabel === label);
const player = tree => nodes(tree).find(n => n.type === 'View' && Array.isArray(n.props.style)).props.style[1];
let tree = render();
assert.ok(nodes(tree).some(n => n.type === 'TextureVideo'), 'Android uses a clipped TextureView');
assert.equal(player(tree).right, 12); assert.equal(player(tree).bottom, 110); assert.equal(player(tree).width, 112); assert.ok(Math.abs(player(tree).height - 112 * 16 / 9) < 0.01);
assert.equal(button(tree, 'Close picture in picture'), undefined);
assert.equal(nodes(tree).some(n => n.type === 'Modal'), false, 'Browsing must not be blocked by a modal');
button(tree, 'Picture in picture').props.onPress(); tree = render();
assert.equal(player(tree).width, 192); assert.ok(Math.abs(player(tree).height - 192 * 16 / 9) < 0.01);
assert.ok(button(tree, 'Picture in picture settings')); assert.ok(button(tree, 'Picture in picture settings')); assert.ok(button(tree, 'Return to live')); assert.ok(button(tree, 'Close picture in picture')); assert.ok(nodes(tree).some(n => n.type === 'Icon' && n.props.name === 'expand-outline'));
button(tree, 'Return to live').props.onPress(); assert.equal(navigations[0].params.channelId, 'room'); assert.equal(navigations[0].params.privateInvitationId, '42');
// A direct tap on the expanded player makes it small again.
button(tree, 'Picture in picture').props.onPress(); tree = render(); assert.equal(player(tree).width, 112);
button(tree, 'Picture in picture').props.onPress(); tree = render(); button(tree, 'Close picture in picture').props.onPress(); assert.equal(closeCount, 1);
button(tree, 'Picture in picture settings').props.onPress(); assert.equal(settings[0], '/general'); assert.equal(large, false);
keyboardHeight = 320; tree = render(); assert.equal(player(tree).bottom, 332, 'Player clears the DM keyboard/composer area');
playback.premiumGift = { request: { required: true }, remaining: 15 }; navigations = []; tree = render();
assert.equal(navigations.length, 0, 'An active timed gift must not undo Premium Back-to-PiP');
assert.ok(button(tree, 'Return to live'), 'Timed gift exposes a route to its existing payment prompt');
playback.canEnterStream = false; tree = render(); assert.equal(navigations.length, 1, 'A new admission requirement returns to the existing admission UI');
playback.canEnterStream = true; playback.premiumGift = { request: null }; platform = 'ios'; tree = render();
assert.ok(nodes(tree).some(n => n.type === 'SurfaceVideo'), 'iOS uses its supported UIView renderer');
assert.equal(tree.type, 'FullWindowOverlay', 'iOS floats above native navigation pages');
for (const flag of ['ended', 'accessRestricted']) { playback[flag] = true; assert.equal(api.LivePictureInPicture(), null); playback[flag] = false; }
playback.minimized = false; assert.equal(api.LivePictureInPicture(), null);
console.log('PASS: mocked compact/large controls, bottom-right/safe-area/keyboard placement, same-stream expansion, General gear, X, timed Premium action, admission handoff and iOS overlay selection. Device rendering/touches remain unverified.');
