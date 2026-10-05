const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
const source = fs.readFileSync(require.resolve('../app/dm/[peerId].tsx'), 'utf8');
const ast = ts.createSourceFile('dm.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function walk(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'GiftPicker') handler = node.attributes.properties.find(p => p.name?.getText(ast) === 'onSend').initializer.expression.getText(ast);
  ts.forEachChild(node, walk);
}
walk(ast);
const code = ts.transpileModule(`const send = ${handler};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const tick = () => new Promise(setImmediate);
async function test() {
  const events = [], payments = [], keys = [];
  let animations = [], serial = 0;
  const utils = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(fs.readFileSync(require.resolve('../utils/giftPresentation.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(utils, utils.exports);
  const scope = {
    user: { uid: 1, name: 'Sender' }, peerIdStr: '2', pendingGiftPayments: { current: 0 }, giftRetryRef: { current: [] },
    mergeGiftFloater: utils.exports.mergeGiftFloater,
    activeGiftPeer: { current: '2' }, appNumber: String, reduceMotion: false,
    Haptics: { ImpactFeedbackStyle: { Light: 'light' }, NotificationFeedbackType: { Success: 'success' }, impactAsync: async () => events.push('tap'), notificationAsync: async () => events.push('success') },
    setSendError() {},
    setFloatingGifts: update => { animations = update(animations); events.push('animation'); },
    sendGiftDm: (peer, gift, key) => { keys.push(key); let resolve; const promise = new Promise(done => resolve = done); payments.push({ peer, gift, resolve }); return promise; },
    queryClient: { setQueryData: () => events.push('balance'), invalidateQueries: () => events.push('refresh') }, getGetCoinBalanceQueryKey: () => [], createGiftRequestKey: () => `unique-${++serial}`,
    Alert: { alert: () => events.push('alert') }, t: text => text,
  };
  const send = new Function(...Object.keys(scope), code + ';return send;')(...Object.values(scope));
  const rose = { id: 'rose', name: 'Rose', emoji: '🌹', coins: 1 };
  send(rose); send(rose);
  assert.equal(events[0], 'tap'); assert.equal(payments.length, 2, 'both rapid taps send immediately');
  assert.notEqual(keys[0], keys[1], 'overlapping payments have independent keys');
  assert.equal(events.includes('animation'), false);
  payments[1].resolve({ ok: true, balance: 98, combo: { id: 'combo', count: 2, totalCoins: 2 } }); await tick();
  assert.equal(events.includes('refresh'), false, 'wait for all overlapping responses before final wallet refresh');
  payments[0].resolve({ ok: true, balance: 99, combo: { id: 'combo', count: 1, totalCoins: 1 } }); await tick();
  assert.equal(scope.pendingGiftPayments.current, 0); assert.equal(events.includes('refresh'), true);
  assert.equal(animations[0].comboCount, 2, 'late response cannot decrease the combo');
  assert.equal(animations.length, 1); assert.equal(animations[0].comboLabel, '×2');
  send(rose); payments[2].resolve({ ok: false, uncertain: true }); await tick();
  assert.equal(animations[0].comboCount, 2);
  send(rose); assert.equal(keys[3], keys[2], 'uncertain retry reuses the payment key');
  payments[3].resolve({ ok: true, balance: 97, combo: { id: 'combo', count: 3, totalCoins: 3 } }); await tick();
  assert.equal(animations[0].comboCount, 3);
  send(rose); payments[4].resolve({ ok: false, uncertain: false }); await tick();
  send(rose); assert.notEqual(keys[5], keys[4]);
  scope.activeGiftPeer.current = 'other';
  payments[5].resolve({ ok: true, balance: 96, combo: { id: 'next-combo', count: 1, totalCoins: 1 } }); await tick();
  assert.equal(animations.length, 1, 'late payment never animates in another conversation');
  assert.equal(scope.pendingGiftPayments.current, 0);
  assert.equal(source.includes('sendingGiftId={sendingGiftId}'), false, 'DM drawer is not disabled by an active gift payment');
  scope.activeGiftPeer.current = '2';
  send({ id: 'luxury_rocket', name: 'Blast Off', emoji: '🚀', coins: 4999 });
  payments[6].resolve({ ok: true, balance: 0, combo: { id: 'luxury-combo', count: 1, totalCoins: 4999 } }); await tick();
  assert.equal(animations.at(-1).catalogId, 'luxury_rocket', 'DM shares live animation catalog identity, not the old Rocket name');
  assert.match(source, /<GiftFloater\s[^>]*fullPageLuxury/, 'DM uses shared full-page completion-driven Luxury renderer');
  console.log('PASS: concurrent immediate taps, unique payment keys, out-of-order counter protection, final wallet refresh, uncertain retries, failure and conversation isolation.');
}
test().catch(error => { console.error(error); process.exitCode = 1; });
