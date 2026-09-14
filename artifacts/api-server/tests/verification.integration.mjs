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
Object.assign(process.env,{DIDIT_API_KEY:'test-only',DIDIT_LIVE_API_KEY:'test-live-key',DIDIT_WEBHOOK_SECRET:'test-secret',DIDIT_WORKFLOW_ID:randomUUID(),DIDIT_ID_WORKFLOW_ID:randomUUID(),DIDIT_ENVIRONMENT:'sandbox',DIDIT_TEST_USER_IDS:`${uid},${other}`,VERIFICATION_PUBLIC_ORIGIN:origin,PULSE_PRIVACY_URL:`${origin}/privacy`,NODE_ENV:'test'});
await build({stdin:{contents:`import express from 'express'; import router,{diditWebhook} from './src/routes/verification'; export {pool} from '@workspace/db'; export {isAdultDate,decisionStatus,verifyDiditWebhook,requireVerificationConfiguration,diditRequest} from './src/lib/didit'; export function testApp(){const app=express();app.post('/api/verification/webhook',express.raw({type:'application/json'}),diditWebhook);app.use(express.json());app.use((req,res,next)=>{req.auth=()=>({userId:req.get('x-test-auth')||null,tokenType:'session_token'});next();});app.use('/api',router);return app;}`,resolveDir:dir},outfile:output,bundle:true,platform:'node',format:'cjs',external:['pg-native'],logLevel:'silent'});
const {pool,testApp,isAdultDate,decisionStatus,verifyDiditWebhook,requireVerificationConfiguration,diditRequest}=createRequire(import.meta.url)(output);
const nativeFetch=globalThis.fetch;
const records=new Map();let created=0;
globalThis.fetch=async (url,opts)=>{
 if(!String(url).startsWith('https://verification.didit.me/'))return nativeFetch(url,opts);
 assert.equal(opts.headers['x-api-key'],process.env.DIDIT_ENVIRONMENT==='live'?'test-live-key':'test-only','provider requests must use the selected environment key');
 if(opts?.method==='POST'){
  const body=JSON.parse(opts.body);
  const existing=[...records.values()].find(r=>r.workflow_id===body.workflow_id&&r.vendor_data===body.vendor_data&&['Not Started','In Progress'].includes(r.status));
  if(existing){existing.callback=body.callback;return Response.json({...existing,url:`https://verify.didit.me/session/${existing.session_id}`});}
  const id=randomUUID();created++;
  assert.equal(body.sandbox_scenario, "approve", "sandbox starts must explicitly require a Didit sandbox application");
  const record={session_id:id,workflow_id:body.workflow_id,vendor_data:body.vendor_data,environment:'sandbox',status:'In Progress',callback:body.callback};
  records.set(id,record);
  return Response.json({...record,url:`https://verify.didit.me/session/${id}`},{status:201});
 }
 const id=String(url).split('/session/')[1]?.split('/')[0];
 return records.has(id)?Response.json(records.get(id)):Response.json({}, {status:404});
};
let server;
try{
 await pool.query(readFileSync(new URL('../../../lib/db/migrations/20260911_identity_verification.sql',import.meta.url),'utf8'));
 await pool.query(readFileSync(new URL('../../../lib/db/migrations/20260912_verification_type.sql',import.meta.url),'utf8'));
 await pool.query(readFileSync(new URL('../../../lib/db/migrations/20260912_verification_upgrade.sql',import.meta.url),'utf8'));
 await pool.query(readFileSync(new URL('../../../lib/db/migrations/20260913_verification_fallback.sql',import.meta.url),'utf8'));
 for(const id of [uid,other])await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)',[id,`${prefix}-${id}`,'Synthetic verification test']);
 server=testApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(path,{method='GET',body,auth,cookie,csrf,requestOrigin=origin,headers={}}={})=>{
  const res=await nativeFetch(base+'/api'+path,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(auth?{'x-test-auth':`${prefix}-${auth}`,Authorization:'Bearer synthetic-test-token'} : {}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'x-verification-csrf':csrf}:{}),Origin:requestOrigin,...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
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
 assert.equal((await call('/account/verification',{auth:uid})).body.verificationType,null);
 const secret=process.env.DIDIT_API_KEY;delete process.env.DIDIT_API_KEY;
 assert.equal((await call('/account/verification/handoff',{method:'POST',auth:uid})).status,503);
 assert.equal((await call('/account/verification',{auth:uid})).body.available,false);
 process.env.DIDIT_API_KEY=secret;
 process.env.DIDIT_TEST_USER_IDS=String(other);
 assert.equal((await call('/account/verification/handoff',{method:'POST',auth:uid})).status,503);
 process.env.DIDIT_TEST_USER_IDS=`${uid},${other}`;
 const a=await handoff(uid),b=await handoff(other);
 assert.equal((await call('/account/verification/start',{method:'POST',body:{consent:true,consentVersion:'pulse-id-18-v1'}})).status,401);
 assert.equal((await call('/account/verification/start',{method:'POST',auth:other,body:{consent:false,consentVersion:'pulse-id-18-v1'}})).status,400);
 assert.equal((await call('/account/verification/start',{method:'POST',auth:other,body:{consent:true,consentVersion:'wrong'}})).status,400);
 assert.equal(created,0);
 assert.equal((await call('/account/verification/refresh',{method:'POST'})).status,401);

 const upgradeBody={consent:true,consentVersion:'pulse-id-upgrade-v1'};
 assert.equal((await call('/verification/web/upgrade',{method:'POST',...b,body:upgradeBody})).status,403);
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
 assert.equal((await row(uid)).verification_type,'id');
 assert.equal((await call('/account/verification',{auth:uid})).body.verificationType,'id');
 assert.equal((await call('/verification/web/status',{...a})).body.verificationType,'id');
 assert.equal((await call('/verification/web/upgrade',{method:'POST',...a,body:upgradeBody})).status,409);
 const verifiedAt=(await row(uid)).verified_at.toISOString();await webhook();assert.equal((await row(uid)).verified_at.toISOString(),verifiedAt);
 assert.equal((await call('/verification/web/preference',{method:'POST',...b,body:{enabled:true,version:'pulse-mature-v1',uid}})).status,403);
 assert.equal((await call('/verification/web/preference',{method:'POST',...a,body:{enabled:true,version:'pulse-mature-v1'}})).status,200);assert.equal((await row(uid)).mature_content_enabled,true);
 await call('/verification/web/preference',{method:'POST',...a,body:{enabled:false,version:'pulse-mature-v1'}});assert.equal((await row(uid)).mature_content_enabled,false);
 await call('/verification/web/preference',{method:'POST',...a,body:{enabled:true,version:'pulse-mature-v1'}});
 record.status='Declined';await webhook();assert.equal((await row(uid)).is_verified,false);assert.equal((await row(uid)).mature_content_enabled,false);
 assert.equal((await row(uid)).verification_type,null);
 assert.equal((await call('/account/verification',{auth:uid})).body.verificationType,null);
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


 // Selfie-first acceptance uses evidence, not just an overall provider flag.
 const selfie={status:'Approved',features:['AGE_ESTIMATION'],id_verifications:[],liveness_checks:[{status:'Approved',age_estimation:35,score:95,warnings:[]}],face_matches:[]};
 assert.equal(decisionStatus(selfie),'verified');
 assert.equal(decisionStatus(selfie,new Date(),true),'review_needed');
 for(const age of [null,18,25,'35',NaN,Infinity,121])assert.equal(decisionStatus({...selfie,liveness_checks:[{...selfie.liveness_checks[0],age_estimation:age}]}),'review_needed');
 for(const change of [{score:null},{score:30},{warnings:[{risk:'LIVENESS_FACE_ATTACK'}]},{status:'Declined'}])assert.equal(decisionStatus({...selfie,liveness_checks:[{...selfie.liveness_checks[0],...change}]}),'review_needed');
 assert.equal(decisionStatus({...selfie,features:['LIVENESS']}),'review_needed');
 assert.equal(decisionStatus({...selfie,id_verifications:[{status:'Declined'}]}),'review_needed');
 const appStart=await call('/account/verification/start',{method:'POST',auth:other,body:{consent:true,consentVersion:'pulse-id-18-v1',uid,isVerified:true,callback:'https://evil.test'}});
 assert.equal(appStart.status,200);assert.equal(appStart.body.returnUrl,'mobile://verification');assert.match(appStart.body.url,/^https:\/\/verify\.didit\.me\/session\//);
 assert.equal((await row(other)).consent_version,'pulse-id-18-v1');assert.equal((await row(other)).is_verified,false);
 const appRecord=records.get((await row(other)).session_id);assert.equal(appRecord.callback,'mobile://verification');
 const resume=await call('/account/verification/start',{method:'POST',auth:other,body:{consent:true,consentVersion:'pulse-id-18-v1'}});
 assert.equal(resume.status,200);assert.equal(resume.body.url,appStart.body.url);
 const webResume=await call('/account/verification/start',{method:'POST',auth:other,body:{consent:true,consentVersion:'pulse-id-18-v1',platform:'web'}});
 assert.equal(webResume.status,200);assert.equal(webResume.body.returnUrl,origin+'/verification');assert.equal(appRecord.callback,origin+'/verification');

 const initial=records.get((await row(other)).session_id);Object.assign(initial,structuredClone(selfie));
 assert.equal((await webhook({session_id:initial.session_id})).status,200);
 assert.equal((await row(other)).verification_type,'selfie');
 const appRefresh=await call('/account/verification/refresh',{method:'POST',auth:other,body:{status:'Approved',uid}});
 assert.equal(appRefresh.status,200);assert.equal(appRefresh.body.verificationType,'selfie');assert.equal(appRefresh.body.available,true);
 assert.equal((await call('/account/verification/start',{method:'POST',auth:other,body:{consent:true,consentVersion:'pulse-id-18-v1'}})).status,409);

 assert.equal((await call('/account/verification',{auth:other})).body.canUpgrade,true);
 await call('/verification/web/preference',{method:'POST',...b,body:{enabled:true,version:'pulse-mature-v1'}});
 const originalVerifiedAt=(await row(other)).verified_at.toISOString();
 assert.equal((await call('/verification/web/upgrade',{method:'POST',...b,csrf:'bad',body:upgradeBody})).status,403);
 assert.equal((await call('/verification/web/upgrade',{method:'POST',...b,body:{...upgradeBody,consent:false}})).status,400);
 const upgradeKey=process.env.DIDIT_ID_WORKFLOW_ID;delete process.env.DIDIT_ID_WORKFLOW_ID;
 assert.equal((await call('/verification/web/upgrade',{method:'POST',...b,body:upgradeBody})).status,503);
 process.env.DIDIT_ID_WORKFLOW_ID=upgradeKey;
 const beforeCreated=created;
 const upgraded=await Promise.all([1,2].map(()=>call('/verification/web/upgrade',{method:'POST',...b,body:{...upgradeBody,uid,isVerified:true,verificationType:'id'}})));
 assert.ok(upgraded.every(r=>r.status===200));assert.equal(created,beforeCreated+1);assert.equal(upgraded[0].body.url,upgraded[1].body.url);
 let idRecord=records.get((await row(other)).upgrade_session_id);
 assert.equal(idRecord.workflow_id,upgradeKey);
 assert.equal((await row(other)).is_verified,true);assert.equal((await row(other)).verification_type,'selfie');assert.equal((await row(other)).mature_content_enabled,true);
 assert.equal((await row(other)).verified_at.toISOString(),originalVerifiedAt);
 const idReference=idRecord.vendor_data;idRecord.vendor_data='wrong';assert.equal((await webhook({session_id:idRecord.session_id})).status,502);idRecord.vendor_data=idReference;
 const idWorkflow=idRecord.workflow_id;idRecord.workflow_id='wrong';assert.equal((await webhook({session_id:idRecord.session_id})).status,502);idRecord.workflow_id=idWorkflow;
 Object.assign(idRecord,structuredClone(selfie));await webhook({session_id:idRecord.session_id});
 assert.equal((await row(other)).upgrade_status,'review_needed');assert.equal((await row(other)).verification_type,'selfie');
 assert.equal((await call('/verification/web/upgrade',{method:'POST',...b,body:upgradeBody})).status,409);
 idRecord.status='Expired';await webhook({session_id:idRecord.session_id});
 assert.equal((await row(other)).upgrade_status,'failed');assert.equal((await row(other)).is_verified,true);
 assert.equal((await call('/verification/web/upgrade',{method:'POST',...b,body:upgradeBody})).status,200);
 const oldUpgrade=idRecord;idRecord=records.get((await row(other)).upgrade_session_id);
 assert.notEqual(idRecord.session_id,oldUpgrade.session_id);
 assert.equal((await webhook({session_id:oldUpgrade.session_id})).status,404);
 const idGood={status:'Approved',id_verifications:[{status:'Approved',date_of_birth:'1990-05-12',verification_method:'document'}],liveness_checks:[{status:'Approved'}],face_matches:[{status:'Approved'}]};
 Object.assign(idRecord,structuredClone(idGood));await webhook({session_id:idRecord.session_id});
 assert.equal((await row(other)).verification_type,'id');assert.equal((await row(other)).upgrade_status,'verified');assert.equal((await row(other)).mature_content_enabled,true);
 const approvedState=(await call('/verification/web/status',{...b})).body;assert.equal(approvedState.verificationType,'id');assert.equal(approvedState.canUpgrade,false);
 assert.equal((await call('/verification/web/upgrade',{method:'POST',...b,body:upgradeBody})).status,409);
 // Old initial events cannot downgrade an ID upgrade.
 initial.status='Declined';await webhook({session_id:initial.session_id});assert.equal((await row(other)).verification_type,'id');
 idRecord.id_verifications[0].date_of_birth='2015-01-01';idRecord.status='Declined';await webhook({session_id:idRecord.session_id});
 assert.equal((await row(other)).is_verified,false);assert.equal((await row(other)).verification_type,null);assert.equal((await row(other)).mature_content_enabled,false);
 initial.status='Approved';await webhook({session_id:initial.session_id});assert.equal((await row(other)).is_verified,false);
 assert.equal((await call('/verification/web/start',{method:'POST',...b,body:{consent:true,consentVersion:'pulse-id-18-v1'}})).status,409);
 // The rejected split-session API is absent; fallback belongs inside Didit.
 assert.equal((await nativeFetch(base+'/api/account/verification/continue-id',{method:'POST'})).status,404);
 assert.equal((await nativeFetch(base+'/api/verification/web/continue-id',{method:'POST'})).status,404);
 // Environment changes cannot expose old evidence.
 process.env.DIDIT_ENVIRONMENT='live';await diditRequest(`session/${record.session_id}/decision/`);const hidden=(await call('/account/verification',{auth:other})).body;assert.equal(hidden.verificationType,null);assert.equal(hidden.upgradeStatus,'not_started');process.env.DIDIT_ENVIRONMENT='sandbox';
 console.log('PASS: selfie evidence, ID upgrade consent/auth, concurrent resume, retry/review, stale callbacks, ID-only acceptance, underage revocation and environment isolation.');
 // Named development testers remain allowed when the host reloads the older env allowlist.
 process.env.NODE_ENV='development';
 assert.doesNotThrow(()=>requireVerificationConfiguration(33737));
 assert.throws(()=>requireVerificationConfiguration(33738));
 process.env.NODE_ENV='test';assert.throws(()=>requireVerificationConfiguration(33737));
 process.env.NODE_ENV='production';assert.throws(()=>requireVerificationConfiguration(33737));process.env.NODE_ENV='test';
 process.env.NODE_ENV='production';assert.equal((await call('/account/verification/handoff',{method:'POST',auth:uid})).status,503);process.env.NODE_ENV='test';
 const html=await nativeFetch(base+'/api/verification/');assert.equal(html.status,200);assert.match(html.headers.get('content-security-policy'),/frame-ancestors 'none'/);const source=await html.text();assert.ok(source.includes('history.replaceState'));assert.ok(!source.includes('type="checkbox" id="mature" checked'));
 console.log('PASS: real HTTP + isolated database verification tests; Didit network mocked; no real IDs or provider checks used.');
}finally{
 globalThis.fetch=nativeFetch;
 if(server)await new Promise(resolve=>server.close(resolve));
 await pool.query('delete from users where uid = ANY($1::int[]) and clerk_id like $2',[[uid,other],`${prefix}%`]);
 await pool.end();unlinkSync(output);
}
