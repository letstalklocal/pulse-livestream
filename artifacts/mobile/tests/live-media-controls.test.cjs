const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => { assert.ok(name in imports, name); return imports[name]; }, console });
  return exports;
}
const media = load(require.resolve('../utils/liveMediaControls.ts'));
const calls = [];
const engine = {
  muteLocalVideoStream: muted => { calls.push(['video', muted]); return 0; },
  muteLocalAudioStream: muted => { calls.push(['audio', muted]); return 0; },
  stopAllEffects: () => { calls.push(['effects']); return 0; },
  updateChannelMediaOptions: options => { calls.push(['publish', { ...options }]); return 0; },
  switchCamera: () => { calls.push(['flip']); return 0; },
};
media.setBroadcastPaused(engine, true, false);
assert.deepEqual(calls, [['video', true], ['audio', true], ['effects'], ['publish', { publishCameraTrack: false, publishMicrophoneTrack: false }]]);
calls.length = 0;
media.setBroadcastPaused(engine, false, true);
assert.deepEqual(calls, [['publish', { publishCameraTrack: true, publishMicrophoneTrack: true }], ['video', false], ['audio', true]], 'Resume retains the pre-pause microphone preference');
media.flipBroadcastCamera(engine);
assert.deepEqual(calls.at(-1), ['flip']);
assert.throws(() => media.flipBroadcastCamera({ switchCamera: () => -1 }));
calls.length = 0;
assert.throws(() => media.setBroadcastPaused({ ...engine, muteLocalVideoStream: value => { calls.push(['video', value]); return value ? 0 : -1; } }, false, false));
assert.deepEqual(calls.slice(-3), [['video', true], ['audio', true], ['publish', { publishCameraTrack: false, publishMicrophoneTrack: false }]], 'Failed resume returns to muted, unpublished media');
// Run the actual async screen handler for lost responses, duplicate taps and teardown.
const source = fs.readFileSync(require.resolve('../app/go-live.tsx'), 'utf8');
const start = source.indexOf('  const togglePause = async () =>');
const end = source.indexOf('  const resetLiveSetup', start);
const handler = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture({ saved = false, fail = false, confirmed = false, wait = null } = {}) {
  const state = { paused: saved, writes: [], media: [], alerts: [], busy: false };
  const scope = {
    pauseBusyRef: { current: false }, premiumConnecting: false, channelIdRef: { current: 'live' }, engineRef: { current: engine },
    pausedRef: { current: saved }, isLiveRef: { current: true }, isNative: true, isMuted: true, getToken() {},
    setPauseBusy: x => state.busy = x, setShowLiveMenu() {}, setIsPaused: x => state.paused = x,
    setBroadcastPaused: (_engine, paused, muted) => state.media.push({ paused, muted }),
    stopMomentProof() {}, stopMomentRecording() {}, queryClient: { invalidateQueries() {} }, getGetStreamQueryKey: x => [x],
    stickerApi: async (_path, _token, _method, body) => { state.writes.push(body); if (wait) await wait; if (fail) throw Error('lost response'); },
    getStream: async () => confirmed === null ? null : { stream: { paused: confirmed } },
    Alert: { alert: x => state.alerts.push(x) }, t: x => x,
  };
  return { state, scope, toggle: new Function(...Object.keys(scope), handler + '\nreturn togglePause;')(...Object.values(scope)) };
}
(async () => {
  const pause = fixture(); await pause.toggle(); assert.equal(pause.state.paused, true); assert.equal(pause.state.writes[0].paused, true);
  const resume = fixture({ saved: true }); await resume.toggle(); assert.equal(resume.state.paused, false); assert.equal(resume.state.media[0].muted, true);
  const lost = fixture({ fail: true, confirmed: true }); await lost.toggle(); assert.equal(lost.state.paused, true, 'Committed pause survives a lost response');
  const rejected = fixture({ fail: true, confirmed: false }); await rejected.toggle(); assert.equal(rejected.state.paused, false, 'Rejected pause restores confirmed state');
  const unknown = fixture({ saved: true, fail: true, confirmed: null }); await unknown.toggle(); assert.equal(unknown.state.paused, true, 'Unknown server state stays paused');
  let release; const pending = new Promise(resolve => release = resolve);
  const rapid = fixture({ wait: pending }); const first = rapid.toggle(); await rapid.toggle(); assert.equal(rapid.state.writes.length, 1); release(); await first;
  let releaseLate; const late = fixture({ wait: new Promise(resolve => releaseLate = resolve), fail: true, confirmed: true });
  const old = late.toggle(); late.scope.channelIdRef.current = 'new-live'; late.scope.pausedRef.current = false; late.state.paused = false; releaseLate(); await old;
  assert.equal(late.state.paused, false, 'Late old-session error cannot pause a newly started live');
  console.log('PASS: pause stops media/effects without leaving; resume preserves mute; camera failures; lost-response reconciliation, rapid taps and late-session protection.');
})().catch(error => { console.error(error); process.exitCode = 1; });
