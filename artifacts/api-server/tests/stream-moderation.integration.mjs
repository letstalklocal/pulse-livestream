import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import { build } from 'esbuild';
const dir = fileURLToPath(new URL('..', import.meta.url));
const output = `${dir}/tests/.stream-moderation-test.cjs`;
await build({ stdin: { contents: `export { default as streams } from './src/routes/streams'; export { default as moderation } from './src/routes/moderation'; export { default as chat } from './src/routes/chat'; export { default as agora } from './src/routes/agora'; export { canAccessChannel } from './src/lib/privateChannelAccess'; export { pool } from '@workspace/db';`, resolveDir: dir }, outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['pg-native'], logLevel: 'silent' });
process.env.AGORA_APP_ID ||= '0'.repeat(32); process.env.AGORA_APP_CERTIFICATE ||= '1'.repeat(32);
const { streams, moderation, chat, agora, canAccessChannel, pool } = createRequire(import.meta.url)(output);
const base = 1850000000 + Math.floor(Math.random() * 10000000);
const [host, viewer, other] = [base, base + 1, base + 2];
const channel = `mod-test-${randomUUID()}`;
const future = `mod-future-${randomUUID()}`;
const call = async (router, method, path, uid, body = {}, channelId = channel) => {
  const handler = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack[0].handle;
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, set() { return this; } };
  await handler({ auth: () => ({ userId: uid ? `mod-test-${uid}` : null }), params: { channelId }, body, headers: {}, query: {}, log: { warn() {}, error() {} } }, res);
  return res;
};
const act = (action, uid = host, target = viewer) => call(moderation, 'post', '/streams/:channelId/moderation', uid, { action, viewerUid: target });
const token = (uid, id = channel) => call(agora, 'post', '/agora/token', uid, { channelName: id, uid: other, role: uid === host ? 'broadcaster' : 'audience' });
try {
  for (const uid of [host, viewer, other]) await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)', [uid, `mod-test-${uid}`, `Actual ${uid}`]);
  for (const id of [channel, future]) await pool.query("insert into live_stream_sessions(channel_id,host_user_id,host_name,title,category) values($1,$2,'Test','Test','Talk')", [id, host]);
  assert.equal((await act('mute', null)).statusCode, 401);
  assert.equal((await act('mute', other)).statusCode, 403);
  assert.equal((await act('mute', host, host)).statusCode, 400);
  assert.equal((await act('invalid')).statusCode, 400);
  assert.equal((await call(streams,'post','/streams/:channelId/presence',viewer,{action:'join'})).statusCode,200);
  await call(streams,'post','/streams/:channelId/presence',viewer,{action:'join'});
  assert.equal((await call(streams,'get','/streams/:channelId',host)).body.stream.viewerCount,1);
  const list=await call(moderation,'get','/streams/:channelId/moderation',host);
  assert.equal(list.body.users[0].uid,viewer); assert.equal(list.body.users[0].present,true);
  assert.equal((await call(moderation,'get','/streams/:channelId/moderation',other)).statusCode,403);
  const send=()=>call(chat,'post','/streams/:channelId/chat',viewer,{senderName:'Forged host',senderUid:host,text:'Hello',color:'#FF1966'});
  const message=await send(); assert.equal(message.statusCode,200); assert.equal(message.body.message.senderName,`Actual ${viewer}`); assert.equal(message.body.message.senderUid,viewer);
  assert.equal((await act('mute')).statusCode,200); assert.equal((await send()).statusCode,403);
  assert.equal((await token(viewer)).statusCode,200); // mute never removes video access
  assert.equal((await call(streams,'get','/streams/:channelId',viewer)).body.stream.viewerMuted,true);
  await act('unmute'); assert.equal((await send()).statusCode,200);
  await act('remove'); assert.equal((await token(viewer)).statusCode,403);
  assert.equal((await call(streams,'post','/streams/:channelId/presence',viewer,{action:'join'})).statusCode,403);
  assert.equal(await canAccessChannel(channel,`mod-test-${viewer}`),false);
  assert.equal((await send()).statusCode,404);
  assert.equal((await call(streams,'get','/streams/:channelId',host)).body.stream.viewerCount,0);
  const rotated=(await token(host)).body.channelName; assert.notEqual(rotated,channel);
  await act('remove'); assert.equal((await token(host)).body.channelName,rotated); // repeat doesn't disrupt room again
  assert.equal((await token(viewer,future)).statusCode,200); // removal is session-only
  await act('allow'); assert.equal((await token(viewer)).statusCode,200);
  await act('block'); assert.equal((await token(viewer)).statusCode,403); assert.equal((await token(viewer,future)).statusCode,403);
  const restricted=await call(moderation,'get','/streams/:channelId/moderation',host);
  assert.equal(restricted.body.users.find(person=>person.uid===viewer).blocked,true);
  await act('unblock'); assert.equal((await token(viewer)).statusCode,200); assert.equal((await token(viewer,future)).statusCode,200);
  const report=(uid,reason='harassment')=>call(moderation,'post','/streams/:channelId/reports',uid,{reason,details:'Test report',reporterUserId:other});
  assert.equal((await report(null)).statusCode,401); assert.equal((await report(host)).statusCode,400); assert.equal((await report(viewer,'invalid')).statusCode,400);
  assert.equal((await report(viewer)).statusCode,201); assert.equal((await report(viewer)).statusCode,201);
  const {rows}=await pool.query('select r.* from stream_reports r join live_stream_sessions s on s.id=r.session_id where s.channel_id=$1',[channel]);
  assert.equal(rows.length,1); assert.equal(rows[0].reporter_user_id,viewer); assert.equal(rows[0].status,'pending'); assert.equal(rows[0].details,'Test report');
  console.log('PASS: host authorization, roster, authenticated chat identity, mute/unmute, remove/re-entry denial, media revocation, allow-back, future-stream blocks, unblock, durable reports and duplicate prevention.');
} finally {
  await pool.query('delete from stream_reports where session_id in (select id from live_stream_sessions where channel_id=any($1))',[[channel,future]]);
  await pool.query('delete from live_stream_sessions where channel_id=any($1)',[[channel,future]]);
  await pool.query('delete from users where uid=any($1)',[[host,viewer,other]]);
  await pool.end(); unlinkSync(output);
}
process.exit(0);
