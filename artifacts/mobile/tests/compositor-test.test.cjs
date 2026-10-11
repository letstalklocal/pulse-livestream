const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('artifacts/mobile/utils/compositorTestConnection.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { module: mod, exports: mod.exports, require });
const { openCompositorTest } = mod.exports;
const config = { token: 'test-only', channelName: 'isolated-output', uid: 12, publisherUid: 42, hostUid: 7 };
function fixture(fail = false) {
  let valid = true, handler;
  const calls = [];
  const engine = {
    registerEventHandler(h) { handler = h; }, unregisterEventHandler() { calls.push('unregister'); },
    muteRemoteAudioStreamEx(uid, mute, c) { calls.push(['mute', uid, mute, c.channelId]); return 0; },
    joinChannelEx(_t, c, opts) { calls.push(['join', c.channelId]); assert.equal(opts.publishCameraTrack, false); assert.equal(opts.publishMicrophoneTrack, false); return fail ? -3 : 0; },
    leaveChannelEx(c) { calls.push(['leave', c.channelId]); return 0; },
    release() { assert.fail('Must not release engine'); }, leaveChannel() { assert.fail('Must not leave primary'); },
  };
  return { calls, lease: { engine, isCurrent: () => valid, primaryConnection: { channelId: 'primary', localUid: 12 } },
    stale() { valid = false; }, event() { return handler; } };
}
let f = fixture(), ready = 0;
const session = openCompositorTest(f.lease, config, () => ready++, () => {});
f.event().onFirstRemoteVideoFrame({ channelId: 'primary' }, 42); assert.equal(ready, 0);
f.event().onFirstRemoteVideoFrame({ channelId: 'isolated-output' }, 42); assert.equal(ready, 1);
session.close(); session.close();
assert.equal(f.calls.filter(c => c[0] === 'leave').length, 1);
assert.deepEqual(f.calls.at(-1), ['mute', 7, false, 'primary']);
f = fixture(); f.lease.primaryConnection = null;
const demo = openCompositorTest(f.lease, config, () => {}, () => {}); demo.close();
assert.equal(f.calls.filter(c => c[0] === 'mute').length, 0, 'Demo has no primary host audio to mute');
assert.equal(f.calls.filter(c => c[0] === 'leave').length, 1);
f = fixture(); const stale = openCompositorTest(f.lease, config, () => {}, () => {});
f.stale(); const count = f.calls.length; stale.close(); assert.equal(f.calls.length, count);
f = fixture(true); assert.throws(() => openCompositorTest(f.lease, config, () => {}, () => {}));
assert.deepEqual(f.calls.at(-1), ['mute', 7, false, 'primary']);
const picker = fs.readFileSync('artifacts/mobile/components/GiftPicker.tsx', 'utf8');
assert.match(picker, /__DEV__ && Platform.OS === "android" && !!onServerGiftTest/);
assert.match(picker, /onPress=\{onServerGiftTest\}/);
assert.ok(!picker.slice(picker.indexOf('testID="server-gift-test-start"'), picker.indexOf('testID="server-gift-test-start"') + 350).includes('onSend'));
console.log('PASS: isolated secondary join, no camera/mic publication, event filtering, primary audio restoration, stale lease and failed-join cleanup; Android/dev-only test button bypasses payment. Native SDK mocked.');
