import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { readFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir=fileURLToPath(new URL('..',import.meta.url));
const output=`${dir}/tests/.display-name-${randomUUID()}.cjs`;
await build({stdin:{contents:`import express from 'express';import router from './src/routes/users';export {pool} from '@workspace/db';export {SIGNUP_TERMS_VERSION} from './src/lib/signupEligibility';export function testApp(){const app=express();app.use(express.json());app.use((req,res,next)=>{req.auth=()=>({userId:req.get('x-test-auth')||null,tokenType:'session_token'});next();});app.use('/api',router);return app;}`,resolveDir:dir},outfile:output,bundle:true,platform:'node',format:'cjs',external:['pg-native'],logLevel:'silent',plugins:[{name:'unrelated-geolocation',setup(b){b.onResolve({filter:/countryLocation$/},()=>({path:'country',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const countryName=()=>null;'}));}}]});
const {pool,testApp,SIGNUP_TERMS_VERSION}=createRequire(import.meta.url)(output);
const server=testApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const clerkId = `display-name-test-${randomUUID()}`;
const call = async (path, method = 'GET', body) => {
  const response = await fetch(`${base}/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'x-test-auth': clerkId },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, 200, `${method} ${path}`);
  return (await response.json()).user;
};
try {
  await pool.query(readFileSync(new URL('../../../lib/db/migrations/20260916_signup_onboarding.sql',import.meta.url),'utf8'));
  const created = await call('/users/clerk-sync', 'POST', { clerkId, name: 'login_username', onboarding: {dateOfBirth:'1990-01-01',termsAccepted:true,termsVersion:SIGNUP_TERMS_VERSION} });
  assert.equal(created.name, 'login_username');
  const saved = await call(`/users/${created.uid}`, 'PUT', { name: 'My Display Name', bio: 'Saved biography' });
  assert.equal(saved.name, 'My Display Name');
  const before = (await pool.query('select updated_at from users where clerk_id=$1', [clerkId])).rows[0];
  for (const name of ['login_username', 'Changed Clerk Name']) {
    const synced = await call('/users/clerk-sync', 'POST', { clerkId, name });
    assert.equal(synced.uid, created.uid);
    assert.equal(synced.name, 'My Display Name');
    assert.equal(synced.bio, 'Saved biography');
  }
  const fetched = await call(`/users/${created.uid}`);
  assert.equal(fetched.name, 'My Display Name');
  const rows = (await pool.query('select name, bio, updated_at from users where clerk_id=$1', [clerkId])).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'My Display Name');
  assert.equal(rows[0].bio, 'Saved biography');
  assert.equal(rows[0].updated_at.getTime(), before.updated_at.getTime());
  console.log('Display-name integration passed with HTTP/database and mocked Clerk authentication: initial name, profile save, repeated login sync, profile reload, database persistence.');
} finally {
  await new Promise(resolve=>server.close(resolve));
  unlinkSync(output);
  await pool.query('delete from users where clerk_id=$1', [clerkId]);
  await pool.end();
}
