import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../../mobile/app/go-live.tsx', import.meta.url), 'utf8');
const joinBody = source.match(/onJoinChannelSuccess: \(connection: any, elapsed: number\) => \{([\s\S]*?)\n          \},/)[1];
const stateBody = source.match(/onConnectionStateChanged: \(connection: any, state: number, reason: number\) => \{([\s\S]*?)\n          \},/)[1];
function fixture() {
  const result = { joined: true, error: null, diagnostic: null };
  const engine = {};
  const scope = {
    engine, engineRef: { current: engine }, mounted: true,
    mediaChannelRef: { current: 'host-live' },
    setHostJoined: value => { result.joined = value; },
    setCameraError: value => { result.error = value; },
    setCameraDiagnostic: value => { result.diagnostic = value; },
    console: { log() {} },
  };
  const join = new Function('connection', 'elapsed', ...Object.keys(scope), joinBody);
  const state = new Function('connection', 'state', 'reason', ...Object.keys(scope), stateBody);
  return { result, scope,
    join: channelId => join({ channelId }, 12, ...Object.values(scope)),
    state: (channelId, value) => state({ channelId }, value, 0, ...Object.values(scope)),
  };
}
test('ending Party and inviting a new partner cannot disconnect the remaining host', () => {
  const f = fixture();
  for (const channel of ['old-partner', 'new-partner']) {
    for (const state of [1, 4, 5]) f.state(channel, state);
  }
  assert.equal(f.result.joined, true);
  assert.equal(f.result.error, null);
  assert.equal(f.result.diagnostic, null);
});
test('partner joins cannot falsely reconnect a disconnected primary live', () => {
  const f = fixture();
  f.state('host-live', 1);
  assert.equal(f.result.joined, false);
  f.join('new-partner'); f.state('new-partner', 3);
  assert.equal(f.result.joined, false);
  f.join('host-live');
  assert.equal(f.result.joined, true);
  f.state('host-live', 5);
  assert.equal(f.result.joined, false);
  assert.match(f.result.error, /Could not connect/);
  f.state('host-live', 3);
  assert.equal(f.result.joined, true);
});
test('events after reset, from replaced engines, or without a channel are ignored', () => {
  const f = fixture();
  f.scope.mediaChannelRef.current = '';
  f.state('host-live', 1); f.state(undefined, 5);
  assert.equal(f.result.joined, true);
  f.scope.mediaChannelRef.current = 'host-live';
  f.scope.engineRef.current = {};
  f.state('host-live', 1);
  assert.equal(f.result.joined, true);
  f.scope.engineRef.current = f.scope.engine;
  f.scope.mounted = false;
  f.state('host-live', 1);
  assert.equal(f.result.joined, true);
});
test('Premium switch marks the new primary ready only after a successful switch', async () => {
  const start = source.indexOf('        if (isNative) await switchBroadcastChannel(');
  const end = source.indexOf('        setCameraError(null);', start) + '        setCameraError(null);'.length;
  const { code } = transformSync(`async function completeSwitch() { ${source.slice(start, end)} }`, { loader: 'ts' });
  for (const succeeds of [true, false]) {
    const f = fixture(); f.result.joined = false;
    const scope = { ...f.scope, isNative: true, token: { token: 'token', channelName: 'premium-live' }, user: { uid: 1 }, isMuted: false,
      activeChannelId: 'host-live', stillActive: () => true,
      liveStreamData: { stream: { requiredGift: {} } }, setIsPremium() {},
      switchBroadcastChannel: async () => {
        if (!succeeds) throw new Error('Switch failed');
        f.join('premium-live');
        assert.equal(f.result.joined, false, 'Uncommitted channel cannot set primary readiness');
      },
    };
    const run = () => new Function(...Object.keys(scope), `${code}; return completeSwitch();`)(...Object.values(scope));
    if (succeeds) {
      await run();
      assert.equal(f.scope.mediaChannelRef.current, 'premium-live');
      assert.equal(f.result.joined, true);
      f.state('host-live', 1); f.state('old-partner', 1);
      assert.equal(f.result.joined, true);
    } else {
      await assert.rejects(run(), /Switch failed/);
      assert.equal(f.result.joined, false);
      assert.equal(f.scope.mediaChannelRef.current, 'host-live');
    }
  }
});
