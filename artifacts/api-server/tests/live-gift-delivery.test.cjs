const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '..');
const modules = new Map(), children = [], queries = [];
let enabled = false, revision = 1;
let sources = ['regular', 'premium', 'private', 'party'].map((mode, i) => ({ channel_id: mode, host_user_id: i + 1, rtc_channel_name: mode === 'premium' ? 'premium-rotated' : null, paused: false }));
const db = { async query(sql, values) {
  queries.push(sql);
  assert.ok(!/INSERT INTO coin_|UPDATE coin_|DELETE FROM|UPDATE gift_revisions/i.test(sql), 'Delivery never mutates money, receipts or gifts');
  if (sql.startsWith('SELECT enabled')) return { rows: [{ enabled, revision: String(revision) }] };
  if (sql.includes('count(*)')) return { rows: [{ n: sources.length }] };
  if (sql.startsWith('SELECT channel_id')) return { rows: sources };
  if (sql.startsWith('UPDATE live_gift_delivery_settings')) { enabled = values[0]; revision++; }
  return { rows: [], rowCount: 1 };
}, release() {}, async connect() { return this; } };
function fork() {
  const child = new EventEmitter(); child.connected = true; child.exitCode = null; child.messages = [];
  child.kill = () => { child.connected = false; child.exitCode = 0; return true; };
  child.send = (message, cb) => { child.messages.push(message); cb?.(null); };
  children.push(child); return child;
}
const mocks = {
  '@workspace/db': { pool: db }, 'node:child_process': { fork },
  'node:fs/promises': { access: async () => {}, readFile: async () => Buffer.from('fixture') },
  'agora-token': { RtcRole: { PUBLISHER: 1, SUBSCRIBER: 2 }, RtcTokenBuilder: { buildTokenWithUid: (app, certificate, channel, uid) => `${channel}:${uid}` } },
  './managedGiftCatalog': { readPublishedGiftCatalog: async () => ({ collections: [] }), giftAssetDelivery: async (_, id) => ({ bytes: Buffer.from(id) }) },
};
function load(file) {
  file = path.resolve(root, file); if (modules.has(file)) return modules.get(file);
  const module = { exports: {} }; modules.set(file, module.exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    module, exports: module.exports, Buffer, console, setTimeout, clearTimeout, setInterval, clearInterval,
    process: { cwd: () => root, env: { AGORA_APP_ID: 'fixture', AGORA_APP_CERTIFICATE: 'fixture', PULSE_GIFT_TEST_ROOT: '/fixture', PULSE_PLAYWRIGHT_MODULE: '/fixture/player' } },
    require(id) {
      if (mocks[id]) return mocks[id];
      if (id.endsWith('.json')) return require(path.resolve(path.dirname(file), id));
      return id.startsWith('.') ? load(path.resolve(path.dirname(file), id + '.ts')) : require(id);
    },
  });
  return module.exports;
}
const service = load('src/lib/liveGiftDelivery.ts'), bus = load('src/lib/liveGiftDeliveryBus.ts');
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };
const gift = (id, recipientUid = 1, format = 'svga') => ({ type: 'gift', channelId: 'regular', giftId: id, recipientUid, amount: 99,
  giftName: 'Fixture', senderUid: -42, senderName: 'Incognito 2', combo: { id: 'combo-' + id, count: 1 },
  giftSnapshot: { id: 'fixture', revisionId: 'immutable-' + id, type: 'animation', name: 'Fixture', coinCost: 99,
    framing: { preset: 'fullscreen', scale: 1, x: 0, y: 0 }, androidAnimation: { id: id + '-asset', format }, sound: null } });
(async () => {
  await service.refreshLiveGiftDelivery();
  const normal = []; bus.deliverLiveGift(gift('off'), e => normal.push(e)); assert.equal(normal.length, 1); assert.equal(normal[0].serverDelivery, undefined);
  await service.setLiveGiftDelivery(true, 'owner'); assert.equal(children.length, 4, 'One shared path for all live audiences');
  children.forEach(child => child.emit('message', { type: 'ready' }));
  for (const source of sources) assert.ok(service.giftDeliveryStatus(source.channel_id));
  assert.equal(children[1].messages[0].sourceChannel, 'premium-rotated');
  assert.equal(children[1].messages[0].sourceToken, 'premium-rotated:' + children[1].messages[0].sourceUid);
  const delivered = [], original = gift('paid');
  bus.deliverLiveGift(original, e => delivered.push(e));
  bus.deliverLiveGift({ ...original, channelId: 'party', senderName: 'Independently masked' }, e => delivered.push(e));
  await flush();
  assert.equal(service.liveGiftDeliveryState().fault, null, 'Asset preparation must succeed');
  assert.equal(children[0].messages.filter(m => m.type === 'play').length, 1, 'Party fanout renders once per paid transaction');
  assert.equal(delivered.length, 0, 'Do not claim rendering before worker acknowledges');
  children[0].emit('message', { type: 'played', giftId: 'paid', durationMs: 5000 });
  assert.equal(delivered.length, 2); assert.equal(delivered[1].senderName, 'Independently masked');
  assert.equal(delivered[0].giftSnapshot, original.giftSnapshot); assert.equal(delivered[0].amount, 99);
  assert.equal(delivered[0].senderUid, -42); assert.equal(delivered[0].serverDelivery.recipientUid, 1);
  bus.deliverLiveGift(original, e => delivered.push(e)); await flush();
  assert.equal(children[0].messages.filter(m => m.type === 'play').length, 1, 'Retry never renders or pays again');
  for (const [i, format] of ['webm-alpha', 'packed-alpha-mp4', 'svga'].entries()) {
    bus.deliverLiveGift(gift('format-' + i, i + 2, format), e => delivered.push(e));
  }
  await flush();
  children.slice(1).forEach((child, i) => assert.equal(child.messages.at(-1).gift.asset.format, ['webm-alpha', 'packed-alpha-mp4', 'svga'][i]));
  children[1].emit('message', { type: 'failed' });
  assert.equal(service.liveGiftDeliveryState().effective, false);
  assert.equal(service.liveGiftDeliveryState().activeWorkers, 0, 'Failure rolls delivery back globally');
  assert.equal(delivered.filter(e => !e.serverDelivery).length, 3, 'Pending paid gifts fall back once without recharging');
  await service.setLiveGiftDelivery(false, 'owner'); assert.equal(service.liveGiftDeliveryState().enabled, false);
  await service.setLiveGiftDelivery(true, 'owner'); children.slice(4).forEach(c => c.emit('message', { type: 'ready' }));
  bus.stopLiveGiftDelivery('private'); assert.equal(service.giftDeliveryStatus('private'), null, 'Removed/ended channel tokens lose their media source');
  await service.setLiveGiftDelivery(false, 'owner');
  assert.ok(queries.some(q => q.includes('admin_audit_events')));
  console.log('PASS: global switch, all live modes, post-commit-only bus, immutable purchase snapshots, formats, party deduplication, masked identities, worker failure rollback and access teardown. Worker/database mocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
