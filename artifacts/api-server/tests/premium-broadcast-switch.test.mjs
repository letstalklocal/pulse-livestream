import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
const { code } = transformSync(readFileSync(new URL('../../mobile/utils/switchBroadcastChannel.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' });
const module = { exports: {} };
new Function('module', 'exports', code)(module, module.exports);
const { switchBroadcastChannel } = module.exports;
function fixture(state = 3) {
  const events = [], handlers = new Set();
  return { events, handlers, engine: {
    getConnectionState: () => state,
    updateChannelMediaOptions: options => { events.push(['publish', options]); return 0; },
    registerEventHandler: handler => handlers.add(handler),
    unregisterEventHandler: handler => handlers.delete(handler),
    leaveChannel: () => { events.push(['leave']); setImmediate(() => { state = 1; for (const h of handlers) h.onLeaveChannel?.(); }); return 0; },
    muteLocalAudioStream: muted => events.push(['mute', muted]),
    joinChannel: (token, channel, uid, options) => { events.push(['join', channel, options]); setImmediate(() => { for (const h of handlers) h.onJoinChannelSuccess?.({ channelId: channel }); }); return 0; },
  } };
}
test('stops public publishing and leaves before joining protected media; preserves mute', async () => {
  const f = fixture();
  await switchBroadcastChannel(f.engine, 'token', 'protected', 10, true, () => true);
  assert.deepEqual(f.events.map(e => e[0]), ['publish', 'leave', 'mute', 'join']);
  assert.deepEqual(f.events[0][1], { publishCameraTrack: false, publishMicrophoneTrack: false });
  assert.equal(f.events[2][1], true);
  assert.equal(f.events[3][1], 'protected');
  assert.equal(f.events[3][2].publishMicrophoneTrack, true);
  assert.equal(f.handlers.size, 0);
});
test('retry from disconnected state does not wait for a second leave event', async () => {
  const f = fixture(1);
  await switchBroadcastChannel(f.engine, 'token', 'protected', 10, false, () => true);
  assert.deepEqual(f.events.map(e => e[0]), ['mute', 'join']);
});
test('ending the stream during leave prevents joining a new channel', async () => {
  const f = fixture();
  await switchBroadcastChannel(f.engine, 'token', 'protected', 10, false, () => false);
  assert.deepEqual(f.events.map(e => e[0]), ['publish', 'leave']);
});
test('pause failure prevents leaving or publishing elsewhere', async () => {
  const f = fixture(); f.engine.updateChannelMediaOptions = () => -1;
  await assert.rejects(switchBroadcastChannel(f.engine, 'token', 'protected', 10, false, () => true), /pause/);
  assert.equal(f.events.length, 0);
});

test('partner leave event cannot complete a primary media-channel switch', async () => {
  const f = fixture();
  f.engine.leaveChannel = () => {
    f.events.push(['leave']);
    setImmediate(() => {
      for (const h of f.handlers) h.onLeaveChannel?.({ channelId: 'partner' });
      assert.equal(f.events.some(event => event[0] === 'join'), false);
      for (const h of f.handlers) h.onLeaveChannel?.({ channelId: 'primary' });
    });
    return 0;
  };
  await switchBroadcastChannel(f.engine, 'token', 'protected', 10, false, () => true, 'primary');
  assert.equal(f.events.filter(event => event[0] === 'join').length, 1);
  assert.equal(f.handlers.size, 0);
});
