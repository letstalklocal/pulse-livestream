const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require.resolve('../components/CreatorVideoSheet.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const state = [], refs = [], requests = [], routes = []; let si = 0, ri = 0, effect, closed = 0;
const library = { selectedId: 'current', enabled: true, uploadsConfigured: true, videos: [
  { id: 'current', filename: 'current.mp4', status: 'ready', thumbnailUrl: 'current.jpg', playbackUrl: 'current.mp4' },
  { id: 'older', filename: 'older.mp4', status: 'ready', thumbnailUrl: 'older.jpg', playbackUrl: 'older.mp4' },
] };
const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState: initial => { const i = si++; if (!(i in state)) state[i] = initial; return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; },
  useRef: initial => refs[ri++] ??= { current: initial }, useEffect: fn => { effect = fn; } };
const mod = { exports: {} };
vm.runInNewContext(code, { module: mod, exports: mod.exports, AbortController, setInterval: () => 1, clearInterval() {}, require: id => {
  if (id === 'react') return react;
  if (id === 'react-native') return { ...Object.fromEntries(['ActivityIndicator','Image','Modal','ScrollView','Switch','Text','TouchableOpacity','View'].map(x => [x,x])), AppState: { currentState: 'active' }, StyleSheet: { create: x => x, absoluteFill: {} } };
  if (id === '@clerk/expo') return { useAuth: () => ({ userId: 'host', getToken: async () => 'token' }) };
  if (id === 'expo-router') return { useRouter: () => ({ push: target => routes.push(target) }) };
  if (id === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 24 }) };
  if (id === '@/hooks/useColors') return { useColors: () => ({}) };
  if (id === '@/i18n') return { useAppLanguage: () => ({ t: x => x, appLocale: () => 'en' }) };
  if (id === '@/utils/creatorVideos') return { videoRequest: async (url, _token, method, body) => {
    requests.push({ url, method, body });
    if (url === '/selection') { library.selectedId = body.id; library.enabled = false; return {}; }
    if (url.endsWith('/stats')) return { viewers: 12, averageWatchSeconds: 8, coins: 40, senders: [], gifts: [] };
    if (url === '/library') return { ...library };
    throw Error(url);
  } };
  return new Proxy({}, { get: (_, key) => key });
} });
function render() {
  si = ri = 0; const nodes = [];
  function walk(n) { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== 'object') return; nodes.push(n); walk(n.props?.children); }
  walk(mod.exports.CreatorVideoSheet({ visible: true, onClose: () => closed++ }));
  return { nodes, button: label => nodes.find(n => n.type === 'TouchableOpacity' && (n.props.accessibilityLabel === label || n.props.children.some(c => c?.type === 'Text' && c.props.children.includes(label)))) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  render(); const cleanup = effect(); await flush(); let v = render();
  assert.equal(v.button('Video').props.accessibilityState.selected, true);
  assert.ok(v.nodes.find(n => n.type === 'VideoManagementPreview'));
  assert.equal(v.nodes.find(n => n.type === 'VideoManagementSummary').props.videoId, 'current');
  assert.ok(!v.button('Preview'), 'no separate Preview button');
  assert.ok(!v.nodes.some(n => n.type === 'Text' && n.props.children.includes('older.mp4')), 'history is not mixed into the Video tab');
  assert.ok(v.nodes.findIndex(n => n.type === 'Switch') < v.nodes.findIndex(n => n.type === 'VideoManagementPreview'), 'Discovery remains at the top');
  v.button('History').props.onPress(); v = render();
  assert.equal(v.button('History').props.accessibilityState.selected, true); assert.ok(!v.nodes.some(n => n.type === 'VideoManagementPreview'), 'switching tabs removes playback');
  assert.ok(v.nodes.some(n => n.type === 'Text' && n.props.children.includes('older.mp4')));
  assert.ok(v.button('Show details'));
  v.button('Use this video').props.onPress(); await flush(); v = render();
  assert.equal(v.button('Video').props.accessibilityState.selected, true);
  assert.equal(v.nodes.find(n => n.type === 'VideoManagementPreview').props.video.id, 'older');
  assert.equal(v.nodes.find(n => n.type === 'Switch').props.value, false, 'selecting history does not enable Discovery');
  v.nodes.find(n => n.type === 'VideoManagementSummary').props.onDetails(); await flush(); v = render();
  assert.ok(v.nodes.some(n => n.type === 'Text' && n.props.children.includes('Video stats'))); assert.ok(!v.button('Video'));
  assert.ok(requests.some(r => r.url === '/older/stats'));
  v.button('Back').props.onPress(); v = render(); assert.ok(v.button('Video'));
  v.nodes.find(n => n.type === 'VideoManagementPreview').props.onExpand(); assert.equal(closed, 1); assert.equal(routes[0], '/video/older');
  cleanup();
  console.log('PASS: Video/History separation, top visibility control, summary/details, historical selection, no auto-enable, playback removal on tab change and full-screen access. Native UI mocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
