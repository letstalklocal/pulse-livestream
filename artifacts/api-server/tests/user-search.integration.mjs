import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const dir = fileURLToPath(new URL('..', import.meta.url));
const output = `${dir}/tests/.user-search-${randomUUID()}.cjs`;
const prefix = `search${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const firstUid = 1800000000 + Math.floor(Math.random() * 10000000);
const ids = Array.from({ length: 36 }, (_, i) => firstUid + i);
await build({
  stdin: { contents: `import express from 'express';import router from './src/routes/userSearch';export {pool} from '@workspace/db';export function testApp(){const app=express();app.use((req,res,next)=>{req.auth=()=>({userId:req.get('x-test-auth')||null});next();});app.use('/api',router);return app;}`, resolveDir: dir },
  outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['pg-native'], logLevel: 'silent',
});
const { pool, testApp } = createRequire(import.meta.url)(output);
let server;
try {
  for (const [i, uid] of ids.entries()) {
    const name = i === 0 ? prefix : i === 1 ? `${prefix}_literal%` : i === 2 ? `before${prefix}` : `${prefix}${String(i).padStart(2, '0')}`;
    await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)', [uid, `${prefix}-${uid}`, name]);
  }
  await pool.query('insert into user_blocks(blocker_user_id,blocked_user_id) values($1,$2),($3,$1)', [ids[0], ids[3], ids[4]]);
  server = testApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (q, auth) => {
    const response = await fetch(`${base}/api/users?q=${encodeURIComponent(q)}`, { headers: auth ? { 'x-test-auth': `${prefix}-${auth}` } : {} });
    return { status: response.status, body: await response.json() };
  };
  assert.deepEqual((await call('   ')).body, { users: [] });
  assert.equal((await call('x'.repeat(65))).status, 400);
  assert.equal((await fetch(`${base}/api/users?q=a&q=b`)).status, 400);
  const results = await call(` ${prefix.toUpperCase()} `);
  assert.equal(results.status, 200);
  assert.equal(results.body.users.length, 30);
  assert.equal(results.body.users[0].uid, ids[0], 'exact matches rank first');
  assert.ok(results.body.users.every(u => u.name.toLowerCase().includes(prefix)));
  assert.deepEqual(Object.keys(results.body.users[0]).sort(), ['avatarImageUrl', 'name', 'uid']);
  const literal = await call(`${prefix}_literal%`);
  assert.deepEqual(literal.body.users.map(u => u.uid), [ids[1]], 'wildcards are literal');
  assert.deepEqual((await call(`before${prefix}`)).body.users.map(u => u.uid), [ids[2]], 'offline accounts are searchable');
  assert.deepEqual((await call(`${prefix}03`, ids[0])).body.users, [], 'outgoing block excludes match');
  assert.deepEqual((await call(`${prefix}04`, ids[0])).body.users, [], 'incoming block excludes match');
  assert.equal((await call(`${prefix}03`)).body.users.length, 1, 'public guest search works');
  assert.deepEqual((await call(`${prefix}notfound`)).body.users, []);
  console.log('User search integration passed: matching, ranking, limit, literal wildcards, validation, public fields, offline users, both blocking directions.');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.query('delete from users where uid = any($1::int[]) and clerk_id like $2', [ids, `${prefix}-%`]);
  await pool.end();
  unlinkSync(output);
}
