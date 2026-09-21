import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
const dir=fileURLToPath(new URL('..',import.meta.url)),output=`${dir}/tests/.dm-duration-${randomUUID()}.cjs`;
await build({stdin:{contents:"export {default as router} from './src/routes/direct-messages'; export {pool} from '@workspace/db';",resolveDir:dir},outfile:output,bundle:true,platform:'node',format:'cjs',external:['pg-native'],logLevel:'silent'});
const {router,pool}=createRequire(import.meta.url)(output),uid=1888000000+Math.floor(Math.random()*10000)*2,peer=uid+1,clerkId=`dm-duration-${randomUUID()}`;
const handler=router.stack.find(l=>l.route?.path==='/dms/media'&&l.route.methods.post).route.stack[0].handle;
const call=async(body,auth=clerkId)=>{const res={statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};await handler({auth:()=>({userId:auth}),body},res);return res;};
const input={recipientId:peer,objectPath:'/objects/dm-duration-test',mediaType:'video',contentType:'video/quicktime',width:720,height:1280,durationMs:1234.567,price:5,idempotencyKey:randomUUID()};
try{
 for(const [id,clerk] of [[uid,clerkId],[peer,`${clerkId}-peer`]])await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)',[id,clerk,'DM duration test']);
 assert.equal((await call(input,null)).statusCode,401);
 assert.equal((await call(input)).body.code,'CHAT_GIFT_REQUIRED','duration normalization does not bypass chat access');
 await pool.query('insert into follows(follower_id,followed_id) values($1,$2)',[peer,uid]);
 const created=await call(input);assert.equal(created.statusCode,201);
 const retry=await call(input);assert.equal(retry.statusCode,200);assert.equal(retry.body.message.id,created.body.message.id);
 assert.equal((await call({...input,durationMs:1235})).statusCode,200,'rounded retry is the same message');
 assert.equal((await call({...input,durationMs:1236})).statusCode,409,'different duration cannot reuse key');
 const stored=await pool.query('select media_duration_ms,media_price from direct_messages where from_user_id=$1',[uid]);assert.equal(stored.rows.length,1);assert.equal(stored.rows[0].media_duration_ms,1235);assert.equal(stored.rows[0].media_price,5);
 for(const bad of [-0.1,'1234',Infinity,NaN,2147483648])assert.equal((await call({...input,durationMs:bad,idempotencyKey:randomUUID()})).statusCode,400);
 assert.equal((await call({...input,contentType:'image/jpeg',idempotencyKey:randomUUID()})).statusCode,400,'MIME validation remains');
 for(const durationMs of [undefined,null])assert.equal((await call({...input,mediaType:'image',contentType:'image/jpeg',durationMs,price:0,idempotencyKey:randomUUID()})).statusCode,201);
 console.log('PASS: fractional iOS DM duration persists rounded once, paid price preserved, retries deduplicated, conflicts/invalid metadata rejected, photos/auth/chat access preserved.');
}finally{await pool.query('delete from direct_messages where from_user_id=any($1::int[]) or to_user_id=any($1::int[])',[[uid,peer]]);await pool.query('delete from follows where follower_id=any($1::int[]) or followed_id=any($1::int[])',[[uid,peer]]);await pool.query('delete from users where uid=any($1::int[])',[[uid,peer]]);await pool.end();unlinkSync(output);}

// Imported stream modules start maintenance timers; fixtures and pool are already closed.
process.exit(0);
