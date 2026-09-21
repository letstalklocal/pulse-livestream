import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, unlinkSync } from 'node:fs';
import { build } from 'esbuild';

const dir = fileURLToPath(new URL('..', import.meta.url));
const output = `${dir}/tests/.post-gifts-test.cjs`;
await build({ stdin: { contents: `export { default as router } from './src/routes/posts'; export { pool } from '@workspace/db';`, resolveDir: dir }, outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['pg-native'], logLevel: 'silent', plugins: [{ name: 'storage', setup(b) {
  b.onLoad({ filter: /lib\/objectStorage\.ts$/ }, () => ({ contents: 'export const createPrivateGetUrl=async p=>p; export const createPrivateUploadUrl=async()=>({}); export const deletePrivateObject=async()=>{};' }));
} }] });
const { router, pool } = createRequire(import.meta.url)(output);
const prefix = `post-test-${randomUUID()}`;
const owner = 1750000000 + Math.floor(Math.random() * 10000000), viewer = owner + 1, other = owner + 2;
const ids = [];
const call = async (path, method, uid, postId, body = {}, extra = {}, query = {}) => {
  const handler = router.stack.find(l => l.route?.path === path && l.route.methods[method])?.route.stack[0].handle;
  assert.ok(handler);
  const res = { statusCode: 200, body: null, set() { return this; }, status(n) { this.statusCode = n; return this; }, json(value) { this.body = value; return this; } };
  await handler({ auth: () => ({ userId: uid ? `${prefix}-${uid}` : null }), params: { postId: String(postId), ...extra }, body, query }, res);
  return res;
};
const activity = (id, uid) => call('/posts/:postId/activity', 'get', uid, id);
const react = (id, uid, kind, active) => call('/posts/:postId/activity', 'put', uid, id, { kind, active });
const comment = (id, uid, text, requestId = randomUUID()) => call('/posts/:postId/comments', 'post', uid, id, { text, requestId });
const gift = (id, uid, giftId = 'rose', requestId = randomUUID(), extra = {}) => call('/posts/:postId/gifts', 'post', uid, id, { giftId, requestId, ...extra });
try {
  for (const uid of [owner, viewer, other]) await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)', [uid, `${prefix}-${uid}`, 'Alex']);
  for (let i = 0; i < 2; i++) ids.push((await pool.query('insert into posts(owner_user_id,image_object_path,caption) values($1,$2,$3) returning id', [owner, `/objects/${prefix}`, 'Caption'])).rows[0].id);
  const [post, second] = ids;
  const balance = async uid => (await pool.query('select balance from coin_balances where user_id=$1', [uid])).rows[0]?.balance ?? 0;
  const notices = async () => (await call('/posts/:postId/comments', 'get', owner, post)).body.comments;
  assert.equal((await gift(post, null)).statusCode, 401);
  assert.equal((await gift(post, owner)).statusCode, 400);
  assert.equal((await gift(post, viewer, 'toString')).statusCode, 400);
  assert.equal((await gift(post, viewer, 'rose', 'bad')).statusCode, 400);
  assert.equal((await gift(2147483647, viewer)).statusCode, 404);
  assert.equal((await gift(post, viewer)).statusCode, 402);
  assert.equal((await notices()).length, 0);
  await pool.query('insert into coin_balances(user_id,balance) values($1,1000) on conflict(user_id) do update set balance=1000', [viewer]);
  // Force the final notice insert to fail and prove both balances/ledger roll back.
  const failedKey = randomUUID();
  await pool.query('insert into post_comments(post_id,user_id,text,request_id) values($1,$2,$3,$4)', [post, viewer, 'Fixture', `post-gift:${viewer}:${failedKey}`]);
  await assert.rejects(() => gift(post, viewer, 'crown', failedKey));
  assert.equal(await balance(viewer), 1000);
  assert.equal(await balance(owner), 0);
  assert.equal((await pool.query('select count(*)::int n from coin_transactions where from_user_id=$1', [viewer])).rows[0].n, 0);
  await pool.query('delete from post_comments where user_id=$1', [viewer]);
  const key = randomUUID();
  const results = await Promise.all([gift(post, viewer, 'crown', key, { amount: 1, recipientUid: other, senderName: 'Forged' }), gift(post, viewer, 'crown', key)]);
  assert.ok(results.every(r => r.statusCode === 200));
  assert.equal(await balance(viewer), 500);
  assert.equal(await balance(owner), 500);
  assert.equal(await balance(other), 0);
  assert.equal((await notices()).length, 1);
  assert.equal((await notices())[0].text, '🪙 500 coins · Crown');
  assert.equal((await notices())[0].uid, viewer);
  // Previously saved notices also omit the name, even after a profile rename.
  await pool.query('update post_comments set text=$1 where request_id=$2', ['Previous name sent 🪙 500 coins · Crown', `post-gift:${viewer}:${key}`]);
  assert.equal((await notices())[0].text, '🪙 500 coins · Crown');
  assert.equal((await notices())[0].name, 'Alex');
  assert.equal('requestId' in (await notices())[0], false);
  if (process.env.POST_GIFT_TEST_API_URL) {
    const base = process.env.POST_GIFT_TEST_API_URL;
    const denied = await fetch(`${base}/posts/${post}/gifts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ giftId: 'rose', requestId: randomUUID() }) });
    assert.equal(denied.status, 401);
    const totals = await fetch(`${base}/posts/${post}/activity`);
    assert.equal(totals.status, 200);
    assert.equal((await totals.json()).giftCoins, 500);
    const response = await fetch(`${base}/posts/${post}/comments`);
    assert.equal(response.status, 200);
    const page = await response.json();
    assert.equal(page.comments[0].text, '🪙 500 coins · Crown');
    assert.equal(page.comments[0].uid, viewer);
    console.log('PASS: running API rejects unauthenticated gift sends and serves the committed gift notice.');
  }
  assert.equal((await activity(post, owner)).body.commentCount, 1);
  assert.equal((await activity(post, owner)).body.giftCoins, 500);
  assert.equal((await activity(second, owner)).body.giftCoins, 0);
  assert.equal((await gift(second, viewer, 'crown', key)).statusCode, 409);
  assert.equal((await gift(post, viewer, 'rose', key)).statusCode, 409);
  const race = await Promise.all([gift(post, viewer, 'crown'), gift(post, viewer, 'crown')]);
  assert.deepEqual(race.map(r => r.statusCode).sort(), [200, 402]);
  assert.equal(await balance(viewer), 0);
  assert.equal(await balance(owner), 1000);
  assert.equal((await notices()).length, 2);
  const first = (await notices()).find(n => n.text.includes('Crown'));
  await call('/posts/:postId/comments/:commentId', 'delete', owner, post, {}, { commentId: String(first.id) });
  assert.equal(await balance(owner), 1000, 'Moderating a notice does not refund coins');
  assert.equal((await activity(post, owner)).body.giftCoins, 1000, 'Totals survive comment removal');
  await gift(post, viewer, 'crown', key);
  assert.equal(await balance(owner), 1000);
  await pool.query('insert into user_blocks(blocker_user_id,blocked_user_id) values($1,$2)', [owner, viewer]);
  assert.equal((await gift(post, viewer)).statusCode, 404);
  await pool.query('delete from user_blocks where blocker_user_id=$1', [owner]);
  await pool.query('insert into privacy_preferences(posts_visibility,user_id) values($1,$2) on conflict(user_id) do update set posts_visibility=excluded.posts_visibility', ['friends', owner]);
  assert.equal((await gift(post, viewer)).statusCode, 404);
  await pool.query('delete from posts where id=$1', [post]);
  assert.equal((await gift(post, viewer)).statusCode, 404);
  console.log('PASS: post gifts transfer catalog prices to owner with atomic notices, concurrent retry/overspend protection, authenticated identities, privacy/blocking, moderation and deleted-post protection.');
} finally {
  await pool.query('delete from coin_transactions where from_user_id=ANY($1::int[]) or to_user_id=ANY($1::int[])', [[owner, viewer, other]]);
  await pool.query('delete from coin_balances where user_id=ANY($1::int[])', [[owner, viewer, other]]);
  await pool.query('delete from users where uid=ANY($1::int[])', [[owner, viewer, other]]);
  await pool.end();
  unlinkSync(output);
}
