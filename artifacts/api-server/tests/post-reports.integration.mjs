import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import { build } from 'esbuild';
const dir=fileURLToPath(new URL('..',import.meta.url));
const output=`${dir}/tests/.post-report-test.cjs`;
await build({stdin:{contents:`export { default as posts } from './src/routes/posts'; export { pool } from '@workspace/db';`,resolveDir:dir},outfile:output,bundle:true,platform:'node',format:'cjs',external:['pg-native'],logLevel:'silent'});
const {posts,pool}=createRequire(import.meta.url)(output);
const base=1750000000+Math.floor(Math.random()*10000000);
const [owner,reporter]=[base,base+1];
const prefix=randomUUID();
let postId;
const call=async(uid,id=postId,body={reason:'sexual_content',details:' Test report '})=>{
 const handler=posts.stack.find(layer=>layer.route?.path==='/posts/:postId/reports').route.stack[0].handle;
 const res={statusCode:200,body:null,status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}};
 await handler({auth:()=>({userId:uid?`${prefix}-${uid}`:null}),params:{postId:String(id)},body},res);
 return res;
};
try {
 for(const uid of [owner,reporter])await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)',[uid,`${prefix}-${uid}`,'Photo test']);
 const {rows}=await pool.query("insert into posts(owner_user_id,image_object_path,caption) values($1,'/objects/report-test-unused','Test') returning id",[owner]);postId=rows[0].id;
 assert.equal((await call(null)).statusCode,401);
 assert.equal((await call(owner)).statusCode,400);
 assert.equal((await call(reporter,'invalid')).statusCode,400);
 assert.equal((await call(reporter,postId,{reason:'bad'})).statusCode,400);
 assert.equal((await call(reporter,postId,{reason:'spam',details:'x'.repeat(2001)})).statusCode,400);
 const attempts=await Promise.all([call(reporter),call(reporter)]);
 assert.ok(attempts.every(result=>result.statusCode===201));
 await call(reporter,postId,{reason:'spam',reporterUserId:owner,ownerUserId:reporter});
 const reports=await pool.query('select * from post_reports where reported_post_id=$1',[postId]);
 assert.equal(reports.rows.length,1);
 assert.equal(reports.rows[0].reporter_user_id,reporter);
 assert.equal(reports.rows[0].owner_user_id,owner);
 assert.equal(reports.rows[0].reason,'sexual_content');
 assert.equal(reports.rows[0].details,'Test report');
 assert.equal(reports.rows[0].status,'pending');
 await pool.query('delete from posts where id=$1',[postId]);
 const retained=await pool.query('select * from post_reports where reported_post_id=$1',[postId]);
 assert.equal(retained.rows.length,1);assert.equal(retained.rows[0].post_id,null);
 assert.equal((await call(reporter)).statusCode,404);
 console.log('PASS: authenticated photo reporting, owner rejection, input validation, concurrent duplicate prevention, trusted identities, pending review state, deleted-photo handling and retained report history.');
} finally {
 if(postId){await pool.query('delete from post_reports where reported_post_id=$1',[postId]);await pool.query('delete from posts where id=$1',[postId]);}
 await pool.query('delete from users where uid=any($1)',[[owner,reporter]]);
 await pool.end();unlinkSync(output);
}
