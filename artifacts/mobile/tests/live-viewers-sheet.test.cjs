const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const transpile = path => ts.transpileModule(fs.readFileSync(require.resolve(path), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const helper = {};
vm.runInNewContext(transpile('../utils/liveViewerList.ts'), { exports: helper });
function fixture(canManage) {
  const state = [], calls = { moderationEnabled: [], actions: [], profiles: [], closes: 0, dismisses: 0 };
  let cursor = 0;
  const react = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }), Fragment: 'Fragment', useState(initial) {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
  }};
  const roster = [
    { uid: 1, name: 'Gifter', present: true, muted: false, removed: false, blocked: false },
    { uid: 2, name: 'Quiet viewer', present: true, muted: false, removed: false, blocked: false },
    { uid: 3, name: 'Restricted viewer', present: false, muted: true, removed: true, blocked: false },
  ];
  const query = { data: { users: roster }, isLoading: false, isError: false, refetch() {} };
  const ranking = { data: { entries: [{ uid: 1, name: 'Gifter', coins: 50, rank: 1 }] }, isLoading: false, isError: false, refetch() {} };
  const api = {
    getGetStreamModerationQueryKey: () => ['moderation'], getGetStreamLeaderboardQueryKey: () => ['gifts'], getGetStreamQueryKey: () => ['stream'], getGetStreamViewersQueryKey: () => ['viewers'],
    // Return cached host data even when disabled: audience rendering must ignore it.
    useGetStreamModeration: (_, options) => { calls.moderationEnabled.push(options.query.enabled); return query; },
    useGetStreamLeaderboard: () => ranking,
    useModerateStreamViewer: () => ({ isPending: false, mutate: args => calls.actions.push(args) }),
  };
  const native = Object.fromEntries(['ActivityIndicator','KeyboardAvoidingView','Modal','ScrollView','Text','TextInput','TouchableOpacity','View'].map(name => [name, name]));
  Object.assign(native, { Alert: { alert() {} }, Keyboard: { dismiss: () => calls.dismisses++ }, Platform: { OS: 'ios' }, StyleSheet: { create: x => x, absoluteFill: {} } });
  const modules = {
    '@/hooks/useIdleAutoClose': { useIdleAutoClose: (_close, paused) => { calls.autoClosePaused = paused; return () => {}; } },
    react, 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/i18n': { useAppLanguage: () => ({ t: (key, vars) => vars ? key.replace('{v0}', vars.v0) : key, localizedTextStyle: () => ({}), appLocale: () => 'en' }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries() {} }) },
    '@workspace/api-client-react': api, './Avatar': { Avatar: 'Avatar' }, './GoldCoinIcon': { GoldCoinIcon: 'Coin' }, '@/utils/liveViewerList': helper,
  };
  const exports = {};
  vm.runInNewContext(transpile('../components/LiveViewersSheet.tsx'), { exports, require: name => { assert.ok(name in modules, name); return modules[name]; } });
  const render = () => { cursor = 0; return exports.LiveViewersSheet({ channelId: 'room', canManage, onClose: () => calls.closes++, onProfile: (...args) => calls.profiles.push(args) }); };
  return { render, calls, query, ranking };
}
function nodes(tree) { return !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...tree.children.flatMap(nodes)]; }
function texts(tree) { return typeof tree === 'string' ? tree : !tree || typeof tree !== 'object' ? '' : (Array.isArray(tree) ? tree : tree.children).map(texts).join(' '); }
const find = (tree, label) => nodes(tree).find(n => n.type === 'TouchableOpacity' && n.props.accessibilityLabel === label);
const host = fixture(true);
let tree = host.render();
assert.ok(texts(tree).includes('Live Viewers'));
assert.equal(host.calls.autoClosePaused, false);
assert.ok(texts(tree).includes('Quiet viewer'));
assert.equal(nodes(tree).filter(n => n.type === 'Avatar' && n.props.uid === 1).length, 1);
assert.equal(nodes(tree).filter(n => n.type === 'TextInput').length, 0);
find(tree, 'Search viewers').props.onPress();
tree = host.render();
const input = nodes(tree).find(n => n.type === 'TextInput');
assert.equal(input.props.placeholder, 'Search viewers');
input.props.onChangeText('  QUIET  ');
tree = host.render();
assert.equal(nodes(tree).filter(n => n.type === 'Avatar').length, 1);
assert.ok(texts(tree).includes('Quiet viewer'));
find(tree, 'Search viewers').props.onPress();
tree = host.render();
assert.equal(nodes(tree).filter(n => n.type === 'TextInput').length, 0);
assert.equal(nodes(tree).filter(n => n.type === 'Avatar').length, 2, 'Collapse clears the search filter');
find(tree, 'Manage Gifter').props.onPress();
tree = host.render();
assert.equal(host.calls.autoClosePaused, true, 'Do not close a selected moderation panel automatically');
const mute = nodes(tree).find(n => n.type === 'TouchableOpacity' && texts(n) === 'Mute chat for this stream');
mute.props.onPress();
assert.equal(host.calls.actions[0].data.action, 'mute');
assert.equal(host.calls.actions[0].data.viewerUid, 1);
assert.ok(host.calls.moderationEnabled.every(Boolean));
assert.ok(!texts(tree).includes('Back to viewers'));
assert.ok(!texts(tree).includes('View profile'), 'Profile action is the avatar, not a text row');
find(tree, 'View profile').props.onPress();
assert.equal(host.calls.closes, 1);
assert.equal(host.calls.profiles[0][0], 1);

const audience = fixture(false);
tree = audience.render();
assert.ok(texts(tree).includes('Gifter'));
assert.ok(!texts(tree).includes('Quiet viewer'));
assert.ok(!texts(tree).includes('Restricted viewer'));
assert.ok(!texts(tree).includes('Not watching'), 'Ranking-only mode must not guess current presence');
assert.ok(audience.calls.moderationEnabled.every(enabled => enabled === false));
find(tree, 'Gifter').props.onPress();
assert.equal(audience.calls.closes, 1);
assert.equal(audience.calls.profiles[0][0], 1);
assert.equal(audience.calls.actions.length, 0);
console.log('PASS: host merged sheet, hidden/expanded search and reset, moderation action, audience cached-roster isolation and profile navigation.');
