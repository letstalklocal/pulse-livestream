import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import { build } from 'esbuild';
const dir = fileURLToPath(new URL('..', import.meta.url));
const output = `${dir}/tests/.earnings-${randomUUID()}.cjs`;
await build({ stdin: { contents: `export { default as earnings } from './src/routes/earnings'; export { pool } from '@workspace/db'; export { earningsRange } from '../mobile/utils/earningsPeriod';`, resolveDir: dir }, outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['pg-native'], logLevel: 'silent' });
const { earnings, pool, earningsRange } = createRequire(import.meta.url)(output);
const prefix = `earnings-test-${randomUUID()}`;
const ids = [];
const firstUid = 1800000000 + Math.floor(Math.random() * 10000000);
const call = async (query, userId = prefix) => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await earnings.stack.find(layer => layer.route?.path === '/earnings').route.stack[0].handle({ query, auth: () => ({ userId, tokenType: 'session_token' }) }, res);
  return res;
};
try {
  process.env.TZ = 'America/New_York';
  const now = new Date(2026, 2, 8, 12);
  const day = earningsRange('day', 0, now);
  assert.equal(day.end - day.start, 23 * 3600000); // DST spring-forward day.
  assert.equal(earningsRange('week', 0, now).start.getDate(), 2); // Monday.
  assert.equal(earningsRange('month', -1, new Date(2026, 0, 15)).start.getFullYear(), 2025);
  const leap = earningsRange('year', 0, new Date(2024, 5, 1));
  assert.equal((leap.end - leap.start) / 86400000, 366);
  const month = earningsRange('month', -1, new Date(2024, 2, 31));
  assert.equal(month.start.getMonth(), 1);
  assert.equal(month.end.getMonth(), 2);
  const range = { start: '2026-09-01T00:00:00.000Z', end: '2026-10-01T00:00:00.000Z' };
  assert.equal((await call(range, null)).statusCode, 401);
  for (const query of [{}, { start: 'bad', end: range.end }, { start: range.end, end: range.start }, { start: range.start, end: range.start }, { start: '2024-01-01', end: range.end }]) assert.equal((await call(query)).statusCode, 400);
  assert.equal((await call(range)).statusCode, 404);
  for (let i = 0; i < 4; i++) {
    const result = await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3) returning uid', [firstUid + i, i === 0 ? prefix : `${prefix}-${i}`, `Earnings tester ${i}`]);
    ids.push(result.rows[0].uid);
  }
  assert.deepEqual((await call(range)).body, { coins: 0, transactions: 0, supporters: 0, entries: [] });
  const add = (from, to, amount, type, date) => pool.query('insert into coin_transactions(from_user_id,to_user_id,amount,type,created_at,description) values($1,$2,$3,$4,$5,$6)', [from, to, amount, type, date, prefix]);
  await add(ids[1], ids[0], 100, 'gift', range.start); // Inclusive start.
  await add(ids[1], ids[0], 50, 'gift', '2026-09-15T12:00:00Z');
  await add(ids[2], ids[0], 200, 'gift', '2026-09-30T23:59:59Z');
  await add(ids[2], ids[0], 900, 'gift', range.end); // Exclusive end.
  await add(ids[2], ids[0], 900, 'gift', '2026-08-31T23:59:59Z');
  await add(null, ids[0], 10000, 'grant', range.start);
  await add(ids[0], ids[3], 700, 'gift', range.start); // Outgoing, another recipient.
  const result = await call({ ...range, uid: ids[3] }); // Caller cannot select someone else's account.
  assert.equal(result.body.coins, 350);
  assert.equal(result.body.transactions, 3);
  assert.equal(result.body.supporters, 2);
  assert.deepEqual(result.body.entries.map(e => [e.rank, e.uid, e.coins, e.transactions]), [[1, ids[2], 200, 1], [2, ids[1], 150, 2]]);
  const other = await call(range, `${prefix}-3`);
  assert.equal(other.body.coins, 700);
  console.log('PASS: calendar periods, DST, leap year, year rollover, authentication, invalid ranges, empty state, totals, ranking, date boundaries, grants excluded, outgoing gifts excluded, and account isolation.');
} finally {
  if (ids.length) {
    await pool.query('delete from coin_transactions where description=$1', [prefix]);
    await pool.query('delete from users where uid = any($1::int[])', [ids]);
  }
  await pool.end();
  unlinkSync(output);
}
