const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(require.resolve('../context/LivePlaybackContext.tsx'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function fixture(stored = null) {
  const slots = [], effects = [], intervals = new Map(), tokens = [], handlers = [], joins = [], presence = [];
  let cursor = 0, dirty = false, timer = 0, value;
  const f = { pathname: '/stream/room', user: { uid: 7 }, releases: 0, stored, failStorage: false,
    stream: { channelId: 'room', rtcChannelName: 'public', hostUid: 9, viewerAdmitted: false, requiredGift: null },
    premium: { request: null, removed: false, expired: false }, invitation: null, queryError: null };
  const depsEqual = (a, b) => a && b && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    createContext: () => ({ Provider: 'Provider' }),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { const result = typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(result, slots[i].value)) { slots[i].value = result; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(fn, deps) { const i = cursor++; if (!depsEqual(slots[i]?.deps, deps)) slots[i] = { deps, fn }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!depsEqual(slots[i]?.deps, deps)) { const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const engine = { initialize: () => 0, enableVideo: () => 0, enableAudio: () => 0,
    registerEventHandler: h => handlers.push(h), joinChannel: (_token, channel) => { joins.push(channel); return 0; },
    muteAllRemoteVideoStreams: () => 0, muteAllRemoteAudioStreams: () => 0,
    leaveChannel() {}, release: () => f.releases++ };
  const queryClient = { invalidateQueries: async () => {} };
  const api = {};
  vm.runInNewContext(code, { exports: api, console: { log() {}, warn() {} }, process: { env: { EXPO_PUBLIC_AGORA_APP_ID: 'test' } },
    setInterval: fn => { intervals.set(++timer, fn); return timer; }, clearInterval: id => intervals.delete(id),
    require(name) {
      if (name === 'react') return react;
      if (name === 'react-native') return { Platform: { OS: 'android' } };
      if (name === 'expo-router') return { usePathname: () => f.pathname };
      if (name === '@/context/AuthContext') return { useAuth: () => ({ user: f.user }) };
      if (name === '@react-native-async-storage/async-storage') return { getItem: async () => f.stored, setItem: async (_key, next) => { if (f.failStorage) throw Error('disk full'); f.stored = next; } };
      if (name === '@tanstack/react-query') return { useQueryClient: () => queryClient };
      if (name === '@/utils/agora') return { createEngine: () => engine, ChannelProfileType: { ChannelProfileLiveBroadcasting: 1 }, ClientRoleType: { ClientRoleAudience: 2 } };
      if (name === '@/hooks/useStreamSocket') return { useStreamSocket: options => { f.socket = options; } };
      if (name === '@/hooks/usePremiumGiftRequest') return { usePremiumGiftRequest: () => f.premium, premiumGiftRequestKey: id => [id] };
      if (name === '@/hooks/useLiveParty') return { useLiveParty: () => ({ party: null }) };
      if (name === '@/hooks/usePartyMedia') return { usePartyMedia: () => ({}) };
      if (name === '@workspace/api-client-react') return {
        useGenerateAgoraToken: () => ({ mutateAsync: () => new Promise((resolve, reject) => tokens.push({ resolve, reject })) }),
        useUpdateViewerCount: () => ({ mutate() {} }),
        useGetStream: channel => ({ data: channel ? { stream: f.stream } : undefined, isSuccess: !!channel, error: f.queryError, refetch: async () => {} }),
        useListStreams: () => ({ data: { streams: [] } }),
        useGetPrivateStreamInvitation: () => ({ data: { invitation: f.invitation } }),
        getGetStreamQueryKey: id => [id], updateStreamPresence: async (id, action) => presence.push([id, action.action]),
      };
      throw Error(name);
    },
  });
  f.render = () => { let n = 0; do { assert.ok(n++ < 30, 'No effect/render loop'); dirty = false; cursor = 0; value = api.LivePlaybackProvider({ children: null }).props.value; while (effects.length) effects.shift()(); } while (dirty); return value; };
  f.current = () => value;
  f.start = async (premium = false) => {
    f.stream.requiredGift = premium ? { id: 'rose' } : null;
    f.stream.viewerAdmitted = premium;
    f.render(); await flush(); f.render().attach('room'); f.render();
    tokens.at(-1).resolve({ token: 'token', channelName: 'public' }); await flush();
    handlers.at(-1).onJoinChannelSuccess({ channelId: 'public' }, 0);
    handlers.at(-1).onFirstRemoteVideoFrame({ channelId: 'public' }, 9, 720, 1280, 0);
    f.render();
  };
  f.tokens = tokens; f.joins = joins; f.presence = presence; f.intervals = intervals;
  return f;
}
(async () => {
  for (const premium of [false, true]) {
    const f = fixture(); await f.start(premium);
    assert.equal(f.current().joined, true);
    assert.equal(f.current().minimize('room'), true);
    // Back pops the route. Its cleanup must leave the media/presence untouched.
    f.current().detach('room'); f.pathname = '/'; f.render();
    assert.equal(f.current().minimized, true); assert.equal(f.current().canEnterStream, true);
    assert.equal(f.current().previewsBlocked, true, "Feed previews cannot replace PiP media");
    assert.equal(f.releases, 0); assert.equal(f.tokens.length, 1); assert.equal(f.joins.length, 1);
    assert.equal(f.presence.filter(p => p[1] === 'leave').length, 0);
    for (const tick of f.intervals.values()) tick();
    assert.ok(f.presence.filter(p => p[1] === 'join').length >= 2, 'Presence keeps refreshing in PiP');
    // Expand reattaches the viewer without buying admission or requesting another token.
    f.current().attach('room'); f.pathname = '/stream/room'; f.render();
    assert.equal(f.current().minimized, false); assert.equal(f.releases, 0); assert.equal(f.tokens.length, 1);
    f.current().minimize('room'); f.render(); f.current().close(); f.render();
    assert.equal(f.current().session, null); assert.equal(f.releases, 1); assert.equal(f.intervals.size, 0);
    assert.equal(f.current().previewsBlocked, false);
  }
  {
    const f = fixture(); await f.start();
    f.stream.requiredGift = { id: 'rose' }; f.stream.rtcChannelName = 'paid'; f.render();
    assert.equal(f.current().canEnterStream, false); assert.equal(f.releases, 1);
    f.current().admit('room'); f.render(); f.tokens.at(-1).resolve({ token: 'paid', channelName: 'paid' }); await flush(); f.render();
    f.current().minimize('room'); f.current().detach('room'); f.pathname = '/'; f.render();
    assert.equal(f.current().canEnterStream, true, 'A just-paid admission survives Back before query refresh');
    assert.equal(f.releases, 1); assert.equal(f.tokens.length, 2);
    f.current().attach('room'); f.render(); assert.equal(f.current().session.admitted, true);
    assert.equal(f.tokens.length, 2, 'Expand preserves the same paid media connection');
  }
  for (const event of ['stream_restricted', 'stream_ended']) {
    const f = fixture(); await f.start(true); f.current().minimize('room'); f.render();
    f.socket.onMessage({ data: JSON.stringify({ type: event }) }); f.render();
    assert.equal(f.current().session, null); assert.equal(f.releases, 1, event);
  }
  for (const trigger of ['expiry', 'block', 'private-end', 'account', 'host', '404', '403']) {
    const f = fixture(); await f.start(true); f.current().minimize('room'); f.render();
    if (trigger === 'expiry') f.premium.expired = true;
    if (trigger === 'block') f.stream.viewerBlocked = true;
    if (trigger === 'private-end') f.invitation = { status: 'ended' };
    if (trigger === 'account') f.user = { uid: 11 };
    if (trigger === 'host') f.pathname = '/go-live';
    if (trigger === '404' || trigger === '403') f.queryError = { status: Number(trigger) };
    f.render(); assert.equal(f.current().session, null, trigger); assert.equal(f.releases, 1, trigger);
  }
  {
    const f = fixture('false'); await f.start(); assert.equal(f.current().minimize('room'), false);
    f.current().detach('room'); f.render(); assert.equal(f.releases, 1, 'Disabled PiP leaves normally');
    await f.current().saveEnabled(true); f.render(); assert.equal(f.stored, 'true');
  }
  {
    const f = fixture(); await f.start(); f.current().minimize('room'); f.render();
    f.failStorage = true; await assert.rejects(f.current().saveEnabled(false)); f.render();
    assert.equal(f.current().enabled, true); assert.equal(f.current().minimized, true); assert.equal(f.releases, 0);
    f.failStorage = false; await f.current().saveEnabled(false); f.render();
    assert.equal(f.current().session, null); assert.equal(f.current().enabled, false); assert.equal(f.stored, 'false'); assert.equal(f.releases, 1);
  }
  {
    const f = fixture(); f.render(); await flush(); f.render().attach('room'); f.render();
    f.current().minimize('room'); f.current().detach('room'); f.render();
    f.current().close(); f.render(); f.tokens[0].resolve({ token: 'late', channelName: 'public' }); await flush(); f.render();
    assert.equal(f.joins.length, 0, 'Closing during connection prevents a late token from joining'); assert.equal(f.releases, 1);
  }
  console.log('PASS: regular/Premium Back retains media, admission and presence; expand without rejoin; close/disable; conversion; revocation/end/expiry/account/host cleanup; saved preference and write failure; late token cancellation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
