const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync(require.resolve('../app/go-live.tsx'), 'utf8');
const start = source.indexOf('  const startLive = useCallback(');
const end = source.indexOf('\n  const saveStreamBackground', start);
const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
async function run(failure, allowed = true, premium = false) {
  const state = { starting: false, live: false, alerts: [], steps: [] };
  const scope = {
    AbortController, startingRequestRef: { current: null }, getToken: async () => "token", confirmVideoBeforeLive: async () => allowed,
    stickers: [{ kind: 'gift', giftId: 'rose' }], useCallback: fn => fn, title: 'test', category: 'Music', user: { uid: 1, name: 'test', streamBackgroundImagePath: 'saved' },
    isNative: true, cameraReady: true, engineRef: { current: {} }, isPrivateInvite: false, isPremium: premium,
    requiredGiftId: premium ? "rose" : null, invitationChannelId: null, privateInvitationId: null,
    t: x => x, Alert: { alert: (...args) => state.alerts.push(args) },
    setCameraError: x => { state.error = x; }, setIsStarting: x => { state.starting = x; },
    Haptics: { impactAsync() {}, notificationAsync() {}, ImpactFeedbackStyle: {}, NotificationFeedbackType: {} },
    channelIdRef: {}, pendingJoinRef: {}, mediaChannelRef: {}, isLiveRef: {}, durationRef: {},
    createStream: { mutateAsync: async ({ data }) => { assert.deepEqual(data.stickers, scope.stickers, 'Setup stickers accompany the original create request'); state.steps.push('create'); if (failure === 'create') throw new Error('timed out'); } },
    generateToken: { mutateAsync: async () => { state.steps.push('token'); if (failure === 'token') throw new Error('timed out'); return { token: 'ok', channelName: 'rtc' }; } },
    invitationAction: {}, endStream: { mutateAsync: async () => { state.steps.push('cleanup'); throw new Error('cleanup timed out'); } },
    setShowPremiumGiftSheet() {}, setShowLivePremium() {}, setActiveChannelId() {}, setIsBroadcasting() {},
    setIsLive: x => { state.live = x; }, setInterval: () => 1, setDuration() {}, console: { warn() {} },
  };
  const fn = new Function(...Object.keys(scope), code + '\nreturn startLive;')(...Object.values(scope));
  await Promise.all([fn(), fn()]);
  assert.equal(state.starting, false);
  if (!allowed) {
    assert.equal(state.live, false); assert.equal(state.alerts.length, 0); assert.deepEqual(state.steps, [], "Cancel creates no live, token or cleanup request");
  } else if (failure) {
    assert.equal(state.live, false);
    assert.equal(state.alerts.length, 1, 'Camera-ready failures must be visible');
    assert.match(state.alerts[0][1], failure === 'create' ? /Creating the stream/ : /Connecting the broadcast/);
    assert.deepEqual(state.steps, failure === 'create' ? ['create'] : ['create', 'token', 'cleanup']);
  } else {
    assert.equal(state.live, true);
    assert.deepEqual(state.steps, ["create", "token"], "rapid starts only create one live");
    assert.equal(scope.pendingJoinRef.current.channelId, 'rtc');
    assert.equal(state.alerts.length, 0);
  }
}
(async () => { await run('create'); await run('token'); await run(null); await run(null, false); await run(null, true, true); await run(null, false, true); console.log('PASS: visible startup failures, failed cleanup resets spinner, successful startup joins intended channel.'); })().catch(e => { console.error(e); process.exitCode = 1; });
