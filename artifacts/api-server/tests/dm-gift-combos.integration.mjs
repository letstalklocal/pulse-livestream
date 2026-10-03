import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
const dir = fileURLToPath(new URL('..', import.meta.url)), output = `${dir}/tests/.dm-combos-${randomUUID()}.cjs`;
await build({ stdin: { contents: "export {default as router} from './src/routes/direct-messages'; export {pool} from '@workspace/db';", resolveDir: dir }, outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['pg-native'], logLevel: 'silent' });
const { router, pool } = createRequire(import.meta.url)(output);
const sender = 1870000000 + Math.floor(Math.random() * 10000) * 3, recipient = sender + 1, other = sender + 2;
const prefix = `dm-combo-${randomUUID()}`, auth = id => `${prefix}-${id}`, keys = [];
const triggerName = `dm_combo_fail_${randomUUID().replaceAll('-', '')}`;
const handler = router.stack.find(layer => layer.route?.path === '/dms/gifts' && layer.route.methods.post).route.stack[0].handle;
async function send(giftId = 'rose', key = randomUUID(), recipientId = recipient, user = sender) {
  keys.push(key);
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ auth: () => ({ userId: user == null ? null : auth(user) }), body: { recipientId, giftId, idempotencyKey: key }, log: { error() {} } }, res);
  return res;
}
try {
  for (const id of [sender, recipient, other]) {
    await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)', [id, auth(id), 'Combo fixture']);
    await pool.query('insert into message_preferences(user_id,gift_to_open_chat) values($1,false)', [id]);
  }
  await pool.query('insert into coin_balances(user_id,balance) values($1,1000)', [sender]);
  // Fail the last write after the wallet/message/ledger were changed, proving rollback.
  await pool.query(`CREATE FUNCTION ${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.idempotency_key='${prefix}' THEN RAISE EXCEPTION 'fixture failure'; END IF; RETURN NEW; END $$`);
  await pool.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON dm_gift_combo_payments FOR EACH ROW EXECUTE FUNCTION ${triggerName}()`);
  assert.equal((await send('rose', prefix)).statusCode, 500);
  assert.equal((await pool.query('select balance from coin_balances where user_id=$1', [sender])).rows[0].balance, 1000);
  assert.equal((await pool.query('select count(*)::int as n from direct_messages where from_user_id=$1', [sender])).rows[0].n, 0);
  assert.equal((await pool.query('select count(*)::int as n from coin_transactions where from_user_id=$1', [sender])).rows[0].n, 0);
  await pool.query(`DROP TRIGGER ${triggerName} ON dm_gift_combo_payments`);
  await pool.query(`DROP FUNCTION ${triggerName}()`);
  assert.equal((await send('rose', randomUUID(), recipient, null)).statusCode, 401);
  assert.equal((await send('invalid')).statusCode, 400);
  assert.equal((await send('rose', randomUUID(), sender)).statusCode, 400);
  const key = randomUUID(), first = await send('rose', key);
  assert.equal(first.statusCode, 200); assert.equal(first.body.combo.count, 1); assert.equal(first.body.balance, 999);
  const duplicate = await send('rose', key);
  assert.equal(duplicate.body.duplicate, true); assert.equal(duplicate.body.balance, 999); assert.equal(duplicate.body.combo.count, 1);
  assert.equal((await send('heart', key)).statusCode, 409);
  for (let count = 2; count <= 10; count++) {
    const result = await send(); assert.equal(result.statusCode, 200); assert.equal(result.body.combo.id, first.body.combo.id);
    assert.equal(result.body.combo.count, count); assert.equal(result.body.message.id, first.body.message.id);
    assert.equal(result.body.combo.totalCoins, count); assert.match(result.body.message.text, new RegExp(`×${count}$`));
  }
  await send('rose', key);
  assert.deepEqual((await pool.query('select count from dm_gift_combo_milestones where combo_id=$1 order by count', [first.body.combo.id])).rows.map(r => r.count), [5, 10]);
  assert.equal((await pool.query('select count(*)::int as n from direct_messages where from_user_id=$1', [sender])).rows[0].n, 1);
  const heart = await send('heart'); assert.equal(heart.body.combo.count, 1); assert.notEqual(heart.body.combo.id, first.body.combo.id);
  const rose = await send(); assert.equal(rose.body.combo.count, 1); assert.notEqual(rose.body.combo.id, first.body.combo.id, 'switching back does not revive an older combo');
  await pool.query("update dm_gift_combos set last_paid_at=now()-interval '3 seconds' where id=$1", [rose.body.combo.id]);
  const expired = await send(); assert.equal(expired.body.combo.count, 1); assert.notEqual(expired.body.combo.id, rose.body.combo.id);
  const another = await send('rose', randomUUID(), other); assert.equal(another.body.combo.count, 1); assert.notEqual(another.body.combo.id, expired.body.combo.id);
  const concurrent = await Promise.all([send(), send()]);
  assert.deepEqual(concurrent.map(r => r.body.combo.count).sort(), [2, 3], 'concurrent gifts serialize without losing count');
  const concurrencyKey = randomUUID();
  const retryRace = await Promise.all([send('rose', concurrencyKey), send('rose', concurrencyKey)]);
  assert.equal(retryRace.filter(r => r.body.duplicate).length, 1);
  const balances = (await pool.query('select user_id,balance from coin_balances where user_id=any($1::int[])', [[sender, recipient, other]])).rows;
  assert.equal(balances.reduce((sum, row) => sum + row.balance, 0), 1000, 'every debit equals recipient credit');
  assert.equal((await pool.query('select count(*)::int as n from coin_transactions where from_user_id=$1', [sender])).rows[0].n, 17, 'one ledger row per paid gift');
  await pool.query('update coin_balances set balance=0 where user_id=$1', [sender]);
  const failed = await send(); assert.equal(failed.statusCode, 402);
  await pool.query('update coin_balances set balance=100 where user_id=$1', [sender]);
  const afterFailure = await send(); assert.equal(afterFailure.body.combo.count, 1, 'failed payment ends the combo');
  assert.equal((await pool.query('select count(*)::int as n from dm_gift_combo_payments where idempotency_key=any($1::text[])', [keys])).rows[0].n, 18);
  console.log('PASS: actual database gift payment/receipt atomicity, same-card counts, expiry/gift/recipient boundaries, failure reset, retry/concurrent deduplication, balanced ledger and unique 5/10 milestones.');
} finally {
  await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON dm_gift_combo_payments`);
  await pool.query(`DROP FUNCTION IF EXISTS ${triggerName}()`);
  await pool.query('delete from dm_gift_combo_milestones where combo_id in (select id from dm_gift_combos where sender_id=$1)', [sender]);
  await pool.query('delete from dm_gift_combo_payments where combo_id in (select id from dm_gift_combos where sender_id=$1)', [sender]);
  await pool.query('delete from dm_gift_combos where sender_id=$1', [sender]);
  await pool.query('delete from direct_messages where from_user_id=any($1::int[])', [[sender,recipient,other]]);
  await pool.query('delete from coin_transactions where from_user_id=$1', [sender]);
  await pool.query('delete from coin_balances where user_id=any($1::int[])', [[sender,recipient,other]]);
  await pool.query('delete from message_preferences where user_id=any($1::int[])', [[sender,recipient,other]]);
  await pool.query('delete from users where uid=any($1::int[])', [[sender,recipient,other]]);
  await pool.end(); unlinkSync(output);
}
process.exit(0);
