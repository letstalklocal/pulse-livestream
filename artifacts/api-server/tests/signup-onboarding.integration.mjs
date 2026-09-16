import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const dir=fileURLToPath(new URL('..',import.meta.url));
const output=`${dir}/tests/.onboarding-${randomUUID()}.cjs`;
const prefix=`onboarding-${randomUUID()}`;
const first=`${prefix}-first`, second=`${prefix}-second`, legacy=`${prefix}-legacy`;
await build({stdin:{contents:`import express from 'express';import users from './src/routes/users';export {pool} from '@workspace/db';export {signupEligibility,SIGNUP_TERMS_VERSION} from './src/lib/signupEligibility';export {birthdayError,birthdayFromParts,birthdayDigits,SIGNUP_TERMS_VERSION as mobileTermsVersion} from '../mobile/lib/signup-eligibility';export function testApp(){const app=express();app.use(express.json());app.use((req,res,next)=>{req.auth=()=>({userId:req.get('x-test-auth')||null,tokenType:'session_token'});next();});app.use('/api',users);return app;}`,resolveDir:dir},outfile:output,bundle:true,platform:'node',format:'cjs',external:['pg-native'],logLevel:'silent',plugins:[{name:'unrelated-geolocation',setup(b){b.onResolve({filter:/countryLocation$/},()=>({path:'country',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const countryName=()=>null;'}));}}]});
const {pool,testApp,signupEligibility,SIGNUP_TERMS_VERSION,mobileTermsVersion,birthdayError,birthdayFromParts,birthdayDigits}=createRequire(import.meta.url)(output);
let server;
try {
 await pool.query(readFileSync(new URL('../../../lib/db/migrations/20260916_signup_onboarding.sql',import.meta.url),'utf8'));
 assert.equal(SIGNUP_TERMS_VERSION,mobileTermsVersion);
 const declaration={dateOfBirth:'1990-02-28',termsAccepted:true,termsVersion:SIGNUP_TERMS_VERSION};
 const now=new Date('2026-09-16T00:00:00Z');
 for(const [dob,valid] of [['2008-09-16',true],['2008-09-17',false],['2008-02-30',false],['2027-01-01',false],['1899-01-01',false],['',false],['2008-9-16',false],['2000-02-29',true]]){
  assert.equal(signupEligibility({...declaration,dateOfBirth:dob},now)===null,valid,dob);
  assert.equal(birthdayError(dob,now)===null,valid,dob);
 }
 for(const [time,valid] of [['2026-02-28T23:59:59Z',false],['2026-03-01T00:00:00Z',true]]){
  assert.equal(signupEligibility({...declaration,dateOfBirth:'2008-02-29'},new Date(time))===null,valid);
  assert.equal(birthdayError('2008-02-29',new Date(time))===null,valid);
 }
 assert.equal(birthdayFromParts('9','2','1990'),'1990-02-09');
 assert.equal(birthdayFromParts('9','2','90'),'');assert.equal(birthdayDigits('٠١۲۳a'),'0123');assert.equal(birthdayDigits('१२３'),'123');
 server=testApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 const call=async(method,path,body,auth=first)=>{const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth?{'x-test-auth':auth}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};};
 const payload={clerkId:first,name:'Initial name',onboarding:declaration};
 assert.equal((await call('POST','/users/clerk-sync',payload,null)).status,401);
 assert.equal((await call('POST','/users/clerk-sync',{...payload,clerkId:second})).status,403);
 for(const onboarding of [undefined,null,[],{}, {...declaration,dateOfBirth:'2015-01-01'}, {...declaration,dateOfBirth:'2000-02-30'}, {...declaration,dateOfBirth:'9999-01-01'}, {...declaration,termsAccepted:false}, {...declaration,termsAccepted:'true'}, {...declaration,termsVersion:'obsolete'}]){
  const rejected=await call('POST','/users/clerk-sync',{...payload,onboarding});
  assert.equal(rejected.status,422);assert.equal(rejected.body.code,'ONBOARDING_REQUIRED');
  assert.equal((await pool.query('select count(*)::int as n from users where clerk_id=$1',[first])).rows[0].n,0,'Rejected signup must not create a Pulse account');
 }
 const results=await Promise.all([1,2,3].map(()=>call('POST','/users/clerk-sync',payload)));
 assert.ok(results.every(r=>r.status===200));const uid=results[0].body.user.uid;
 assert.ok(results.every(r=>r.body.user.uid===uid),'Concurrent retries create one account');
 const rows=(await pool.query('select date_of_birth::text,terms_version,terms_accepted_at from user_onboarding where user_id=$1',[uid])).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].date_of_birth,declaration.dateOfBirth);assert.equal(rows[0].terms_version,SIGNUP_TERMS_VERSION);assert.ok(rows[0].terms_accepted_at instanceof Date);
 assert.ok(Math.abs(Date.now()-rows[0].terms_accepted_at.getTime())<60000,'Acceptance time is supplied by the server');
 const publicProfile=await call('GET',`/users/${uid}`);
 assert.equal(publicProfile.status,200);const serialized=JSON.stringify(publicProfile.body);
 for(const privateValue of [declaration.dateOfBirth,SIGNUP_TERMS_VERSION,'termsAcceptedAt','dateOfBirth'])assert.ok(!serialized.includes(privateValue));
 assert.equal((await pool.query('select count(*)::int as n from identity_verifications where user_id=$1',[uid])).rows[0].n,0,'Signup does not grant Didit verification');
 assert.equal((await call('PUT',`/users/${uid}`,{name:'Attacker'},null)).status,401);
 assert.equal((await call('PUT','/users/1999999999',{name:'Bypass'})).status,403);
 assert.equal((await pool.query('select count(*)::int as n from users where uid=1999999999')).rows[0].n,0);
 assert.equal((await call('PUT',`/users/${uid}`,{name:'Saved display name',bio:'Saved bio'})).status,200);
 const again=await call('POST','/users/clerk-sync',{...payload,name:'Changed Clerk name',onboarding:{...declaration,dateOfBirth:'1991-01-01'}});
 assert.equal(again.body.user.name,'Saved display name');assert.equal(again.body.user.bio,'Saved bio');
 const unchanged=(await pool.query('select date_of_birth::text,terms_accepted_at from user_onboarding where user_id=$1',[uid])).rows[0];
 assert.equal(unchanged.date_of_birth,declaration.dateOfBirth);assert.equal(unchanged.terms_accepted_at.getTime(),rows[0].terms_accepted_at.getTime());
 const alternate=await call('POST','/users/clerk-sync',{name:'Future provider',onboarding:declaration},second);
 assert.equal(alternate.status,200,'All authenticated signup methods share the same gate');
 assert.equal((await call('PUT',`/users/${uid}`,{name:'Other account'},second)).status,403);
 const legacyUid=1900000000+Math.floor(Math.random()*10000000);
 await pool.query('insert into users(uid,clerk_id,name,bio) values($1,$2,$3,$4)',[legacyUid,legacy,'Legacy display name','Legacy bio']);
 const existing=await call('POST','/users/clerk-sync',{name:'Clerk name'},legacy);
 assert.equal(existing.status,200);assert.equal(existing.body.user.name,'Legacy display name');
 assert.equal((await pool.query('select count(*)::int as n from user_onboarding where user_id=$1',[legacyUid])).rows[0].n,0,'Do not fabricate acceptance for legacy accounts');
 console.log('PASS: authenticated signup, DOB/18th birthday/leap-day boundaries, explicit current terms, private server-stamped acceptance, concurrency, no profile-create bypass, provider-independent gate, unchanged profiles and legacy accounts. No real Clerk account or Didit check created.');
} finally {
 if(server)await new Promise(resolve=>server.close(resolve));
 await pool.query('delete from users where clerk_id like $1',[prefix+'%']);
 await pool.end();unlinkSync(output);
}
