const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require.resolve('../app/video/[id].tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
function harness(owner, { canGoBack = true, failVisibility = false } = {}) {
  const state = [], refs = [], requests = [], shared = [], follows = [], navigations = [], alerts = [], replacements = [];
  let si = 0, ri = 0, keyboard = false, backs = 0, following = false;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const i = si++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useRef: initial => refs[ri++] ??= { current: initial }, useEffect() {}, useCallback: fn => fn,
  };
  const rn = Object.fromEntries(['ActivityIndicator', 'Modal', 'ScrollView', 'Text', 'TextInput', 'TouchableOpacity', 'View'].map(k => [k, k]));
  Object.assign(rn, { AppState: { currentState: 'active' }, Platform: { OS: 'android' }, Keyboard: { dismiss() {} }, Alert: { alert: (...args) => alerts.push(args) }, Share: { share: async data => shared.push(data) }, StyleSheet: { create: x => x, absoluteFill: {} } });
  const mod = { exports: {} };
  let uuid = 0;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, process: { env: { EXPO_PUBLIC_DOMAIN: 'test.example' } },
    require: id => {
      if (id === 'react') return react;
      if (id === 'react-native') return rn;
      if (id === 'expo-router') return { useLocalSearchParams: () => ({ id: 'clip' }), useRouter: () => ({ back: () => backs++, canGoBack: () => canGoBack, replace: target => replacements.push(target), push: target => navigations.push(target) }), useIsFocused: () => true };
      if (id === 'expo') return { requireOptionalNativeModule: () => ({}) };
      if (id === '@clerk/expo') return { useAuth: () => ({ getToken: async () => 'token', userId: 'account' }) };
      if (id === '@tanstack/react-query') return { useQuery: ({ queryKey }) => ({ data: queryKey[0] === 'creator-video' ? { id: 'clip', ownerUid: 1, ownerName: 'Host', playbackUrl: 'https://example/clip.mp4', coins: 20, viewers: 3 } : { messages: [] }, isError: false, refetch: async () => {} }) };
      if (id === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 40, bottom: 24 }) };
      if (id === 'react-native-keyboard-controller') return { KeyboardAvoidingView: 'KeyboardAvoidingView', useKeyboardState: fn => fn({ isVisible: keyboard }) };
      if (id === 'expo-crypto') return { randomUUID: () => String(++uuid) };
      if (id === '@workspace/api-client-react') return { useGetCoinBalance: () => ({ data: { balance: 100 }, refetch: async () => {} }), getGetCoinBalanceQueryKey: () => [], useGetFollowStatus: () => ({ data: { isFollowing: following }, refetch() {} }), getGetFollowStatusQueryKey: () => [], useFollowUser: () => ({ isPending: false, mutate: value => follows.push(value) }) };
      if (id === '@/context/AuthContext') return { useAuth: () => ({ user: { uid: owner ? 1 : 2, name: 'Test' } }) };
      if (id === '@/context/LivePlaybackContext') return { useLivePlayback: () => ({ previewsBlocked: false }) };
      if (id === '@/i18n') return { useAppLanguage: () => ({ t: x => x, appLocale: () => 'en' }) };
      if (id === '@/utils/creatorVideos') return { videoRequest: async (...args) => {
        requests.push(args);
        if (failVisibility && args[0] === '/visibility') throw Error('Service unavailable');
      } };
      if (id === '@/utils/videoCache') return { videoCache: {} };
      if (id === '@/utils/videoCache/core') return { VIDEO_CACHE_TTL_MS: 86400000 };
      if (id === '@/components/CachedVideoPlayer') return { default: 'Player' };
      return new Proxy({}, { get: (_, key) => key });
    },
  });
  function render() {
    si = ri = 0;
    const tree = mod.exports.default(), nodes = [];
    function walk(n) { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== 'object') return; nodes.push(n); walk(n.props?.children); }
    walk(tree); return { nodes, button: label => nodes.find(n => n.type === 'TouchableOpacity' && n.props.accessibilityLabel === label) };
  }
  render(); state[1] = { uri: 'file:///clip.mp4' }; // Completed native cache lease, mocked.
  return { render, requests, shared, follows, navigations, alerts, replacements, setFollowing: value => { following = value; }, backs: () => backs, keyboard: value => { keyboard = value; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  for (const owner of [true, false]) {
    const h = harness(owner); let v = h.render();
    assert.equal(v.nodes.some(n => n.type?.name === 'PreviewNotice'), owner, 'preview notice is visible only for the creator');
    assert.ok(v.button('Follow')); assert.equal(v.button('Follow').props.disabled, false);
    const hearts = v.nodes.find(n => n.type === 'LiveReactions');
    assert.equal(hearts.props.channelId, 'creator-video:clip'); assert.equal(hearts.props.selectedEmoji, '❤️'); assert.equal(hearts.props.canSend, true);
    assert.ok(!v.button('Change emoji'));
    assert.ok(v.button('Send a Gift')); assert.equal(v.button('Send a Gift').props.disabled, false); assert.ok(v.button('More'));
    assert.ok(v.nodes.some(n => n.props?.testID === 'video-gift-total' && n.props.children[0] === '20'));
    assert.ok(v.nodes.some(n => n.props?.testID === 'video-viewer-count' && n.props.children[0] === '3'));
    const noticeKey = () => h.render().nodes.find(n => n.type?.name === 'PreviewNotice')?.props.key;
    const initialNotice = noticeKey();
    v.button('Follow').props.onPress(); assert.equal(h.follows.length, owner ? 0 : 1);
    if (!owner) {
      h.setFollowing(true); h.render().button('Messages').props.onPress();
      assert.equal(h.navigations[0].pathname, '/dm/[peerId]');
      assert.equal(h.navigations[0].params.peerId, '1');
      assert.equal(h.navigations[0].params.peerName, 'Host', 'DM receives its expected immediate header name');
      h.setFollowing(false);
    }
    const followNotice = noticeKey();
    if (owner) assert.notEqual(followNotice, initialNotice, 'Follow restarts the fading explanation');
    v.button('Send a Gift').props.onPress(); v = h.render();
    if (owner) assert.notEqual(noticeKey(), followNotice, 'Gift restarts the fading explanation');
    const picker = v.nodes.find(n => n.type === 'GiftPicker');
    assert.equal(picker.props.visible, !owner, 'owner cannot open the gift picker');
    picker.props.onSend({ id: 'rose', emoji: '🌹', name: 'Rose', coins: 1, size: 36 }); await flush();
    assert.equal(h.requests.filter(r => r[0].endsWith('/gifts')).length, owner ? 0 : 1, 'owner previews never send a payment; audience gifts use API');
    assert.equal(h.render().nodes.some(n => n.type === 'GiftFloater'), !owner, 'owner cannot trigger gift effects through a stale callback');
    v = h.render(); v.button('Viewers').props.onPress(); v = h.render();
    const viewersSheet = v.nodes.find(n => n.type === 'VideoViewersSheet');
    assert.ok(viewersSheet); assert.equal(viewersSheet.props.videoId, 'clip'); assert.equal(viewersSheet.props.isOwner, owner);
    viewersSheet.props.onClose();
    v = h.render(); v.button('More').props.onPress(); v = h.render();
    assert.equal(!!v.button('Replace video'), owner);
    assert.equal(!!v.button('Turn off video'), owner);
    if (owner) {
      v.button('Replace video').props.onPress(); v = h.render();
      const replacement = v.nodes.find(n => n.type === 'CreatorVideoSheet');
      assert.ok(replacement.props.visible);
      assert.ok(!replacement.props.openPickerOnShow, 'Replace opens management without launching the device picker');
      replacement.props.onClose();
      v = h.render(); v.button('More').props.onPress(); v = h.render();
      v.button('Turn off video').props.onPress(); await flush();
      assert.equal(h.requests.filter(r => r[0] === '/visibility').length, 0, 'menu tap only asks for confirmation');
      let prompt = h.alerts.at(-1);
      assert.equal(prompt[0], 'Turn off video'); assert.equal(prompt[3].cancelable, true);
      const cancel = prompt[2].find(button => button.text === 'Cancel');
      assert.equal(cancel.style, 'cancel'); cancel.onPress?.(); await flush();
      assert.equal(h.requests.filter(r => r[0] === '/visibility').length, 0, 'Cancel leaves video on');
      assert.equal(h.backs(), 0, 'Cancel keeps playback open');
      assert.equal(h.render().nodes.find(n => n.type === 'Modal').props.visible, true, 'Cancel returns to the menu');
      v.button('Turn off video').props.onPress(); prompt = h.alerts.at(-1);
      const confirm = prompt[2].find(button => button.text === 'Turn off video');
      const alertCount = h.alerts.length;
      confirm.onPress(); confirm.onPress(); await flush();
      assert.equal(h.alerts.length, alertCount, "success closes playback without a second OK-only alert");
      assert.equal(h.backs(), 1, 'confirmed successful turn-off closes playback');
      const off = h.requests.filter(r => r[0] === '/visibility');
      assert.equal(off.length, 1, 'rapid taps disable once'); assert.equal(off[0][2], 'PUT'); assert.equal(off[0][3].enabled, false);
      v = h.render(); v.button('More').props.onPress(); v = h.render();
    }
    assert.equal(v.nodes.find(n => n.type === 'Modal').props.visible, true);
    v.button('Share').props.onPress(); await flush(); assert.equal(h.shared[0].message, 'https://test.example/video/clip');
    v = h.render(); v.button('More').props.onPress(); v = h.render();
    v.button('Exit Video').props.onPress(); assert.equal(h.backs(), owner ? 2 : 1);
    h.keyboard(true); v = h.render(); assert.ok(!v.button('More')); assert.ok(!v.button('Send a Gift')); assert.ok(v.button('Send'));
    h.keyboard(false); assert.ok(h.render().button('More'));
  }
  for (const failVisibility of [false, true]) {
    const h = harness(true, { canGoBack: false, failVisibility });
    h.render().button('More').props.onPress();
    h.render().button('Turn off video').props.onPress();
    h.alerts.at(-1)[2].find(button => button.text === 'Turn off video').onPress();
    await flush();
    assert.equal(h.backs(), 0);
    assert.equal(h.replacements.length, failVisibility ? 0 : 1, 'failed disabling never closes playback');
    if (!failVisibility) assert.equal(h.replacements[0], '/(tabs)', 'direct entry exits to Discovery');
    else assert.equal(h.alerts.at(-1)[1], 'Service unavailable');
  }
  console.log('PASS: owner/audience controls and counters, disabled owner Follow/Gift controls, real audience gift/follow actions, three-dot share/exit and keyboard control restoration. Native rendering mocked.');
})().catch(e => { console.error(e); process.exitCode = 1; });
