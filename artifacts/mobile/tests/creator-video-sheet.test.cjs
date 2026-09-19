const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require.resolve('../components/CreatorVideoSheet.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const state = [], refs = [];
let si = 0, ri = 0, effect, tick, rejectRefresh, resolveRefresh, refreshSignal, removed = false, libraryReads = 0;
const react = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState: initial => { const i = si++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
  useRef: initial => refs[ri++] ??= { current: initial }, useEffect: fn => { effect = fn; },
};
const rn = Object.fromEntries(['ActivityIndicator', 'Image', 'Modal', 'ScrollView', 'Switch', 'Text', 'TouchableOpacity', 'View'].map(k => [k, k]));
Object.assign(rn, { AppState: { currentState: 'active' }, Alert: {}, StyleSheet: { create: x => x, absoluteFill: {} } });
const mod = { exports: {} };
vm.runInNewContext(code, { module: mod, exports: mod.exports, AbortController,
  setInterval: fn => { tick = fn; return 1; }, clearInterval() {},
  require: id => {
    if (id === './VideoManagementPreview') return { VideoManagementPreview: 'VideoManagementPreview' };
    if (id === './VideoManagementSummary') return { VideoManagementSummary: 'VideoManagementSummary' };
    if (id === 'react') return react;
    if (id === 'react-native') return rn;
    if (id === '@expo/vector-icons') return { Ionicons: 'Icon' };
    if (id === '@clerk/expo') return { useAuth: () => ({ userId: 'owner', getToken: async () => 'token' }) };
    if (id === 'expo-router') return { useRouter: () => ({}) };
    if (id === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 0 }) };
    if (id === 'expo-image-picker') return {};
    if (id === '@/hooks/useColors') return { useColors: () => ({}) };
    if (id === '@/i18n') return { useAppLanguage: () => ({ t: (x, values = {}) => x.replace('{v0}', String(values.v0)), appLocale: () => 'en' }) };
    if (id === '@/utils/creatorVideos') return { videoRequest: async (path, _token, method = 'GET', _body, signal) => {
      if (path === '/library') { libraryReads++; return { videos: removed ? [] : [{ id: 'clip', filename: 'stuck.mp4', status: 'processing' }], selectedId: null, enabled: false, uploadsConfigured: true }; }
      if (path.endsWith('/refresh')) { refreshSignal = signal; return new Promise((yes, no) => { resolveRefresh = yes; rejectRefresh = no; }); }
      if (path === '/clip' && method === 'DELETE') { removed = true; return { removed: true }; }
      throw Error('Unexpected request');
    } };
    throw Error(id);
  },
});
function render() {
  si = ri = 0;
  const tree = mod.exports.CreatorVideoSheet({ visible: true, onClose() {} }), nodes = [];
  function walk(n) { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== 'object') return; nodes.push(n); walk(n.props?.children); }
  walk(tree); return nodes;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  render(); const cleanup = effect(); await flush();
  resolveRefresh({ encodingProgress: 63 }); await flush();
  assert.ok(render().some(n => n.type === 'Text' && n.props.children.includes('Processing video: 63%')));
  tick(); await flush(); resolveRefresh({ encodingProgress: 100 }); await flush();
  assert.ok(render().some(n => n.type === 'Text' && n.props.children.includes('Finalizing video…')));
  tick(); await flush();
  const button = render().find(n => n.type === 'TouchableOpacity' && n.props.children.some(c => c?.type === 'Text' && c.props.children.includes('Remove')));
  assert.ok(button); assert.ok(refreshSignal && !refreshSignal.aborted);
  button.props.onPress(); await flush();
  assert.ok(removed); assert.equal(refreshSignal.aborted, true, 'remove aborts in-flight polling');
  rejectRefresh(Error('Video not found.')); await flush();
  assert.ok(!render().some(n => n.props?.accessibilityLiveRegion === 'polite'), 'late 404 cannot show a false delete error');
  assert.ok(!render().some(n => n.type === 'Text' && n.props.children.includes('stuck.mp4')));
  const before = libraryReads; tick(); await flush();
  assert.ok(libraryReads > before, 'polling continues after deletion with a new request');
  cleanup();
  console.log('PASS: removal cancels pending processing poll, late 404 does not show error/restore the video, and polling resumes. Native UI mocked.');
})().catch(e => { console.error(e); process.exitCode = 1; });
