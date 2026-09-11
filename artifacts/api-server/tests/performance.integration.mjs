import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import { build } from 'esbuild';
const dir = fileURLToPath(new URL('..', import.meta.url));
const output = `${dir}/tests/.performance-${randomUUID()}.cjs`;
await build({ stdin: { contents: `export { default as performance } from './src/routes/performance'; export { performanceSummary } from './src/lib/performance'; export { pool } from '@workspace/db';`, resolveDir: dir }, outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['pg-native'], logLevel: 'silent' });
const { performance, performanceSummary, pool } = createRequire(import.meta.url)(output);
const prefix = `performance-test-${randomUUID()}`, ids = [];
const hour = 3600000, day = 24 * hour;
const days = Array.from({ length: 31 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, start: i * day, end: (i + 1) * day }));
const summarize = sessions => performanceSummary(days, sessions, days[0].date);
const call = async (query = { timezone: 'UTC' }, userId = prefix) => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await performance.stack.find(layer => layer.route?.path === '/performance').route.stack[0].handle({ query, auth: () => ({ userId, tokenType: 'session_token' }) }, res);
  return res;
};
try {
  assert.equal(summarize([{ start: 0, end: hour / 2 }, { start: hour / 2, end: hour }]).qualifyingDays, 0);
  assert.equal(summarize([{ start: 0, end: hour - 1 }]).qualifyingDays, 0);
  assert.equal(summarize([{ start: 0, end: hour }]).qualifyingDays, 1);
  const overlap = summarize([{ start: 0, end: hour }, { start: hour / 2, end: 2 * hour }]);
  assert.equal(overlap.seconds, 7200); assert.equal(overlap.qualifyingDays, 1);
  const midnight = summarize([{ start: day - hour / 2, end: day + hour / 2 }]);
  assert.equal(midnight.seconds, 3600); assert.equal(midnight.qualifyingDays, 0);
  assert.equal(summarize([{ start: -hour, end: hour }]).seconds, 3600);
  const tenDays = Array.from({ length: 10 }, (_, i) => ({ start: i * day, end: i * day + 2 * hour }));
  assert.equal(summarize(tenDays).goalMet, true);
  assert.equal(summarize(tenDays.slice(1)).goalMet, false);
  assert.equal(summarize([{ start: 0, end: 20 * hour }]).goalMet, false);
  assert.equal(summarize(tenDays.map(s => ({ ...s, end: s.start + hour }))).goalMet, false);
  assert.equal((await call({}, null)).statusCode, 401);
  assert.equal((await call({ timezone: 'invalid-zone' })).statusCode, 400);
  assert.equal((await call()).statusCode, 404);
  const firstUid = 1810000000 + Math.floor(Math.random() * 10000000);
  for (let i = 0; i < 2; i++) { await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)', [firstUid + i, i === 0 ? prefix : `${prefix}-other`, 'Performance test']); ids.push(firstUid + i); }
  const empty = await call(); assert.equal(empty.statusCode, 200); assert.equal(empty.body.seconds, 0); assert.equal(empty.body.bonusCoins, 0);
  const start = new Date(`${empty.body.month}-01T00:00:00Z`).getTime();
  const insertSession = async (suffix, a, b, heartbeat = b) => {
    await pool.query('insert into live_stream_sessions(channel_id,host_user_id,host_name,title,category,started_at,last_heartbeat_at,ended_at) values($1,$2,$3,$4,$5,$6,$7,$8)', [prefix + suffix, ids[0], 'Test', 'Test', 'talk', new Date(a), new Date(heartbeat), b === null ? null : new Date(b)]);
  };
  // Earlier in this month; if run during its first two hours, still verify clipping to server time.
  await insertSession('-a', start, start + hour / 2);
  await insertSession('-b', start + hour / 2, start + hour);
  await pool.query('insert into stream_history(channel_id,host_uid,host_name,title,category,started_at,ended_at) values($1,$2,$3,$4,$5,$6,$7)', [prefix + '-a', ids[0], 'Test', 'Test', 'talk', new Date(start), new Date(start + hour / 2)]);
  const split = await call(); assert.equal(split.body.qualifyingDays, 0); assert.ok(split.body.seconds <= 3600);
  await insertSession('-c', start, start + hour);
  if (Date.now() >= start + hour) { const qualified = await call(); assert.equal(qualified.body.qualifyingDays, 1); assert.equal(qualified.body.seconds, 3600); }
  // Stale open sessions cannot accumulate to the current time.
  await insertSession('-stale', start + hour, null, start + hour + 1000);
  const stale = await call(); assert.ok(stale.body.seconds <= 3601);
  for (const [type, channel, amount, recipient] of [['gift', prefix + '-a', 101, ids[0]], ['gift', null, 1000, ids[0]], ['grant', prefix + '-a', 9000, ids[0]], ['gift', prefix + '-a', 500, ids[1]]]) {
    await pool.query('insert into coin_transactions(from_user_id,to_user_id,amount,type,channel_id,description) values($1,$2,$3,$4,$5,$6)', [ids[1], recipient, amount, type, channel, prefix]);
  }
  const bonus = await call({ timezone: 'UTC', uid: ids[1] });
  assert.equal(bonus.body.liveCoins, 101); assert.equal(bonus.body.bonusCoins, 5); assert.equal(bonus.body.goalMet, false);
  const other = await call({ timezone: 'UTC' }, `${prefix}-other`); assert.equal(other.body.seconds, 0); assert.equal(other.body.liveCoins, 500);
  assert.equal((await call({ timezone: 'America/New_York' })).statusCode, 200);
  console.log('PASS: single-stream minimum, exact threshold, overlaps, midnight/month clipping, both monthly goals, authentication, timezone validation, legacy deduplication, stale sessions, account isolation, and live-only 5% bonus.');
} finally {
  if (ids.length) {
    await pool.query('delete from coin_transactions where description=$1', [prefix]);
    await pool.query('delete from stream_history where host_uid=any($1::int[])', [ids]);
    await pool.query('delete from live_stream_sessions where host_user_id=any($1::int[])', [ids]);
    await pool.query('delete from users where uid=any($1::int[])', [ids]);
  }
  await pool.end(); unlinkSync(output);
}
