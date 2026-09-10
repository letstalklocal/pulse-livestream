import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import { build } from 'esbuild';
const dir = fileURLToPath(new URL('..', import.meta.url));
const output = `${dir}/tests/.translation-test.cjs`;
await build({ stdin: { contents: `export { default as translation } from './src/routes/translation'; export { default as chat } from './src/routes/chat'; export { pool } from '@workspace/db';`, resolveDir: dir }, outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['pg-native'], logLevel: 'silent' });
const { translation, chat, pool } = createRequire(import.meta.url)(output);
const base = 1800000000 + Math.floor(Math.random() * 10000000);
const [host, viewer, stranger] = [base, base + 1, base + 2];
const channel = `translation-test-${randomUUID()}`;
const savedFetch = globalThis.fetch;
const savedKey = process.env.GOOGLE_TRANSLATE_API_KEY;
const sent = [];
let responseMode = 'ok';
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://translation.googleapis.com/language/translate/v2');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers['X-Goog-Api-Key'], 'test-placeholder');
  const body = JSON.parse(options.body); sent.push(body);
  assert.deepEqual(Object.keys(body).sort(), ['format','q','target']);
  assert.equal(body.format, 'text');
  if (responseMode === 'error') return { ok: false };
  return { ok: true, json: async () => ({ data: { translations: [{ translatedText: 'Hola', detectedSourceLanguage: responseMode === 'same' ? 'es' : 'en' }] } }) };
};
const call = async (router, method, path, uid, body = {}) => {
  const handler = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack[0].handle;
  const res = { statusCode: 200, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, set(key,value) { this.headers[key]=value; return this; } };
  await handler({ auth: () => ({ userId: uid ? `translation-${uid}` : null }), params: { channelId: channel }, body, headers: {}, query: {} }, res);
  return res;
};
const translate = (uid, id, kind = 'dm', extras = {}) => call(translation,'post','/translation/messages',uid,{kind,messageId:String(id),channelId:channel,targetLanguage:'es',...extras});
let ids = [];
try {
  for (const uid of [host, viewer, stranger]) await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)',[uid,`translation-${uid}`,`Test ${uid}`]);
  const { rows: sessions } = await pool.query("insert into live_stream_sessions(channel_id,host_user_id,host_name,title,category) values($1,$2,'Test','Test','Talk') returning id",[channel,host]);
  const sessionId=sessions[0].id;
  for (const text of ['Hello','Same-language sample','Provider-failure sample']) {
    const {rows}=await pool.query('insert into direct_messages(from_user_id,to_user_id,text) values($1,$2,$3) returning id',[host,viewer,text]);ids.push(rows[0].id);
  }
  delete process.env.GOOGLE_TRANSLATE_API_KEY;
  assert.equal((await call(translation,'get','/translation/status',null)).statusCode,401);
  assert.equal((await call(translation,'get','/translation/status',viewer)).body.available,false);
  assert.equal((await translate(viewer,ids[0])).statusCode,503); assert.equal(sent.length,0);
  process.env.GOOGLE_TRANSLATE_API_KEY='test-placeholder';
  assert.equal((await translate(null,ids[0])).statusCode,401);
  assert.equal((await translate(stranger,ids[0])).statusCode,404);
  assert.equal((await translate(viewer,ids[0],'dm',{targetLanguage:'invalid'})).statusCode,400);
  assert.equal((await translate(viewer,'2147483648')).statusCode,404);
  const pair=await Promise.all([translate(viewer,ids[0]),translate(host,ids[0])]);
  assert.equal(sent.length,1); assert.equal(pair[0].body.text,'Hola'); assert.equal(pair[0].body.translated,true);
  assert.equal(pair[0].headers['Cache-Control'],'no-store');
  assert.equal((await translate(stranger,ids[0])).statusCode,404); assert.equal(sent.length,1); // cached data still requires authorization
  await translate(viewer,ids[0],'dm',{text:'attacker-supplied text'}); assert.equal(sent.length,1); assert.equal(sent[0].q,'Hello');
  const chatMessage=await call(chat,'post','/streams/:channelId/chat',host,{text:'Live hello',color:'#FF1966'});
  assert.equal(chatMessage.statusCode,200);
  const liveId=chatMessage.body.message.id;
  assert.equal((await translate(viewer,liveId,'live')).statusCode,200);
  await pool.query('insert into stream_moderation(session_id,viewer_user_id,removed) values($1,$2,true)',[sessionId,viewer]);
  assert.equal((await translate(viewer,liveId,'live')).statusCode,404);
  await pool.query('delete from stream_moderation where session_id=$1',[sessionId]);
  await pool.query('insert into creator_blocks(host_user_id,viewer_user_id) values($1,$2)',[host,viewer]);
  assert.equal((await translate(viewer,liveId,'live')).statusCode,404);
  await pool.query('delete from creator_blocks where host_user_id=$1',[host]);
  await pool.query("update live_stream_sessions set required_gift_id='rose' where id=$1",[sessionId]);
  assert.equal((await translate(viewer,liveId,'live')).statusCode,403);
  await pool.query('update live_stream_sessions set premium_free_viewer_ids=$2 where id=$1',[sessionId,JSON.stringify([viewer])]);
  assert.equal((await translate(viewer,liveId,'live')).statusCode,200);
  await pool.query('update live_stream_sessions set ended_at=now() where id=$1',[sessionId]);
  assert.equal((await translate(viewer,liveId,'live')).statusCode,404);
  responseMode='same'; const same=await translate(viewer,ids[1]); assert.equal(same.body.translated,false); assert.equal(same.body.text,'Same-language sample');
  responseMode='error'; assert.equal((await translate(viewer,ids[2])).statusCode,503);
  const stored=await pool.query('select text from direct_messages where id=$1',[ids[0]]);assert.equal(stored.rows[0].text,'Hello');
  let last; for(let i=0;i<125;i++) last=await translate(viewer,ids[0]); assert.equal(last.statusCode,429);
  console.log('PASS: no-key fallback, authentication, DM privacy, cached-access rechecks, trusted message text, HTTPS payload minimization, concurrent deduplication, restricted/Premium stream access, original preservation, same-language detection, provider failure and rate limiting.');
} finally {
  globalThis.fetch=savedFetch;
  if(savedKey===undefined) delete process.env.GOOGLE_TRANSLATE_API_KEY; else process.env.GOOGLE_TRANSLATE_API_KEY=savedKey;
  await pool.query('delete from direct_messages where id=any($1)',[ids]);
  await pool.query('delete from live_stream_sessions where channel_id=$1',[channel]);
  await pool.query('delete from users where uid=any($1)',[[host,viewer,stranger]]);
  await pool.end(); unlinkSync(output);
}
process.exit(0);
