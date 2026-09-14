import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import { build } from 'esbuild';
const dir = fileURLToPath(new URL('..', import.meta.url));
const output = `${dir}/tests/.premium-gift-request-test.cjs`;
await build({ stdin: { contents: `export { default as streams, forgetViewer } from './src/routes/streams'; export { default as agora } from './src/routes/agora'; export { default as moderation } from './src/routes/moderation'; export { canAccessChannel } from './src/lib/privateChannelAccess'; export { settlePremiumGiftRequests } from './src/lib/premiumGiftRequests'; export { pool } from '@workspace/db';`, resolveDir: dir }, outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['pg-native'], logLevel: 'silent' });
// Synthetic token credentials; this test never contacts Agora or charges real users.
delete process.env.AGORA_CUSTOMER_ID;
delete process.env.AGORA_CUSTOMER_SECRET;
delete process.env.AGORA_SECRET;
process.env.AGORA_APP_ID = '0'.repeat(32);
process.env.AGORA_APP_CERTIFICATE = '1'.repeat(32);
const nativeRemoval = process.env.TEST_AGORA_REMOVAL === '1';
const agoraCalls = [];
let agoraFailure = false;
if (nativeRemoval) {
  process.env.AGORA_CUSTOMER_ID = 'test-customer';
  process.env.AGORA_SECRET = 'test-secret';
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.agora.io/dev/v1/kicking-rule');
    const body = JSON.parse(options.body);
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from('test-customer:test-secret').toString('base64')}`);
    agoraCalls.push({ method: options.method, body });
    return { ok: !agoraFailure, status: agoraFailure ? 503 : 200, json: async () => agoraFailure ? { status: 'error' } : { status: 'success', id: body.id ?? agoraCalls.length } };
  };
}
const { streams, agora, moderation, canAccessChannel, settlePremiumGiftRequests, forgetViewer, pool } = createRequire(import.meta.url)(output);
const base = 1700000000 + Math.floor(Math.random() * 10000000);
const [host, payer, free, poor, late, outsider] = Array.from({ length: 6 }, (_, i) => base + i);
const uids = [host, payer, free, poor, late, outsider];
const channel = `test-gift-request-${randomUUID()}`;
const publicChannel = `test-gift-public-${randomUUID()}`;
const privateChannel = `test-gift-private-${randomUUID()}`;
const channels = [channel, publicChannel, privateChannel];
const call = async (router, method, path, uid, body = {}, id = channel) => {
  const layer = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]);
  assert.ok(layer, path);
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await layer.route.stack[0].handle({ auth: () => ({ userId: uid ? `test-gift-${uid}` : null }), params: { channelId: id }, body, log: { error(err) { console.error('Route failure:', err.err?.message); }, warn() {} } }, res);
  return res;
};
const start = (uid = host, body = {}, id = channel) => call(streams, 'post', '/streams/:channelId/gift-request', uid, { giftId: 'heart', idempotencyKey: randomUUID(), ...body }, id);
const pay = (uid, requestId, key = randomUUID(), id = channel) => call(streams, 'post', '/streams/:channelId/gift-request/pay', uid, { requestId, idempotencyKey: key }, id);
const status = (uid, id = channel) => call(streams, 'get', '/streams/:channelId/gift-request', uid, {}, id);
const token = (uid, role = 'audience', id = channel) => call(agora, 'post', '/agora/token', uid, { channelName: id, uid: outsider, role });
const balance = async uid => (await pool.query('select balance from coin_balances where user_id=$1', [uid])).rows[0]?.balance ?? 0;
const act = (uid, action) => call(moderation, 'post', '/streams/:channelId/moderation', host, { viewerUid: uid, action });
const expire = async id => {
  await pool.query("update premium_gift_requests set deadline=now()-interval '1 second' where id=$1", [id]);
  await settlePremiumGiftRequests(channel);
};
try {
  for (const uid of uids) await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)', [uid, `test-gift-${uid}`, 'Gift request test']);
  for (const id of channels) await pool.query("insert into live_stream_sessions(channel_id,host_user_id,host_name,title,category,is_private) values($1,$2,'Test','Test','Talk',$3)", [id, host, id === privateChannel]);
  for (const uid of uids) await pool.query('insert into coin_balances(user_id,balance) values($1,$2)', [uid, uid === poor || uid === host ? 0 : 100]);
  assert.equal((await start(null)).statusCode, 401);
  assert.equal((await start(outsider)).statusCode, 403);
  assert.equal((await start(host, { giftId: 'invalid' })).statusCode, 400);
  assert.equal((await start(host, { durationSeconds: 15 })).statusCode, 400);
  assert.equal((await start(host, { durationSeconds: '30' })).statusCode, 400);
  assert.equal((await start(host, {}, publicChannel)).statusCode, 400);
  assert.equal((await start(host, {}, privateChannel)).statusCode, 400);
  for (const uid of [payer, free, poor]) assert.equal((await call(streams, 'post', '/streams/:channelId/presence', uid, { action: 'join' })).statusCode, 200);
  assert.equal((await call(streams, 'post', '/streams/:channelId/premium', host, { requiredGiftId: 'rose', freeViewerIds: [free, poor] })).statusCode, 200);
  assert.equal((await call(streams, 'post', '/streams/:channelId/admission', payer, { idempotencyKey: randomUUID() })).statusCode, 200);
  const mediaBefore = (await token(payer)).body.channelName;
  const requestKey = randomUUID();
  const concurrent = await Promise.all([start(host, { idempotencyKey: requestKey }), start(host, { idempotencyKey: requestKey })]);
  assert.ok(concurrent.every(row => row.statusCode === 200));
  assert.equal(concurrent[0].body.id, concurrent[1].body.id);
  const id = concurrent[0].body.id;
  const initial = (await status(payer)).body.request;
  const restored = spawnSync(process.execPath, ['-e', `
    const {streams,pool}=require(${JSON.stringify(output)});
    const handler=streams.stack.find(layer=>layer.route?.path==='/streams/:channelId/gift-request'&&layer.route.methods.get).route.stack[0].handle;
    handler({auth:()=>({userId:${JSON.stringify('test-gift-')}+${payer}}),params:{channelId:${JSON.stringify(channel)}},log:{error(){}}},{status(){return this},json(value){console.log(JSON.stringify(value))}}).then(()=>pool.end()).then(()=>process.exit(0));
  `], { env: process.env, encoding: 'utf8' });
  assert.equal(restored.status, 0, restored.stderr);
  const restoredStatus = JSON.parse(restored.stdout.trim());
  assert.equal(restoredStatus.request.id, id);
  assert.equal(restoredStatus.request.deadline, initial.deadline);
  assert.equal(restoredStatus.request.required, true);
  assert.equal(initial.durationSeconds, 30);
  assert.equal(initial.required, true);
  assert.equal(initial.gift.coinCost, 5);
  assert.equal((await status(host)).body.request.viewers, 3);
  assert.equal((await status(outsider)).body.request, null);
  assert.equal((await start()).statusCode, 409);
  assert.equal((await token(payer)).body.channelName, mediaBefore); // uninterrupted grace period
  assert.equal((await pay(host, id)).statusCode, 403);
  assert.equal((await pay(outsider, id)).statusCode, 403);
  assert.equal((await pay(payer, id, randomUUID(), publicChannel)).statusCode, 404);
  assert.equal((await pay(poor, id)).statusCode, 402);
  assert.equal((await status(poor)).body.request.paid, false);
  const payments = await Promise.all([pay(payer, id), pay(payer, id), pay(payer, id)]);
  assert.ok(payments.every(row => row.statusCode === 200));
  assert.equal(payments.filter(row => row.body.charged).length, 1);
  assert.equal(await balance(payer), 94); // 1 entry + 5 request
  assert.equal(await balance(host), 6);
  const usedKey = (await pool.query('select idempotency_key from coin_transactions where from_user_id=$1 and description like $2', [payer, 'Premium gift request:%'])).rows[0].idempotency_key;
  assert.equal((await pay(free, id, usedKey)).statusCode, 409);
  assert.equal(await balance(free), 100);
  assert.equal((await pay(free, id)).statusCode, 200); // free entry does not exempt a later request
  assert.equal((await status(host)).body.request.paidViewers, 2);
  // A new arrival uses ordinary entry and is not retroactively added to the request.
  assert.equal((await call(streams, 'post', '/streams/:channelId/admission', late, { idempotencyKey: randomUUID() })).statusCode, 200);
  assert.equal((await call(streams, 'post', '/streams/:channelId/presence', late, { action: 'join' })).statusCode, 200);
  assert.equal((await status(late)).body.request, null);
  assert.equal((await token(late)).statusCode, 200);
  await expire(id);
  assert.equal((await status(poor)).body.removed, true);
  assert.equal((await token(poor)).statusCode, 403);
  assert.equal(await canAccessChannel(channel, `test-gift-${poor}`), false);
  assert.equal((await call(streams, 'post', '/streams/:channelId/presence', poor, { action: 'join' })).statusCode, 403);
  assert.equal((await call(streams, 'post', '/streams/:channelId/admission', poor, { idempotencyKey: randomUUID() })).statusCode, 403);
  assert.equal((await pay(poor, id)).statusCode, 403);
  const mediaAfter = (await token(payer)).body.channelName;
  if (nativeRemoval) {
    assert.equal(mediaAfter, mediaBefore);
    assert.deepEqual(agoraCalls[0], { method: 'POST', body: { appid: '0'.repeat(32), cname: mediaBefore, uid: poor, time: 61, privileges: ['join_channel'] } });
  } else assert.notEqual(mediaAfter, mediaBefore);
  assert.equal((await token(late)).body.channelName, mediaAfter);
  assert.equal((await token(host, 'broadcaster')).body.channelName, mediaAfter);
  await settlePremiumGiftRequests(channel);
  assert.equal((await token(payer)).body.channelName, mediaAfter); // settle exactly once
  assert.equal((await pay(payer, id)).body.charged, false); // lost-response retry after deadline
  let roster = await call(moderation, 'get', '/streams/:channelId/moderation', host);
  assert.equal(roster.body.users.find(row => row.uid === poor).removed, true);
  if (nativeRemoval) {
    agoraFailure = true;
    await assert.rejects(() => act(poor, 'allow'), /Could not restore Agora access/);
    assert.equal((await token(poor)).statusCode, 403);
    agoraFailure = false;
  }
  assert.equal((await act(poor, 'allow')).statusCode, 200);
  if (nativeRemoval) assert.equal(agoraCalls.at(-1).method, 'DELETE');
  assert.equal((await token(poor)).statusCode, 200);
  assert.equal((await status(poor)).body.request.required, false);
  const beforeManual = (await token(payer)).body.channelName;
  assert.equal((await act(free, 'remove')).statusCode, 200);
  if (nativeRemoval) assert.equal((await token(payer)).body.channelName, beforeManual);
  assert.equal((await token(free)).statusCode, 403);
  assert.equal((await act(free, 'allow')).statusCode, 200);
  assert.equal((await token(free)).statusCode, 200);
  // A subsequent round is a new payment, with a 60-second selection.
  for (const uid of [payer, free, poor, late]) forgetViewer(channel, uid);
  await call(streams, 'post', '/streams/:channelId/presence', payer, { action: 'join' });
  const second = await start(host, { giftId: 'rose', durationSeconds: 60 });
  assert.equal(second.statusCode, 200);
  assert.equal((await status(payer)).body.request.durationSeconds, 60);
  assert.equal((await pay(payer, second.body.id)).body.charged, true);
  const allPaidMedia = (await token(payer)).body.channelName;
  await expire(second.body.id);
  assert.equal((await token(payer)).body.channelName, allPaidMedia); // no reconnect when everyone paid
  assert.equal((await status(poor)).body.removed, false); // allow-back remains effective across rounds
  assert.equal(await balance(payer), 93);
  assert.equal(await balance(free), 95);
  assert.equal(await balance(host), 13); // entry 1+1, requests 5+5+1
  const persisted = (await pool.query('select required_gift_id,premium_free_viewer_ids from live_stream_sessions where channel_id=$1', [channel])).rows[0];
  assert.equal(persisted.required_gift_id, 'rose');
  assert.deepEqual(persisted.premium_free_viewer_ids, [free, poor]);
  if (nativeRemoval) {
    agoraFailure = true;
    const beforeFallback = (await token(payer)).body.channelName;
    assert.equal((await act(free, 'remove')).statusCode, 200);
    assert.notEqual((await token(payer)).body.channelName, beforeFallback);
    assert.equal((await token(free)).statusCode, 403);
  }
  console.log(nativeRemoval ? 'MODE: mocked native Agora removal, no live Agora calls' : 'MODE: rotation fallback, no live Agora calls');
  console.log('PASS: host authorization, 30/60 validation/default, durable audience, grace access, entry preservation, atomic/idempotent payments, insufficient coins, cross-request denial, expiry/token denial, repeat settlement, late arrivals, free viewers, restricted roster, manual remove/allow, repeat requests, no rotation when all paid.');
} finally {
  await pool.query('delete from live_viewer_bans where session_id in (select id from live_stream_sessions where channel_id=any($1))', [channels]);
  await pool.query('delete from premium_gift_viewers where request_id in (select id from premium_gift_requests where session_id in (select id from live_stream_sessions where channel_id=any($1)))', [channels]);
  await pool.query('delete from premium_gift_requests where session_id in (select id from live_stream_sessions where channel_id=any($1))', [channels]);
  await pool.query('delete from stream_moderation where session_id in (select id from live_stream_sessions where channel_id=any($1))', [channels]);
  await pool.query('delete from premium_stream_admissions where channel_id=any($1)', [channels]);
  await pool.query('delete from coin_transactions where channel_id=any($1)', [channels]);
  await pool.query('delete from coin_balances where user_id=any($1)', [uids]);
  await pool.query('delete from live_stream_sessions where channel_id=any($1)', [channels]);
  await pool.query('delete from users where uid=any($1)', [uids]);
  await pool.end(); unlinkSync(output);
}
process.exit(0);
