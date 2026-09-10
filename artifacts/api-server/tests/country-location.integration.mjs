import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, unlinkSync } from 'node:fs';
import { build } from 'esbuild';
const dir=fileURLToPath(new URL('..',import.meta.url));
const output=`${dir}/tests/.country-${randomUUID()}.cjs`;
await build({stdin:{contents:`export { visitorIp, lookupCountry } from './src/lib/countryLocation'; export { default as location } from './src/routes/country-location'; export { default as users } from './src/routes/users'; export { default as privacy } from './src/routes/privacy'; export { pool } from '@workspace/db';`,resolveDir:dir},outfile:output,bundle:true,platform:'node',format:'cjs',external:['pg-native','ip-location-api'],logLevel:'silent'});
const {visitorIp,lookupCountry,location,users,privacy,pool}=createRequire(import.meta.url)(output);
const uid=1870000000+Math.floor(Math.random()*1000000),prefix=`country-test-${randomUUID()}`;
const req=(ip,forwarded)=>({socket:{remoteAddress:ip},headers:forwarded?{'x-forwarded-for':forwarded}:{}});
const call=async(router,path,method,signedIn=true,body={},request=req('127.0.0.1','8.8.8.8'))=>{
 const res={statusCode:200,set(){return this;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};
 await router.stack.find(l=>l.route?.path===path&&l.route.methods[method]).route.stack[0].handle({...request,params:{uid:String(uid)},body,auth:()=>({userId:signedIn?prefix:null,tokenType:'session_token'})},res);return res;
};
try{
 await pool.query(readFileSync(new URL('../../../lib/db/migrations/20260910_country_location.sql',import.meta.url),'utf8'));
 await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)',[uid,prefix,'Country test']);
 assert.equal(visitorIp(req('8.8.8.8','1.1.1.1')),'8.8.8.8'); // Direct public connections cannot forge a forwarded IP.
 assert.equal(visitorIp(req('127.0.0.1','1.1.1.1, 8.8.8.8')),'8.8.8.8'); // Stop at first untrusted hop, from the right.
 assert.equal(visitorIp(req('127.0.0.1','8.8.8.8, 10.0.0.2')),'8.8.8.8');
 assert.equal(visitorIp(req('127.0.0.1')),null);
 assert.equal(visitorIp(req('127.0.0.1','garbage')),null);
 assert.equal(visitorIp(req('127.0.0.1','192.168.1.10')),null);
 assert.equal(visitorIp(req('::ffff:8.8.8.8')),'::ffff:8.8.8.8');
 assert.equal((await call(location,'/location/country','post',false)).statusCode,401);
 assert.equal(await lookupCountry('10.0.0.1'),null);
 console.log('Loading local country database…');
 assert.equal(await lookupCountry('8.8.8.8'),'US');
 assert.equal(await lookupCountry('2001:4860:4860::8888'),'US');
 const updated=await call(location,'/location/country','post',true,{countryCode:'GB',uid:1});
 assert.deepEqual(updated.body,{countryCode:'US',country:'United States'});
 assert.equal((await pool.query('select country_code from users where uid=$1',[uid])).rows[0].country_code,'US');
 const unknown=await call(location,'/location/country','post',true,{},req('127.0.0.1'));
 assert.equal(unknown.body.countryCode,'US');
 const profile=await call(users,'/users/:uid','get');assert.equal(profile.body.user.country,'United States');
 await call(privacy,'/privacy/preferences','patch',true,{hideLocation:true});
 const hidden=await call(users,'/users/:uid','get');assert.equal(hidden.body.user.country,undefined);assert.equal(hidden.body.user.countryCode,undefined);
 assert.equal((await call(location,'/location/country','post')).body.countryCode,'US'); // Owner can retrieve their own detected country.
 console.log('PASS: trusted proxy selection, spoof rejection, IPv4/IPv6 lookup, authenticated country persistence, unknown-IP retention, body isolation, and Hide Location redaction.');
}finally{
 await pool.query('delete from users where uid=$1',[uid]);await pool.end();unlinkSync(output);
}
process.exit(0);
