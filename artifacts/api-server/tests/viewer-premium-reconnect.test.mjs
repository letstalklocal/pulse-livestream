import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../../mobile/context/LivePlaybackContext.tsx', import.meta.url), 'utf8');
const start = source.indexOf('  // Join Agora channel on native');
const end = source.indexOf('  // Once joined,', start);
const { code } = transformSync(source.slice(start, end), { loader: 'ts' });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fixture() {
  const tokens = [], handlers = [], joins = [];
  const state = { joined: true, uid: 9, ready: true, error: null, releases: 0, leaves: 0 };
  // The installed SDK returns this SAME JS wrapper after release/create.
  const engine = {
    initialize: () => 0, enableVideo: () => 0, enableAudio: () => 0,
    registerEventHandler: handler => handlers.push(handler),
    joinChannel: (_, channel) => { joins.push(channel); return 0; },
    muteAllRemoteVideoStreams: () => 0, muteAllRemoteAudioStreams: () => 0,
    leaveChannel: () => { state.leaves++; }, release: () => { state.releases++; },
  };
  const scope = {
    channelId: 'public-room', isNative: true, canEnterStream: true,
    stream: { rtcChannelName: 'public-room' }, user: { uid: 7 },
    engineRef: { current: null }, streamEndedRef: { current: false }, primaryRtcChannelRef: { current: '' },
    createEngine: () => engine, ChannelProfileType: { ChannelProfileLiveBroadcasting: 1 },
    ClientRoleType: { ClientRoleAudience: 2 }, process: { env: { EXPO_PUBLIC_AGORA_APP_ID: 'test' } },
    generateToken: { mutateAsync: () => new Promise((resolve, reject) => tokens.push({ resolve, reject })) },
    setJoined: v => { state.joined = v; }, setRemoteUid: v => { state.uid = v; },
    setRemoteVideoReady: v => { state.ready = v; }, setAgoraError: v => { state.error = v; },
    setRestrictedByEvent() {}, queryClient: { invalidateQueries() {} }, getGetStreamQueryKey: v => [v],
    updateViewers: { mutate() {} }, console: { log() {}, warn() {} },
  };
  const run = (allowed = true) => {
    scope.canEnterStream = allowed;
    let cleanup;
    new Function('useEffect', ...Object.keys(scope), code)(fn => { cleanup = fn(); }, ...Object.values(scope));
    return cleanup;
  };
  return { scope, state, engine, tokens, handlers, joins, run };
}
for (const outcome of ['resolve', 'reject']) {
  test(`late ${outcome} from public token request cannot release paid Premium connection`, async () => {
    const f = fixture();
    const leavePublic = f.run();
    leavePublic();
    f.run(false);
    assert.equal(f.state.joined, false);
    assert.equal(f.state.uid, null);
    assert.equal(f.state.ready, false);
    f.scope.stream.rtcChannelName = 'premium-room';
    const leavePremium = f.run();
    f.tokens[1].resolve({ token: 'paid-token', channelName: 'premium-room' });
    await flush();
    f.handlers[1].onJoinChannelSuccess({ channelId: 'premium-room' }, 0);
    f.handlers[1].onFirstRemoteVideoFrame({ channelId: 'premium-room' }, 9, 720, 1280, 0);
    assert.equal(f.state.joined, true);
    assert.equal(f.state.ready, true);
    if (outcome === 'resolve') f.tokens[0].resolve({ token: 'old-token', channelName: 'public-room' });
    else f.tokens[0].reject(new Error('old token rejected'));
    await flush();
    assert.equal(f.state.releases, 1, 'Only the old attempt was released');
    assert.equal(f.scope.engineRef.current, f.engine);
    assert.deepEqual(f.joins, ['premium-room']);
    assert.equal(f.state.error, null);
    leavePremium();
    assert.equal(f.state.releases, 2);
  });
}
test('public rendering is cleared while admission blocks access; no token requested', () => {
  const f = fixture();
  f.run(false);
  assert.equal(f.state.joined, false);
  assert.equal(f.state.ready, false);
  assert.equal(f.state.uid, null);
  assert.equal(f.tokens.length, 0);
});
test('current setup failure still releases its engine and exposes an error', async () => {
  const f = fixture();
  const cleanup = f.run();
  f.tokens[0].reject(new Error('token unavailable'));
  await flush();
  assert.equal(f.state.error, 'token unavailable');
  assert.equal(f.state.releases, 1);
  cleanup();
  assert.equal(f.state.releases, 1, 'Cleanup must be idempotent after failure');
});
