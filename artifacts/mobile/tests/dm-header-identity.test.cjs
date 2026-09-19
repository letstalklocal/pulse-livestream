const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require.resolve('../app/dm/[peerId].tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
let params = { peerId: '1', peerName: 'Video Host' }, profiles = new Map(), conversations = [], blocked = false, options;
let si = 0, ri = 0; const states = [], refs = [];
const react = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState: initial => { const i = si++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next; }]; },
  useRef: initial => refs[ri++] ??= { current: initial }, useMemo: fn => fn(), useCallback: fn => fn, useEffect() {}, useImperativeHandle() {},
};
const rn = Object.fromEntries(['ActivityIndicator','FlatList','Image','KeyboardAvoidingView','Modal','Text','TextInput','TouchableOpacity','View'].map(x => [x, x]));
Object.assign(rn, { Platform: { OS: 'android' }, Keyboard: { isVisible: () => false }, StyleSheet: { create: x => x },
  Animated: { View: 'AnimatedView', Value: class { interpolate() { return 1; } } } });
const mod = { exports: {} };
vm.runInNewContext(code, { module: mod, exports: mod.exports, process: { env: {} }, require: id => {
  if (id === 'react') return react;
  if (id === 'react-native') return rn;
  if (id === 'expo-router') return { useLocalSearchParams: () => params, useRouter: () => ({ back() {} }), useFocusEffect() {} };
  if (id === 'expo-crypto') return { randomUUID: () => 'test' };
  if (id === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 24, bottom: 20 }) };
  if (id === '@clerk/expo') return { useAuth: () => ({ getToken: async () => 'token' }) };
  if (id === '@/context/AuthContext') return { useAuth: () => ({ user: { uid: 9 } }) };
  if (id === '@/context/RtmContext') return { useRtm: () => ({ getMessages: () => [], conversations, refreshMessages() {} }) };
  if (id === '@/hooks/useAccountSafety') return { useAccountSafety: () => ({ data: { contactBlocked: blocked } }) };
  if (id === '@/hooks/useColors') return { useColors: () => ({}) };
  if (id === '@/i18n') return { useAppLanguage: () => ({ t: x => x, localizedTextStyle: () => ({}), appLocale: () => 'en', appNumber: x => String(x) }) };
  if (id === '@tanstack/react-query') return { useQuery: () => ({ isPending: true }), useQueryClient: () => ({}) };
  if (id === '@workspace/api-client-react') return new Proxy({
    getGetUserQueryKey: uid => [`/api/users/${uid}`],
    useGetUser: (uid, config) => { options = config.query; return { data: profiles.has(uid) ? { user: profiles.get(uid) } : undefined }; },
  }, { get: (obj, key) => obj[key] ?? (() => ({})) });
  if (id === '@/components/GiftPicker') return { GiftPicker: 'GiftPicker', GIFTS: [] };
  return new Proxy({}, { get: (_, key) => key });
} });
function render() {
  si = ri = 0; const nodes = [];
  function walk(n) { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== 'object') return; nodes.push(n); walk(n.props?.children); }
  walk(mod.exports.default());
  return { nodes, avatar: nodes.find(n => n.type === 'Avatar' && n.props.size === 40), header: nodes.find(n => n.type === 'Text' && n.props.numberOfLines === 1) };
}
let v = render(); assert.equal(v.header.props.children[0], 'Video Host', 'route name appears while messages/status/profile are pending');
assert.equal(v.avatar.props.name, 'Video Host'); assert.equal(options.queryKey[0], '/api/users/1', 'shares profile/video avatar cache');
assert.equal(options.staleTime, 60000); assert.equal(options.enabled, true);
profiles.set(1, { name: 'Current Host', avatarImageUrl: 'https://test/avatar.jpg' });
v = render(); assert.equal(v.header.props.children[0], 'Current Host'); assert.equal(v.avatar.props.avatarUri, 'https://test/avatar.jpg', 'profile completion updates avatar without reopening chat');
params = { peerId: '2' }; v = render(); assert.equal(v.header.props.children[0], 'User'); assert.equal(v.avatar.props.avatarUri, undefined, 'new peer cannot inherit previous photo');
conversations = [{ peerId: '2', peerName: 'Conversation Name' }]; v = render(); assert.equal(v.header.props.children[0], 'Conversation Name', 'late conversations also repair a missing route name');
profiles.set(2, { name: 'Resolved Peer', avatarImageUrl: null }); v = render(); assert.equal(v.header.props.children[0], 'Resolved Peer'); assert.equal(v.avatar.props.avatarUri, undefined);
blocked = true; render(); assert.equal(options.enabled, false);
params = { peerId: 'invalid' }; render(); assert.equal(options.enabled, false);
console.log('PASS: DM header uses immediate video name, shared avatar cache, later profile/conversation updates and per-peer isolation while messages/status are pending. Native UI mocked.');
