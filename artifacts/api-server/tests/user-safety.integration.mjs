import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unlinkSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';
const dir=fileURLToPath(new URL('..',import.meta.url));
const output=`${dir}/tests/.user-safety-test.cjs`;
await build({stdin:{contents:`export { default as safety } from './src/routes/user-safety'; export { default as dms } from './src/routes/direct-messages'; export { default as coins } from './src/routes/coins'; export { default as packs } from './src/routes/media-packs'; export { default as invites } from './src/routes/private-stream-invitations'; export { pool } from '@workspace/db';`,resolveDir:dir},outfile:output,bundle:true,platform:'node',format:'cjs',external:['pg-native'],logLevel:'silent'});
const {safety,dms,coins,packs,invites,pool}=createRequire(import.meta.url)(output);
const base=1760000000+Math.floor(Math.random()*10000000), [a,b,c]=[base,base+1,base+2], prefix=randomUUID();
const call=async(router,path,uid,body={},params={},method='post')=>{
 const handler=router.stack.find(layer=>layer.route?.path===path && layer.route.methods[method]).route.stack[0].handle;
 const res={statusCode:200,body:null,set(){return this;},status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}};
 await handler({auth:()=>({userId:uid?`${prefix}-${uid}`:null,tokenType:"session_token"}),params,body},res);return res;
};
const block=(who,target,blocked=true)=>call(safety,'/safety/users/:uid/block',who,{blocked},{uid:String(target)});
const status=(who,target)=>call(safety,'/safety/users/:uid',who,{}, {uid:String(target)},'get');
const report=(who,target,extra={})=>call(safety,'/safety/users/:uid/reports',who,{source:'profile',reason:'harassment',...extra},{uid:String(target)});
const send=(who,target,extra={})=>call(dms,'/dms',who,{recipientId:target,text:'Safety test',...extra});
try {
 await pool.query(readFileSync(new URL('../../../lib/db/migrations/20260910_user_safety.sql',import.meta.url),'utf8'));
 for(const uid of [a,b,c])await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)',[uid,`${prefix}-${uid}`,'Safety test']);
 // This suite exercises unrestricted chats; paid activation has its own suite.
 await pool.query('insert into message_preferences(user_id,gift_to_open_chat) select unnest($1::int[]),false',[[a,b,c]]);
 assert.equal((await block(null,b)).statusCode,401);
 assert.equal((await block(a,a)).statusCode,400);
 assert.equal((await send(null,b)).statusCode,401);
 assert.equal((await send(a,b,{senderId:c})).statusCode,403);
 const first=await send(b,a);assert.equal(first.statusCode,201);const messageId=Number(first.body.message.id);
 assert.equal((await report(a,b)).statusCode,201);
 assert.equal((await report(a,b,{source:'dm',messageId})).statusCode,201);
 assert.equal((await report(c,b,{source:'dm',messageId})).statusCode,404);
 assert.equal((await report(b,a,{source:'dm',messageId})).statusCode,404);
 assert.equal((await report(a,b,{messageId})).statusCode,400);
 assert.equal((await report(a,b,{reason:'invalid'})).statusCode,400);
 assert.equal((await report(a,b,{details:'x'.repeat(2001)})).statusCode,400);
 assert.equal((await report(a,a)).statusCode,400);
 await Promise.all([report(a,b,{source:'dm',messageId}),report(a,b,{source:'dm',messageId})]);
 const reports=(await pool.query('select * from user_reports where reported_uid=$1',[b])).rows;
 assert.equal(reports.length,2);assert.ok(reports.every(r=>r.reporter_user_id===a && r.status==='pending'));
 assert.equal((await block(a,b)).statusCode,200);
 assert.deepEqual((await status(a,b)).body,{blockedByMe:true,contactBlocked:true});
 assert.deepEqual((await status(b,a)).body,{blockedByMe:false,contactBlocked:true});
 for(const [who,target] of [[a,b],[b,a]]) {
   assert.equal((await send(who,target)).statusCode,403);
   assert.equal((await call(dms,'/dms/media',who,{recipientId:target,objectPath:'/objects/unused',mediaType:'image',contentType:'image/jpeg',width:10,height:10,idempotencyKey:randomUUID()})).statusCode,403);
   assert.equal((await call(packs,'/media-packs/:packId/send',who,{recipientId:target,idempotencyKey:randomUUID()},{packId:'1'})).statusCode,403);
   assert.equal((await call(coins,'/coins/spend',who,{uid:who,recipientUid:target,amount:1,idempotencyKey:randomUUID()})).statusCode,403);
   assert.equal((await call(invites,'/private-stream-invitations',who,{invitedUserId:target})).statusCode,403);
 }
 assert.equal((await call(dms,'/dms/:uid',a,{}, {uid:String(a)},'get')).body.messages.length,1);
 assert.equal((await report(a,b,{source:'dm',messageId})).statusCode,201);
 await block(b,a,false);assert.equal((await status(b,a)).body.contactBlocked,true);
 await block(b,a);await block(a,b,false);assert.equal((await status(a,b)).body.contactBlocked,true);
 await block(b,a,false);assert.equal((await status(a,b)).body.contactBlocked,false);
 assert.equal((await send(a,b)).statusCode,201);
 assert.equal((await send(c,a)).statusCode,201);
 console.log('PASS: report authorization, exact-message ownership, duplicate prevention, pending persistence, bidirectional blocking of text/media/packs/gifts/invitations, retained history, unblock ownership and restored contact.');
} finally {
 await pool.query('delete from user_reports where reported_uid=any($1)',[[a,b,c]]);
 await pool.query('delete from users where uid=any($1)',[[a,b,c]]);
 await pool.end();unlinkSync(output);
}

// Imported live routes own maintenance timers; all test resources are closed above.
process.exit(0);
