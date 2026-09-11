import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../../mobile/app/go-live.tsx', import.meta.url), 'utf8');
const start = source.indexOf('  // Send a heartbeat every 20 s');
const effect = source.slice(start, source.indexOf('  const formatDuration', start));
const { code } = transformSync(effect, { loader: 'ts' });
function fixture() {
  let cleanup, tick;
  const requests = [], alerts = [], stopped = [];
  const state = {
    t: source => source,
    isLive: true, activeChannelId: 'live-a', isPrivateInvite: false, privateInvitationId: '',
    channelIdRef: { current: 'live-a' }, isLiveRef: { current: true },
    heartbeatMutateRef: { current: (body, callbacks) => requests.push({ body, callbacks }) },
    privateHeartbeatRef: { current: () => {} }, privateHeartbeatFailuresRef: { current: 0 },
    stopLiveRef: { current: () => stopped.push('private') },
    serverEndedShutdownRef: { current: () => stopped.push('server') },
    setShowParty: () => {}, Alert: { alert: (...args) => alerts.push(args) },
    useEffect: (fn, deps) => {
      assert.deepEqual(deps, [true, 'live-a', false, '']);
      cleanup = fn();
    },
    setInterval: (fn, delay) => { assert.equal(delay, 20000); tick = fn; return 1; },
    clearInterval: () => { tick = undefined; },
  };
  new Function(...Object.keys(state), code)(...Object.values(state));
  return { state, requests, alerts, stopped, tick: () => tick?.(), cleanup: () => cleanup() };
}
test('heartbeat uses a stable interval and closes a confirmed ended session', () => {
  const f = fixture();
  assert.equal(f.requests.length, 1);
  f.tick();
  assert.equal(f.requests.length, 2);
  f.requests[0].callbacks.onError({ status: 500 });
  assert.equal(f.stopped.length, 0);
  f.requests[1].callbacks.onError({ status: 404 });
  assert.deepEqual(f.stopped, ['server']);
  assert.equal(f.alerts.length, 1);
  f.cleanup();
  f.tick();
  assert.equal(f.requests.length, 2);
});
test('late heartbeat errors cannot close a new or unmounted live', () => {
  const f = fixture();
  f.state.channelIdRef.current = 'live-b';
  f.requests[0].callbacks.onError({ status: 404 });
  assert.equal(f.stopped.length, 0);
  f.state.channelIdRef.current = 'live-a';
  f.cleanup();
  f.requests[0].callbacks.onError({ status: 404 });
  assert.equal(f.stopped.length, 0);
});
