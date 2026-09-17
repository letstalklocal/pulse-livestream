import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
const base = process.env.REACTION_TEST_URL ?? 'ws://127.0.0.1:8080/api/ws';
const sockets = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function client(channelId) {
  const ws = new WebSocket(base); sockets.push(ws);
  const events = [];
  ws.on('message', data => events.push(JSON.parse(String(data))));
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); setTimeout(() => reject(Error('Open timeout')), 4000).unref(); });
  ws.send(JSON.stringify({ type: 'subscribe_reactions', channelId }));
  const deadline = Date.now() + 4000;
  while (!events.length && Date.now() < deadline) await pause(20);
  assert.ok(events.length, 'Subscription response');
  return { ws, events };
}
try {
  const a = await client('pulse-gaming-demo'), b = await client('pulse-gaming-demo'), c = await client('pulse-art-demo');
  assert.equal(a.events[0].type, 'reactions_ready');
  a.ws.send(JSON.stringify({ type: 'reaction', emoji: '👩🏽‍💻', count: 5 }));
  const deadline = Date.now() + 4000;
  while (b.events.length < 2 && Date.now() < deadline) await pause(20);
  assert.deepEqual(b.events[1], { type: 'reaction', emoji: '👩🏽‍💻', count: 5 });
  assert.equal(a.events.length, 1); assert.equal(c.events.length, 1);
  a.ws.send(JSON.stringify({ type: 'reaction', emoji: '🔥', count: 999 }));
  a.ws.send(JSON.stringify({ type: 'reaction', emoji: 'invalid', count: 1 }));
  a.ws.send(JSON.stringify({ type: 'reaction', emoji: '❤️🔥', count: 1 }));
  await pause(250); assert.equal(b.events.length, 2);
  const denied = await client('private-reaction-test'); assert.equal(denied.events[0].type, 'subscription_denied');
  console.log('PASS: running /api/ws shares reaction batches, excludes sender echo/other channels, rejects malformed batches and denies unauthenticated private access.');
} finally { sockets.forEach(ws => ws.close()); }
