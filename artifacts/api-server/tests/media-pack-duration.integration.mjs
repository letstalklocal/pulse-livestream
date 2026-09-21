import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
const dir=fileURLToPath(new URL('..',import.meta.url)),output=`${dir}/tests/.duration-${randomUUID()}.cjs`;
await build({stdin:{contents:"export {default as router} from './src/routes/media-packs'; export {pool} from '@workspace/db';",resolveDir:dir},outfile:output,bundle:true,platform:'node',format:'cjs',external:['pg-native'],logLevel:'silent'});
const {router,pool}=createRequire(import.meta.url)(output),uid=1889000000+Math.floor(Math.random()*10000),clerkId=`duration-${randomUUID()}`;
const item=durationMs=>({objectPath:'/objects/duration-test',contentType:'video/quicktime',width:720,height:1280,durationMs});
const call=async(path,method,body,params={})=>{const res={statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};await router.stack.find(l=>l.route?.path===path&&l.route.methods[method]).route.stack[0].handle({auth:()=>({userId:clerkId}),body,params},res);return res;};
try{
 await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)',[uid,clerkId,'Duration test']);
 const created=await call('/media-packs','post',{name:'Video',giftId:'rose',items:[item(1234.567)]});assert.equal(created.statusCode,201);const id=created.body.pack.id;
 let stored=await pool.query('select duration_ms from media_pack_items where pack_id=$1',[id]);assert.equal(stored.rows[0].duration_ms,1235);
 const edited=await call('/media-packs/:packId','put',{giftId:'heart',items:[item(9000.125)]},{packId:id});assert.equal(edited.statusCode,200);
 stored=await pool.query('select duration_ms from media_pack_items where pack_id=$1',[id]);assert.equal(stored.rows[0].duration_ms,9000);
 for(const bad of [-1,'1234',Infinity,NaN,2147483648]) {
  assert.equal((await call('/media-packs','post',{name:'Bad',giftId:'rose',items:[item(bad)]})).statusCode,400);
  assert.equal((await call('/media-packs/:packId','put',{giftId:'rose',items:[item(bad)]},{packId:id})).statusCode,400);
 }
 const rows=await pool.query('select count(*)::int as n from media_packs where owner_user_id=$1',[uid]);assert.equal(rows.rows[0].n,1,'invalid metadata cannot create partial packs');
 let status,body,log;const errorHandler=router.stack.find(l=>!l.route&&l.handle.length===4).handle;
 errorHandler({cause:{code:'22P02',message:'sensitive SQL'}},{method:'POST',route:{path:'/media-packs'},log:{error:(details)=>log=details}},{status:n=>{status=n;return{json:value=>body=value};}},()=>{throw Error('unexpected next');});
 assert.equal(status,500);assert.equal(body.code,'MEDIA_PACK_REQUEST_FAILED');assert.equal(log.code,'22P02');assert.ok(!JSON.stringify(body).includes('sensitive'));assert.ok(!JSON.stringify(log).includes('sensitive'));
 console.log('PASS: real database creation/edit with fractional iOS duration, integer storage, invalid values rejected without partial packs, clean JSON error and safe diagnostics.');
}finally{await pool.query('delete from users where uid=$1',[uid]);await pool.end();unlinkSync(output);}
