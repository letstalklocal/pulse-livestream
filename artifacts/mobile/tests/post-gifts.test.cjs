const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync(require.resolve('../components/PostFooter.tsx'), 'utf8');
const start = source.indexOf('  const sendGift = async');
const code = ts.transpileModule(source.slice(start, source.indexOf('  return <>', start)), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
(async () => {
  const calls = [], balances = [], invalidated = [], errors = [];
  const state = { comments: false, gifts: true, pending: false };
  let fail = true, release;
  const scope = {
    user: { uid: 42 }, postId: 7, giftBusy: { current: false }, giftRequest: { current: null },
    Crypto: { randomUUID: require('node:crypto').randomUUID },
    setSendingGift: v => { state.pending = v; },
    sendPostGift: async (id, body) => { calls.push({ id, body }); await new Promise(r => { release = r; }); if (fail) throw new Error('offline'); return { balance: 99 }; },
    client: { setQueryData: (k, v) => balances.push(v.balance), invalidateQueries: k => { invalidated.push(k.queryKey); return Promise.resolve(); } },
    getGetCoinBalanceQueryKey: () => ['coins'], setShowGifts: v => { state.gifts = v; }, setShowComments: v => { state.comments = v; },
    Alert: { alert: (...args) => errors.push(args) }, t: s => s, wallet: { refetch: async () => {} },
  };
  const send = new Function(...Object.keys(scope), code + '\nreturn sendGift;')(...Object.values(scope));
  const first = send({ id: 'rose' });
  await send({ id: 'crown' });
  assert.equal(calls.length, 1, 'Rapid taps cannot submit a second gift');
  release(); await first;
  assert.equal(state.comments, false);
  assert.equal(state.gifts, true);
  assert.equal(errors.length, 1);
  assert.equal(state.pending, false);
  const requestId = calls[0].body.requestId;
  fail = false;
  const retry = send({ id: 'rose' }); release(); await retry;
  assert.equal(calls[1].body.requestId, requestId, 'Retry preserves transaction identity');
  assert.equal(state.comments, true);
  assert.equal(state.gifts, false);
  assert.deepEqual(balances, [99]);
  assert.deepEqual(invalidated, [['post-comments', 7], ['post-activity', 7]]);
  const next = send({ id: 'rose' }); release(); await next;
  assert.notEqual(calls[2].body.requestId, requestId, 'Intentional next gift receives a new identity');
  assert.equal(scope.giftRequest.current, null);
  console.log('PASS: post gift rapid-tap guard, failure/retry identity, confirmed wallet update and comments refresh.');
})().catch(error => { console.error(error); process.exitCode = 1; });
