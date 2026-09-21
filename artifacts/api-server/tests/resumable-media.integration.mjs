import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {unlinkSync} from 'node:fs';
import {build} from 'esbuild';
const dir=fileURLToPath(new URL('..',import.meta.url)),output=`${dir}/tests/.resume-${randomUUID()}.cjs`;
await build({stdin:{contents:"export {default as router} from './src/routes/media-packs'; export {pool} from '@workspace/db'; export {deletePrivateObject,privateObjectMetadata} from './src/lib/objectStorage';",resolveDir:dir},outfile:output,bundle:true,platform:'node',format:'cjs',external:['pg-native'],logLevel:'silent'});
const {router,pool,deletePrivateObject,privateObjectMetadata}=createRequire(import.meta.url)(output);
const clerkId=`resume-test-${randomUUID()}`,uid=1870000000+Math.floor(Math.random()*1000000);let objectPath;
const call=async(auth,body)=>{const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};await router.stack.find(l=>l.route?.path==='/media-packs/uploads').route.stack[0].handle({auth:()=>({userId:auth}),body},res);return res;};
try{
 await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)',[uid,clerkId,'Upload test']);
 assert.equal((await call(null,{contentType:'video/mp4',resumable:true})).statusCode,401);
 assert.equal((await call(clerkId,{contentType:'application/javascript',resumable:true})).statusCode,400);
 const legacy=await call(clerkId,{contentType:'image/jpeg'});assert.equal(legacy.statusCode,201);assert.ok(legacy.body.uploadUrl);assert.ok(legacy.body.objectPath.startsWith('/objects/'));
 const response=await call(clerkId,{contentType:'video/mp4',resumable:true});assert.equal(response.statusCode,201);objectPath=response.body.objectPath;
 const bytes=new Uint8Array(262145);bytes.fill(41);
 const request=(range,body)=>fetch(response.body.uploadUrl,{method:'PUT',headers:{'Content-Range':range},body,signal:AbortSignal.timeout(15000)});
 let r=await request(`bytes 0-262143/${bytes.length}`,bytes.slice(0,262144));assert.equal(r.status,308);
 r=await request(`bytes */${bytes.length}`,new Uint8Array(0));assert.equal(r.status,308);assert.equal(r.headers.get('range'),'bytes=0-262143');
 r=await request(`bytes 262144-262144/${bytes.length}`,bytes.slice(262144));assert.ok([200,201].includes(r.status));
 const metadata=await privateObjectMetadata(objectPath);assert.equal(Number(metadata.size),bytes.length);assert.equal(metadata.contentType,'video/mp4');
 console.log('PASS: authenticated upload route, unauthenticated/invalid MIME rejection, legacy compatibility and real private-storage resume/completion. Temporary account/object only; no phone media used.');
}finally{if(objectPath)await deletePrivateObject(objectPath);await pool.query('delete from users where uid=$1',[uid]);await pool.end();unlinkSync(output);}
