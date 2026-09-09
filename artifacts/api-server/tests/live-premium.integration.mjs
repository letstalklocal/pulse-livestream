import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import { build } from 'esbuild';
const dir = fileURLToPath(new URL('..', import.meta.url));
const output = `${dir}/tests/.live-premium-test.cjs`;
await build({ stdin: { contents: `export { default as streams } from './src/routes/streams'; export { default as agora } from './src/routes/agora'; export { pool } from '@workspace/db';`, resolveDir: dir }, outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['pg-native'], logLevel: 'silent' });
// These tokens are only generated/checked locally; no Agora network request is made.
process.env.AGORA_APP_ID ||= '0'.repeat(32);
process.env.AGORA_APP_CERTIFICATE ||= '1'.repeat(32);
const { streams, agora, pool } = createRequire(import.meta.url)(output);
const base = 1800000000 + Math.floor(Math.random() * 10000000);
const [host, free, payer, stranger] = [base, base + 1, base + 2, base + 3];
const channel = `test-premium-${randomUUID()}`;
const privateChannel = `test-private-${randomUUID()}`;
const emptyChannel = `test-empty-${randomUUID()}`;
const call = async (router, method, path, uid, body = {}, channelId = channel) => {
  const handler = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack[0].handle;
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await handler({ auth: () => ({ userId: uid ? `test-premium-${uid}` : null }), params: { channelId }, body, log: { error() {}, warn() {} } }, res);
  return res;
};
try {
  for (const uid of [host, free, payer, stranger]) await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)', [uid, `test-premium-${uid}`, 'Premium test']);
  for (const [id, isPrivate] of [[channel, false], [privateChannel, true], [emptyChannel, false]]) await pool.query("insert into live_stream_sessions(channel_id,host_user_id,host_name,title,category,is_private) values($1,$2,'Test','Test','Talk',$3)", [id, host, isPrivate]);
  await pool.query('insert into coin_balances(user_id,balance) values($1,0),($2,20),($3,20)', [host, free, payer]);
  const token = (uid, channelName = channel) => call(agora, 'post', '/agora/token', uid, { channelName, uid: stranger, role: 'audience' });
  const before = await token(payer);
  assert.equal(before.statusCode, 200); assert.equal(before.body.channelName, channel);
  const upgrade = (uid, body = { requiredGiftId: 'heart', freeViewerIds: [free] }, id = channel) => call(streams, 'post', '/streams/:channelId/premium', uid, body, id);
  assert.equal((await upgrade(null)).statusCode, 401);
  assert.equal((await upgrade(stranger)).statusCode, 403);
  assert.equal((await upgrade(host, { requiredGiftId: 'bad', freeViewerIds: [] })).statusCode, 400);
  assert.equal((await upgrade(host)).statusCode, 409); // no presence yet
  assert.equal((await upgrade(host, { requiredGiftId: 'heart', freeViewerIds: [] }, privateChannel)).statusCode, 400);
  assert.equal((await call(streams, 'post', '/streams/:channelId/presence', null, { action: 'join', uid: free })).statusCode, 401);
  for (const uid of [free, payer]) assert.equal((await call(streams, 'post', '/streams/:channelId/presence', uid, { action: 'join' })).statusCode, 200);
  const roster = await call(streams, 'get', '/streams/:channelId/viewers', host);
  assert.deepEqual(roster.body.users.map(user => user.uid).sort(), [free, payer]);
  assert.equal((await call(streams, 'get', '/streams/:channelId/viewers', stranger)).statusCode, 403);
  const converted = await Promise.all([upgrade(host), upgrade(host)]);
  assert.ok(converted.every(result => result.statusCode === 200));
  const media = converted[0].body.stream.rtcChannelName;
  assert.notEqual(media, channel); assert.equal(converted[1].body.stream.rtcChannelName, media);
  assert.equal(converted[0].body.stream.requiredGift.coinCost, 5);
  assert.equal(converted[0].body.stream.premiumFreeViewerIds, undefined); // never disclose the free list
  assert.equal((await upgrade(host, { requiredGiftId: 'rose', freeViewerIds: [] })).statusCode, 409);
  assert.equal((await upgrade(host, { requiredGiftId: 'rose', freeViewerIds: [] }, emptyChannel)).statusCode, 200);
  const freeToken = await token(free);
  assert.equal(freeToken.statusCode, 200); assert.equal(freeToken.body.channelName, media); assert.equal(freeToken.body.uid, free);
  assert.equal((await token(payer)).statusCode, 403);
  assert.equal((await token(payer, media)).statusCode, 404); // cannot bypass logical-channel authorization
  const freeDetails = await call(streams, 'get', '/streams/:channelId', free);
  assert.equal(freeDetails.body.stream.viewerAdmitted, true);
  assert.equal((await call(streams, 'get', '/streams/:channelId', payer)).body.stream.viewerAdmitted, false);
  const admission = uid => call(streams, 'post', '/streams/:channelId/admission', uid, { idempotencyKey: randomUUID() });
  assert.equal((await admission(free)).body.charged, false);
  assert.equal((await admission(payer)).body.charged, true);
  assert.equal((await admission(payer)).body.charged, false);
  assert.equal((await token(payer)).body.channelName, media);
  const { rows } = await pool.query('select user_id,balance from coin_balances where user_id=any($1)', [[host, free, payer]]);
  const balances = Object.fromEntries(rows.map(row => [row.user_id, row.balance]));
  assert.equal(balances[host], 5); assert.equal(balances[free], 20); assert.equal(balances[payer], 15);
  const saved = (await pool.query('select rtc_channel_name,premium_free_viewer_ids from live_stream_sessions where channel_id=$1', [channel])).rows[0];
  assert.equal(saved.rtc_channel_name, media); assert.deepEqual(saved.premium_free_viewer_ids, [free]);
  console.log('PASS: host authorization, roster, private rejection, empty selection, concurrent retries, price locking, media rotation, free access, paid admission, exact balances, durable state.');
} finally {
  await pool.query('delete from premium_stream_admissions where channel_id=any($1)', [[channel, privateChannel, emptyChannel]]);
  await pool.query('delete from coin_transactions where channel_id=any($1)', [[channel, privateChannel, emptyChannel]]);
  await pool.query('delete from coin_balances where user_id=any($1)', [[host, free, payer, stranger]]);
  await pool.query('delete from live_stream_sessions where channel_id=any($1)', [[channel, privateChannel, emptyChannel]]);
  await pool.query('delete from users where uid=any($1)', [[host, free, payer, stranger]]);
  await pool.end(); unlinkSync(output);
}
process.exit(0); // stream expiry interval belongs to the imported server module
