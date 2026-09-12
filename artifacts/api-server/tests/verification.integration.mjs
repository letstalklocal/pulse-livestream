import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const dir=fileURLToPath(new URL('..',import.meta.url));
const output=`${dir}/tests/.verification-${randomUUID()}.cjs`;
const uid=1700000000+Math.floor(Math.random()*10000000), other=uid+1;
const prefix=`verification-${randomUUID()}`;
const origin='https://verification.pulse.test';
Object.assign(process.env,{DIDIT_API_KEY:'test-only',DIDIT_WEBHOOK_SECRET:'test-secret',DIDIT_WORKFLOW_ID:randomUUID(),DIDIT_ENVIRONMENT:'sandbox',DIDIT_TEST_USER_IDS:`${uid},${other}`,VERIFICATION_PUBLIC_ORIGIN:origin,PULSE_PRIVACY_URL:`${origin}/privacy`,NODE_ENV:'test'});
await build({stdin:{contents:`import express from 'express'; import router,{diditWebhook} from './src/routes/verification'; export {pool} from '@workspace/db'; export {isAdultDate,decisionStatus,verifyDiditWebhook} from './src/lib/didit'; export function testApp(){const app=express();app.post('/api/verification/webhook',express.raw({type:'application/json'}),diditWebhook);app.use(express.json());app.use((req,res,next)=>{req.auth=()=>({userId:req.get('x-test-auth')||null,tokenType:'session_token'});next();});app.use('/api',router);return app;}`,resolveDir:dir},outfile:output,bundle:true,platform:'node',format:'cjs',external:['pg-native'],logLevel:'silent'});
const {pool,testApp,isAdultDate,decisionStatus,verifyDiditWebhook}=createRequire(import.meta.url)(output);
const nativeFetch=globalThis.fetch;
const records=new Map();let created=0;
globalThis.fetch=async (url,opts)=>{
 if(!String(url).startsWith('https://verification.didit.me/'))return nativeFetch(url,opts);
 if(opts?.method==='POST'){
  const body=JSON.parse(opts.body),id=randomUUID();created++;
  assert.equal(body.sandbox_scenario, "approve", "sandbox starts must explicitly require a Didit sandbox application");
  const record={session_id:id,workflow_id:body.workflow_id,vendor_data:body.vendor_data,environment:'sandbox',status:'In Progress'};
  records.set(id,record);
  return Response.json({...record,url:`https://verify.didit.me/session/${id}`},{status:201});
 }
 const id=String(url).split('/session/')[1]?.split('/')[0];
 return records.has(id)?Response.json(records.get(id)):Response.json({}, {status:404});
};
let server;
try{
 await pool.query(readFileSync(new URL('../../../lib/db/migrations/20260911_identity_verification.sql',import.meta.url),'utf8'));
 for(const id of [uid,other])await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)',[id,`${prefix}-${id}`,'Synthetic verification test']);
 server=testApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(path,{method='GET',body,auth,cookie,csrf,requestOrigin=origin,headers={}}={})=>{
  const res=await nativeFetch(base+'/api'+path,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(auth?{'x-test-auth':`${prefix}-${auth}`} : {}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'x-verification-csrf':csrf}:{}),Origin:requestOrigin,...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')};
 };
 const handoff=async(id)=>{
  const link=await call('/account/verification/handoff',{method:'POST',auth:id});assert.equal(link.status,200);
  const ticket=new URL(link.body.url).hash.slice('#ticket='.length);
  const exchanged=await call('/verification/web/exchange',{method:'POST',body:{ticket}});assert.equal(exchanged.status,200);
  assert.match(exchanged.cookie,/HttpOnly/);assert.match(exchanged.cookie,/Secure/);assert.match(exchanged.cookie,/SameSite=Lax/);
  assert.equal((await call('/verification/web/exchange',{method:'POST',body:{ticket}})).status,401);
  const cookie=exchanged.cookie.split(';')[0];const state=await call('/verification/web/status',{cookie});
  return {cookie,csrf:state.body.csrf};
 };
 assert.equal((await call('/account/verification')).status,401);
 assert.equal((await call('/account/verification/handoff',{method:'POST'})).status,401);
 assert.equal((await call('/verification/web/status')).status,401);
 assert.equal((await call('/account/verification',{auth:uid})).body.isVerified,false);
 const secret=process.env.DIDIT_API_KEY;delete process.env.DIDIT_API_KEY;
 assert.equal((await call('/account/verification/handoff',{method:'POST',auth:uid})).status,503);
 assert.equal((await call('/account/verification',{auth:uid})).body.available,false);
 process.env.DIDIT_API_KEY=secret;
 process.env.DIDIT_TEST_USER_IDS=String(other);
 assert.equal((await call('/account/verification/handoff',{method:'POST',auth:uid})).status,503);
 process.env.DIDIT_TEST_USER_IDS=`${uid},${other}`;
 const a=await handoff(uid),b=await handoff(other);
 assert.equal((await call('/verification/web/status',{...a,requestOrigin:'https://other.pulse.test'})).status,403);
 assert.equal((await call('/verification/web/preference',{method:'POST',...a,body:{enabled:true,version:'pulse-mature-v1'}})).status,403);
 assert.equal((await call('/verification/web/start',{method:'POST',...a,body:{consent:false}})).status,400);
 assert.equal((await call('/verification/web/start',{method:'POST',...a,csrf:'wrong',body:{consent:true,consentVersion:'pulse-id-18-v1'}})).status,403);
 assert.equal((await call('/verification/web/start',{method:'POST',...a,requestOrigin:'https://evil.test',body:{consent:true,consentVersion:'pulse-id-18-v1'}})).status,403);
 const starts=await Promise.all([1,2].map(()=>call('/verification/web/start',{method:'POST',...a,body:{consent:true,consentVersion:'pulse-id-18-v1',uid:other,isVerified:true}})));
 assert.ok(starts.every(r=>r.status===200));assert.equal(created,1);assert.equal(starts[0].body.url,starts[1].body.url);
 const record=[...records.values()][0];
 const row=async id=>(await pool.query('select * from identity_verifications where user_id=$1',[id])).rows[0];
 assert.equal((await row(uid)).session_id,record.session_id);assert.equal((await row(other)).session_id,null);
 const state=await call('/verification/web/status',{...a});assert.equal(state.body.isVerified,false);assert.equal('reference' in state.body,false);assert.equal('sessionUrl' in state.body,false);
 const webhook=async(extra={})=>{
  const timestamp=String(Math.floor(Date.now()/1000));
  const event={timestamp:Number(timestamp),session_id:record.session_id,status:'Approved',webhook_type:'status.updated',environment:'sandbox',...extra};
  const raw=JSON.stringify(event);const signature=createHmac('sha256','test-secret').update(raw).digest('hex');
  return call('/verification/webhook',{method:'POST',body:event,headers:{'x-signature':signature,'x-timestamp':timestamp}});
 };
 assert.equal((await call('/verification/webhook',{method:'POST',body:{session_id:record.session_id,isVerified:true}})).status,401);
 assert.equal((await webhook({timestamp:1})).status,401);
 const good={status:'Approved',id_verifications:[{status:'Approved',date_of_birth:'1990-05-12',verification_method:'document'}],liveness_checks:[{status:'Approved'}],face_matches:[{status:'Approved'}]};
 Object.assign(record,good);
 const reference=record.vendor_data;record.vendor_data='other-account';assert.equal((await webhook()).status,502);assert.equal((await row(uid)).is_verified,false);record.vendor_data=reference;
 record.id_verifications[0].date_of_birth='2015-01-01';assert.equal((await webhook()).status,200);assert.equal((await row(uid)).is_verified,false);
 record.id_verifications[0].date_of_birth='1990-05-12';record.face_matches=[];await webhook();assert.equal((await row(uid)).status,'review_needed');
 record.face_matches=[{status:'Approved'}];assert.equal((await webhook()).status,200);assert.equal((await row(uid)).is_verified,true);assert.equal((await row(uid)).mature_content_enabled,false);
 const verifiedAt=(await row(uid)).verified_at.toISOString();await webhook();assert.equal((await row(uid)).verified_at.toISOString(),verifiedAt);
 assert.equal((await call('/verification/web/preference',{method:'POST',...b,body:{enabled:true,version:'pulse-mature-v1',uid}})).status,403);
 assert.equal((await call('/verification/web/preference',{method:'POST',...a,body:{enabled:true,version:'pulse-mature-v1'}})).status,200);assert.equal((await row(uid)).mature_content_enabled,true);
 await call('/verification/web/preference',{method:'POST',...a,body:{enabled:false,version:'pulse-mature-v1'}});assert.equal((await row(uid)).mature_content_enabled,false);
 await call('/verification/web/preference',{method:'POST',...a,body:{enabled:true,version:'pulse-mature-v1'}});
 record.status='Declined';await webhook();assert.equal((await row(uid)).is_verified,false);assert.equal((await row(uid)).mature_content_enabled,false);
 // Replayed Approved envelope cannot override the provider's current Declined state.
 await webhook();assert.equal((await row(uid)).status,'failed');
 const now=new Date('2026-09-11T00:00:00Z');assert.equal(isAdultDate('2008-09-11',now),true);assert.equal(isAdultDate('2008-09-12',now),false);assert.equal(isAdultDate('2008-02-30',now),false);assert.equal(isAdultDate('2027-01-01',now),false);
 assert.equal(isAdultDate('2008-02-29',new Date('2026-02-28T23:59:59Z')),false);assert.equal(isAdultDate('2008-02-29',new Date('2026-03-01T00:00:00Z')),true);
 assert.equal(decisionStatus({status:'Approved'}),'review_needed');
 const ts=String(Math.floor(Date.now()/1000));
 const canonical=JSON.stringify({status:'Approved',timestamp:Number(ts)});
 const signature=createHmac('sha256','test-secret').update(canonical).digest('hex');
 assert.equal(verifyDiditWebhook(Buffer.from(JSON.stringify({timestamp:Number(ts),status:'Approved'})),signature,undefined,ts,'test-secret'),true);
 assert.equal(verifyDiditWebhook(Buffer.from(JSON.stringify({timestamp:Number(ts),status:'Declined'})),signature,undefined,ts,'test-secret'),false);
 assert.equal(verifyDiditWebhook(Buffer.from(canonical),'invalid',undefined,ts,'test-secret'),false);

 process.env.NODE_ENV='production';assert.equal((await call('/account/verification/handoff',{method:'POST',auth:uid})).status,503);process.env.NODE_ENV='test';
 const html=await nativeFetch(base+'/api/verification/');assert.equal(html.status,200);assert.match(html.headers.get('content-security-policy'),/frame-ancestors 'none'/);const source=await html.text();assert.ok(source.includes('history.replaceState'));assert.ok(!source.includes('type="checkbox" id="mature" checked'));
 console.log('PASS: real HTTP + isolated database verification tests; Didit network mocked; no real IDs or provider checks used.');
}finally{
 globalThis.fetch=nativeFetch;
 if(server)await new Promise(resolve=>server.close(resolve));
 await pool.query('delete from users where uid = ANY($1::int[]) and clerk_id like $2',[[uid,other],`${prefix}%`]);
 await pool.end();unlinkSync(output);
}
