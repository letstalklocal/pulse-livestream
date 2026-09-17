import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, unlinkSync } from 'node:fs';
import { build } from 'esbuild';
const dir = fileURLToPath(new URL('..', import.meta.url));
const output = `${dir}/tests/.reaction-preferences-${randomUUID()}.cjs`;
await build({ stdin: { contents: `export { default as router, DEFAULT_REACTION_FAVORITES } from './src/routes/reaction-preferences'; export { pool } from '@workspace/db';`, resolveDir: dir }, outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['pg-native'], logLevel: 'silent' });
const { router, pool, DEFAULT_REACTION_FAVORITES: defaults } = createRequire(import.meta.url)(output);
const prefix = `reaction-test-${randomUUID()}`, a = 1870000000 + Math.floor(Math.random()*1000000), b = a + 1;
async function call(method, uid, body) {
  const res = { statusCode: 200, set(){return this;}, status(code){this.statusCode=code;return this;}, json(value){this.body=value;return this;} };
  await router.stack.find(l=>l.route?.path==='/reaction-preferences'&&l.route.methods[method]).route.stack[0].handle({ auth:()=>({userId:uid?`${prefix}-${uid}`:null}), body },res);
  return res;
}
try {
  await pool.query(readFileSync(new URL('../../../lib/db/migrations/20260917_reaction_preferences.sql',import.meta.url),'utf8'));
  for (const uid of [a,b]) await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)',[uid,`${prefix}-${uid}`,'Reaction preferences test']);
  assert.equal((await call('get',null)).statusCode,401); assert.equal((await call('put',null,{emojis:defaults})).statusCode,401);
  assert.deepEqual((await call('get',a)).body,{emojis:defaults,customized:false});
  const favorites=['👩🏽‍💻','🇨🇴','👨‍👩‍👧‍👦','❤️','🌈','🥳','1️⃣','🫶'];
  assert.deepEqual((await call('put',a,{emojis:favorites})).body,{emojis:favorites,customized:true});
  assert.deepEqual((await call('get',a)).body.emojis,favorites);
  assert.deepEqual((await pool.query('select emojis from reaction_preferences where user_id=$1',[a])).rows[0].emojis,favorites,'Durable ordered list');
  assert.deepEqual((await call('get',b)).body,{emojis:defaults,customized:false},'Account isolation');
  for (const body of [null,{},[],{emojis:favorites.slice(0,7)},{emojis:[...favorites,'🔥']},{emojis:Array(8).fill('❤️')},{emojis:['bad',...favorites.slice(1)]},{emojis:['🔥❤️',...favorites.slice(1)]},{emojis:favorites,userId:b}]) assert.equal((await call('put',a,body)).statusCode,400);
  assert.deepEqual((await call('get',a)).body.emojis,favorites,'Invalid saves preserve prior list');
  assert.equal((await call('put',a,{emojis:defaults})).statusCode,200);
  assert.equal((await pool.query('select count(*)::int as count from reaction_preferences where user_id=$1',[a])).rows[0].count,1,'Updates do not create extra rows');
  console.log('PASS: real database migration, authenticated defaults/save/reload/update, ordered eight unique emojis, account isolation and invalid-write preservation.');
} finally {
  await pool.query('delete from users where uid = ANY($1::int[]) and clerk_id like $2',[[a,b],`${prefix}%`]);
  await pool.end(); unlinkSync(output);
}
