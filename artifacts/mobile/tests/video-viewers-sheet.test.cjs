const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require.resolve('../components/VideoViewersSheet.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
function harness(isOwner) {
  const values = []; let index = 0, closed = 0, resets = 0, profile, queryOptions;
  const data = { isOwner: true, viewers: 2, coins: 50, entries: [
    { uid: 2, name: 'Gifter', coins: 50, gifts: 1, watching: false },
    { uid: 3, name: 'Watcher', coins: 0, gifts: 0, watching: true },
  ] };
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const i = index++; if (!(i in values)) values[i] = initial; return [values[i], value => values[i] = typeof value === 'function' ? value(values[i]) : value]; } };
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: id => {
    if (id === 'react') return react;
    if (id === 'react-native') return { ...Object.fromEntries(['ActivityIndicator','FlatList','KeyboardAvoidingView','Modal','Text','TextInput','TouchableOpacity','View'].map(k => [k,k])), Platform: { OS: 'android' }, Keyboard: { dismiss() {} }, StyleSheet: { create: x => x, absoluteFill: {} } };
    if (id === '@clerk/expo') return { useAuth: () => ({ userId: isOwner ? 'host' : 'audience', getToken: async () => 'token' }) };
    if (id === '@tanstack/react-query') return { useQuery: options => { queryOptions = options; return { data, isError: false, isLoading: false }; } };
    if (id === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 24 }) };
    if (id === '@/i18n') return { useAppLanguage: () => ({ t: x => x, appLocale: () => 'en', localizedTextStyle: () => ({}) }) };
    if (id === '@/hooks/useIdleAutoClose') return { useIdleAutoClose: () => () => resets++ };
    return new Proxy({}, { get: (_, k) => k });
  } });
  function render() {
    index = 0; const tree = mod.exports.VideoViewersSheet({ videoId: 'clip', isOwner, onClose: () => closed++, onProfile: (...args) => profile = args });
    const nodes = []; function walk(n) { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== 'object') return; nodes.push(n); walk(n.props?.children); }
    walk(tree); return { nodes, button: label => nodes.find(n => n.type === 'TouchableOpacity' && n.props.accessibilityLabel === label), list: nodes.find(n => n.type === 'FlatList') };
  }
  return { render, data, closed: () => closed, resets: () => resets, profile: () => profile, options: () => queryOptions };
}
for (const owner of [true, false]) {
  const h = harness(owner); let v = h.render();
  assert.equal(v.list.props.data.length, owner ? 2 : 1, 'cached owner roster never leaks to audience');
  assert.equal(h.options().queryKey[1], owner ? 'host' : 'audience'); assert.equal(h.options().refetchInterval, 5000);
  assert.ok(!v.nodes.some(n => n.type === 'TextInput'), 'search starts collapsed');
  v.button('Search viewers').props.onPress(); v = h.render();
  v.nodes.find(n => n.type === 'TextInput').props.onChangeText('gift'); v = h.render();
  assert.equal(v.list.props.data.length, 1); assert.equal(v.list.props.data[0].rank, 1);
  assert.ok(h.resets() >= 2, 'search interactions renew idle timeout');
  const row = v.list.props.renderItem({ item: v.list.props.data[0] });
  assert.equal(JSON.stringify(row).includes('Not watching'), owner, 'only host sees individual presence');
  row.props.onPress(); assert.equal(h.closed(), 1); assert.deepEqual(h.profile(), [2, 'Gifter']);
  v.nodes.find(n => n.type === 'Modal').props.onRequestClose(); assert.equal(h.closed(), 2);
}
console.log('PASS: live-style video list privacy, account-scoped refresh, collapsed search/filter/rank, idle reset, profiles and dismissal. Native UI mocked.');
