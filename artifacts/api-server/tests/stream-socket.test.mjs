import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
const { code } = transformSync(readFileSync(new URL('../../mobile/hooks/useStreamSocket.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' });
function setup() {
  const sockets = [], timers = new Map(), received = [];
  let cleanup, foreground, connected = 0, nextTimer = 0;
  class Socket {
    static OPEN = 1;
    readyState = 0;
    sent = [];
    constructor() { sockets.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
    open() { this.readyState = 1; this.onopen?.(); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  const module = { exports: {} };
  const require = name => {
    if (name === 'react') return { useRef: value => ({ current: value }), useEffect: effect => { cleanup = effect(); } };
    if (name === 'react-native') return { AppState: { addEventListener: (_, listener) => { foreground = listener; return { remove() { foreground = undefined; } }; } } };
    if (name === '@clerk/expo') return { useAuth: () => ({ getToken: async () => 'test-token' }) };
    throw Error(name);
  };
  new Function('require','module','exports','WebSocket','setTimeout','clearTimeout','process',code)(require,module,module.exports,Socket,
    callback => { timers.set(++nextTimer,callback); return nextTimer; }, id => timers.delete(id), { env: { EXPO_PUBLIC_DOMAIN: 'example.test' } });
  module.exports.useStreamSocket({channelId:'logical-stream',enabled:true,onConnect:()=>connected++,onMessage:event=>received.push(event.data)});
  return { sockets, timers, received, connected:()=>connected, cleanup:()=>cleanup(), foreground:()=>foreground?.('active'), tick:()=>{const [id,callback]=timers.entries().next().value;timers.delete(id);callback();} };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
test('subscribes and refreshes durable data after connection and reconnection', async () => {
  const f=setup(); await flush(); f.sockets[0].open();
  assert.equal(f.connected(),1); assert.equal(f.sockets[0].sent[0].channelId,'logical-stream');
  f.sockets[0].close(); f.tick(); await flush(); f.sockets[1].open();
  assert.equal(f.connected(),2); assert.equal(f.sockets[1].sent[0].type,'subscribe'); f.cleanup();
});
test('foreground reconnects; stale sockets cannot deliver events', async () => {
  const f=setup(); await flush(); f.sockets[0].open(); f.foreground(); await flush(); f.sockets[1].open();
  f.sockets[0].onmessage({data:'stale'}); f.sockets[1].onmessage({data:'current'});
  assert.deepEqual(f.received,['current']); f.cleanup();
});
test('unmount cancels retry and does not reconnect', async () => {
  const f=setup(); await flush(); f.sockets[0].open(); f.sockets[0].close(); f.cleanup();
  assert.equal(f.timers.size,0); assert.equal(f.sockets.length,1);
});
test('connection errors schedule only one retry even when close also fires', async () => {
  const f=setup(); await flush(); f.sockets[0].open(); f.sockets[0].onerror();
  assert.equal(f.timers.size,1); f.cleanup();
});
