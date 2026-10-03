import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
const dir = fileURLToPath(new URL('..', import.meta.url)), output = `${dir}/tests/.live-combos-${randomUUID()}.cjs`;
await build({ stdin: { contents: "export {default as router} from './src/routes/coins'; export {pool} from '@workspace/db'; export {chatStore,deletedMessages} from './src/lib/liveChat'; export {subscribe} from './src/lib/wsHub';", resolveDir: dir }, outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['pg-native'], logLevel: 'silent' });
const { router, pool, chatStore, deletedMessages, subscribe } = createRequire(import.meta.url)(output);
const sender = 1880000000 + Math.floor(Math.random() * 10000) * 3, recipient = sender + 1;
const prefix = `live-combo-${randomUUID()}`, channel = prefix, events = [];
subscribe(channel, { readyState: 1, send: text => events.push(JSON.parse(text)) }, sender);
const auth = id => `${prefix}-${id}`;
const handler = router.stack.find(layer => layer.route?.path === '/coins/spend').route.stack[0].handle;
async function send(giftName = 'Rose', amount = 1, key = randomUUID(), targetChannel = channel, user = sender) {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ auth: () => ({ userId: user == null ? null : auth(user), tokenType: 'session_token' }), body: { uid: sender, recipientUid: recipient, giftName, amount, senderName: 'Combo fixture', channelId: targetChannel, idempotencyKey: key }, log: { error() {}, warn() {} } }, res);
  return res;
}
try {
  for (const id of [sender, recipient]) await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)', [id, auth(id), 'Combo fixture']);
  await pool.query('insert into coin_balances(user_id,balance) values($1,1000)', [sender]);
  assert.equal((await send('Rose', 1, randomUUID(), channel, null)).statusCode, 401);
  const key = randomUUID(), first = await send('Rose', 1, key);
  assert.equal(first.statusCode, 200); assert.equal(first.body.combo.count, 1);
  for (let count = 2; count <= 10; count++) {
    const result = await send(); assert.equal(result.body.combo.id, key); assert.equal(result.body.combo.count, count); assert.equal(result.body.combo.totalCoins, count);
  }
  const retry = await send('Rose', 1, key); assert.equal(retry.body.combo.count, 1, 'retry returns its original paid count');
  assert.equal(chatStore.get(channel).length, 1); assert.match(chatStore.get(channel)[0].text, /1 coins · Rose ×10$/);
  assert.equal(events.filter(event => event.type === 'gift').length, 10, 'retry never emits another gift');
  assert.equal(events.filter(event => event.type === 'gift').at(-1).amount, 1, 'native effects see each individual amount, not combo total');
  assert.equal(events.filter(event => event.type === 'gift').at(-1).combo.count, 10);
  assert.deepEqual((await pool.query('select count from live_gift_combo_milestones where combo_id=$1 order by count', [key])).rows.map(row => row.count), [5,10]);
  const heart = await send('Heart', 5); assert.equal(heart.body.combo.count, 1);
  const rose = await send(); assert.equal(rose.body.combo.count, 1); assert.notEqual(rose.body.combo.id, key);
  await pool.query("update coin_transactions set created_at=now()-interval '3 seconds' where gift_combo_id=$1", [rose.body.combo.id]);
  // Also move earlier rows back so the fixture's latest paid transaction stays latest.
  await pool.query("update coin_transactions set created_at=now()-interval '4 seconds' where from_user_id=$1 and gift_combo_id<>$2", [sender,rose.body.combo.id]);
  const expired = await send(); assert.equal(expired.body.combo.count, 1); assert.notEqual(expired.body.combo.id, rose.body.combo.id);
  const otherChannel = await send('Rose', 1, randomUUID(), `${channel}-other`); assert.equal(otherChannel.body.combo.count, 1);
  const concurrent = await Promise.all([send(),send()]); assert.deepEqual(concurrent.map(result => result.body.combo.count).sort(), [2,3]);
  const concurrencyKey = randomUUID();
  await Promise.all([send('Rose',1,concurrencyKey),send('Rose',1,concurrencyKey)]);
  assert.equal((await pool.query('select count(*)::int as n from coin_transactions where idempotency_key=$1',[concurrencyKey])).rows[0].n,1);
  await pool.query('update coin_balances set balance=0 where user_id=$1',[sender]);
  assert.equal((await send()).statusCode,402);
  await pool.query('update coin_balances set balance=100 where user_id=$1',[sender]);
  const reset = await send(); assert.equal(reset.body.combo.count,1);
  deletedMessages.set(channel,[`gift:${reset.body.combo.id}`]);
  chatStore.set(channel,chatStore.get(channel).filter(row=>row.id!==`gift:${reset.body.combo.id}`));
  await send(); assert.equal(chatStore.get(channel).filter(row=>row.id===`gift:${reset.body.combo.id}`).length,0,'removed combo is not recreated by an update');
  console.log('PASS: live payment combos, 2-second expiry/gift/channel/failure boundaries, concurrent/retry ledger protection, socket counters, grouped chat and unique 5/10 milestones.');
} finally {
  await pool.query('delete from live_gift_combo_milestones where combo_id in (select gift_combo_id from coin_transactions where from_user_id=$1)',[sender]);
  await pool.query('delete from coin_transactions where from_user_id=$1',[sender]);
  await pool.query('delete from coin_balances where user_id=any($1::int[])',[[sender,recipient]]);
  await pool.query('delete from users where uid=any($1::int[])',[[sender,recipient]]);
  await pool.end(); unlinkSync(output);
}
process.exit(0);
