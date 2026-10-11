const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const path = require('node:path');
const apiRequire = createRequire(path.resolve('artifacts/api-server/package.json'));
const express = apiRequire('express');
let stream = null, denied = false, party = false, forks = 0, triggers = 0;
let customSound = false, sentSound;
const mod = { exports: {} };
const child = () => {
  forks++;
  const c = new EventEmitter(); c.connected = true; c.exitCode = null;
  c.kill = () => { c.exitCode = 0; c.connected = false; return true; };
  c.send = (m, cb) => {
    if (m.outputToken) sentSound = m.customSoundBase64;
    if (m.type === 'trigger') triggers++;
    if (m.outputToken) setImmediate(() => c.emit('message', { type: 'ready', durationMs: 5000 }));
    if (m.demo) assert.equal(m.sourceToken, null, 'Demo must not subscribe to any host');
    cb?.(null);
  }; return c;
};
const env = { NODE_ENV: 'production', PULSE_GIFT_COMPOSITOR_TEST: '1', PULSE_GIFT_TEST_ROOT: '/fixture', PULSE_GIFT_TEST_FILE: '/fixture/mummy.svga', PULSE_PLAYWRIGHT_MODULE: '/fixture/playwright', AGORA_APP_ID: 'fixture', AGORA_APP_CERTIFICATE: 'fixture' };
const mocks = {
  '../lib/managedGiftCatalog': { readPublishedGiftCatalog: async () => ({ collections: [{ gifts: [{ id: 'mummy', sound: customSound ? { id: 'fixture-sound' } : null }] }] }),
    giftAssetDelivery: async (_db, id) => { assert.equal(id, 'fixture-sound'); return { bytes: Buffer.from('fixture-audio') }; } },
  express, 'node:child_process': { fork: child }, 'node:fs/promises': { access: async () => {} },
  'agora-token': { RtcRole: { PUBLISHER: 1, SUBSCRIBER: 2 }, RtcTokenBuilder: { buildTokenWithUid: () => 'fixture-token' } },
  'drizzle-orm': { and() {}, eq() {}, isNull() {} },
  '@workspace/db': { db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => stream ? [stream] : [] }) }) }) }, liveStreamSessionsTable: {} },
  '../lib/streamModeration': { authenticatedUser: async req => req.headers.authorization ? { uid: Number(req.headers.authorization) } : null,
    viewerModeration: async () => ({ removed: denied, blocked: false }) },
  '../lib/liveParty': { findParty: async () => party },
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('artifacts/api-server/src/routes/gift-compositor-test.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, { module: mod, exports: mod.exports, process: { env }, require: id => mocks[id] ?? require(id), setInterval, clearInterval, setTimeout });
(async () => {
  const app = express(); app.use(express.json()); app.use('/test', mod.exports.default);
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.on('listening', r));
  const request = (url, method = 'POST', auth = '1', body) => fetch(`http://127.0.0.1:${server.address().port}/test${url}`, {
    method, headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    assert.equal((await request('/start')).status, 404);
    env.NODE_ENV = 'development';
    assert.equal((await request('/start', 'POST', '')).status, 401);
    assert.equal((await request('/start', 'POST', '1', { channelId: 'absent' })).status, 403);
    stream = { id: 1, hostUserId: 2, channelId: 'live', lastHeartbeatAt: new Date(), endedAt: null };
    for (const key of ['paused', 'isPrivate', 'requiredGiftId']) {
      stream[key] = true; assert.equal((await request('/start', 'POST', '1', { channelId: 'live' })).status, 403); stream[key] = false;
    }
    denied = true; assert.equal((await request('/start', 'POST', '1', { channelId: 'live' })).status, 403); denied = false;
    party = true; assert.equal((await request('/start', 'POST', '1', { channelId: 'live' })).status, 403); party = false;
    assert.equal(forks, 0);
    const start = await request('/start', 'POST', '1', { channelId: 'live' }); assert.equal(start.status, 200);
    const { id } = await start.json();
    assert.equal((await request('/start', 'POST', '1', { channelId: 'live' })).status, 409);
    assert.equal((await request('/' + id, 'GET', '3')).status, 404);
    assert.equal((await (await request('/' + id, 'GET')).json()).ready, true);
    assert.equal((await request('/' + id + '/play')).status, 200);
    assert.equal((await request('/' + id + '/play')).status, 429);
    assert.equal(triggers, 1);
    assert.equal((await request('/' + id, 'DELETE')).status, 200);
    assert.equal((await request('/' + id, 'GET')).status, 404);
    stream = null;
    customSound = true;
    assert.equal((await request('/start', 'POST', '1', { channelId: 'invented-demo' })).status, 403);
    const demo = await request('/start', 'POST', '1', { channelId: 'pulse-talk-demo' });
    assert.equal(demo.status, 200);
    assert.equal(sentSound, Buffer.from('fixture-audio').toString('base64'));
    const demoId = (await demo.json()).id;
    assert.equal((await (await request('/' + demoId, 'GET')).json()).ready, true);
    assert.equal((await request('/' + demoId + '/play')).status, 200);
    assert.equal((await request('/' + demoId, 'DELETE')).status, 200);
    console.log('PASS: production disabled, auth, regular-live access, owner isolation, one-worker limit, cooldown and teardown. Database/RTC child mocked.');
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
