const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync(require.resolve('../app/dm/[peerId].tsx'), 'utf8');
const ast = ts.createSourceFile('dm.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function walk(n) {
  if (ts.isJsxSelfClosingElement(n) && n.tagName.getText(ast) === 'GiftPicker') handler = n.attributes.properties.find(p => p.name?.getText(ast) === 'onSend').initializer.expression.getText(ast);
  ts.forEachChild(n, walk);
}
walk(ast);
assert.ok(handler);
const tick = () => new Promise(setImmediate);
async function run(failPayment = false, failReceipt = false, receiptThrows = false, activePeer = '2') {
  const events = []; let finishPayment, finishReceipt;
  const pending = new Promise(resolve => finishPayment = resolve);
  const receipt = new Promise(resolve => finishReceipt = resolve);
  const scope = {
    user: { uid: 1, name: 'Sender' }, peerIdStr: '2', name: 'Recipient', giftSending: { current: false },
    Haptics: { ImpactFeedbackStyle: { Light: 'light' }, NotificationFeedbackType: { Success: 'success' }, impactAsync: () => { events.push('tap'); return Promise.resolve(); }, notificationAsync: () => { events.push('success'); return Promise.resolve(); } },
    setSendingGiftId: id => events.push(['pending', id]), setSendError: error => events.push(['error', error]),
    activeGiftPeer: { current: activePeer },
    setFloatingGifts: update => { const gifts = update([]); assert.equal(gifts[0].name, 'Rose'); events.push('animation'); },
    spendMutation: { mutateAsync: async () => { events.push('payment'); await pending; if (failPayment) throw new Error('failure'); return { balance: 9 }; } },
    queryClient: { setQueryData: () => events.push('balance') }, getGetCoinBalanceQueryKey: () => [], createGiftRequestKey: () => 'unique',
    sendDm: async () => { events.push('receipt'); await receipt; if (receiptThrows) throw Error('receipt unavailable'); return { ok: !failReceipt }; },
    Alert: { alert: () => events.push('alert') }, t: x => x,
  };
  const code = ts.transpileModule(`const send = ${handler};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const send = new Function(...Object.keys(scope), code + ';return send;')(...Object.values(scope));
  send({ id: 'rose', name: 'Rose', emoji: '🌹', coins: 1 });
  assert.equal(events[0], 'tap', 'tap feedback precedes payment/network waits');
  assert.ok(events.some(e => Array.isArray(e) && e[0] === 'pending' && e[1] === 'rose'));
  send({ id: 'rose', name: 'Rose', emoji: '🌹', coins: 1 });
  assert.equal(events.filter(e => e === 'payment').length, 1, 'rapid retry cannot charge twice');
  assert.equal(events.includes('success'), false);
  assert.equal(events.includes('animation'), false, 'no paid-gift animation before payment');
  finishPayment(); await tick();
  if (!failPayment) {
    assert.equal(events.includes('receipt'), true);
    assert.equal(events.includes('success'), true, 'paid feedback does not wait for message persistence');
    assert.equal(scope.giftSending.current, false, 'next gift unlocks while the receipt is still pending');
    assert.deepEqual(events.filter(e => Array.isArray(e) && e[0] === 'pending').at(-1), ['pending', null]);
    assert.equal(events.includes('animation'), activePeer === '2', 'animation only appears in the original active conversation');
    if (activePeer === '2') assert.ok(events.indexOf('animation') < events.indexOf('receipt'), 'display the paid gift before saving its chat receipt');
    finishReceipt(); await tick();
  }
  assert.equal(events.includes('success'), !failPayment);
  assert.equal(events.includes('alert'), failPayment, 'receipt failure must not suggest paying again');
  if (failReceipt || receiptThrows) assert.ok(events.some(e => Array.isArray(e) && e[0] === 'error' && e[1]?.startsWith('Gift sent, but')));
  assert.equal(scope.giftSending.current, false);
  assert.ok(events.some(e => Array.isArray(e) && e[0] === 'pending' && e[1] === null), 'pending feedback clears on every outcome');
}
async function repeatedGifts() {
  const payments = [], receipts = [], keys = [], animations = [], errors = [];
  let pendingGift;
  const deferred = () => { let resolve; const promise = new Promise(done => resolve = done); return { promise, resolve }; };
  const scope = {
    user: { uid: 1, name: 'Sender' }, peerIdStr: '2', name: 'Recipient', giftSending: { current: false }, activeGiftPeer: { current: '2' },
    Haptics: { ImpactFeedbackStyle: { Light: 'light' }, NotificationFeedbackType: { Success: 'success' }, impactAsync: async () => {}, notificationAsync: async () => {} },
    setSendingGiftId: id => pendingGift = id, setSendError: error => errors.push(error),
    setFloatingGifts: update => animations.push(update([])[0]),
    spendMutation: { mutateAsync: ({ data }) => { const request = deferred(); payments.push(request); keys.push(data.idempotencyKey); return request.promise; } },
    queryClient: { setQueryData: () => {} }, getGetCoinBalanceQueryKey: () => [], createGiftRequestKey: () => `unique-${keys.length}-${animations.length}`,
    sendDm: (...args) => { const request = deferred(); receipts.push({ ...request, text: args[2] }); return request.promise; },
    Alert: { alert: () => assert.fail('no payment should fail') }, t: x => x,
  };
  const code = ts.transpileModule(`const send = ${handler};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const send = new Function(...Object.keys(scope), code + ';return send;')(...Object.values(scope));
  const rose = { id: 'rose', name: 'Rose', emoji: '🌹', coins: 1 };
  const heart = { id: 'heart', name: 'Heart', emoji: '❤️', coins: 5 };
  send(rose); send(rose);
  assert.equal(payments.length, 1, 'repeat taps during payment remain guarded');
  payments[0].resolve({ balance: 99 }); await tick();
  assert.equal(receipts.length, 1);
  assert.equal(pendingGift, null);
  send(heart);
  assert.equal(payments.length, 2, 'a second gift can start while the first receipt is unresolved');
  receipts[0].resolve({ ok: false, error: 'save failed' }); await tick();
  assert.equal(scope.giftSending.current, true, 'old receipt completion cannot unlock the newer payment');
  assert.equal(pendingGift, 'heart', 'old receipt completion cannot clear newer pending feedback');
  send(heart); assert.equal(payments.length, 2);
  payments[1].resolve({ balance: 94 }); await tick();
  assert.equal(pendingGift, null);
  send(rose); assert.equal(payments.length, 3);
  payments[2].resolve({ balance: 93 }); await tick();
  receipts[2].resolve({ ok: true }); receipts[1].resolve({ ok: true }); await tick();
  assert.equal(new Set(keys).size, 3, 'each intentional gift uses a separate payment key');
  assert.deepEqual(animations.map(g => g.name), ['Rose', 'Heart', 'Rose']);
  assert.deepEqual(receipts.map(r => r.text), ['🎁 🌹 Rose gift • 1 coins', '🎁 ❤️ Heart gift • 5 coins', '🎁 🌹 Rose gift • 1 coins']);
  assert.ok(errors.some(error => error?.startsWith('Gift sent, but')));
  assert.equal(scope.giftSending.current, false);
}
(async () => {
  await run(); await run(true); await run(false, true); await run(false, false, true); await run(false, false, false, 'other-conversation');
  await repeatedGifts();
  console.log('PASS: next gift unlocks after payment, overlapping/out-of-order receipts cannot clear newer payment guards, unique payment keys, paid feedback, failure handling and conversation isolation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
