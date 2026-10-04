import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const dir = fileURLToPath(new URL('..', import.meta.url));
const output = `${dir}/tests/.live-pause-${randomUUID()}.cjs`;
await build({ stdin: { contents: `export {default as streams,getActiveRuntimeStream} from './src/routes/streams';export {pool} from '@workspace/db';`, resolveDir: dir }, outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['pg-native'], logLevel: 'silent' });
const { streams, getActiveRuntimeStream, pool } = createRequire(import.meta.url)(output);
const host = 1900000000 + Math.floor(Math.random() * 1000000), viewer = host + 1;
const prefix = `pause-test-${randomUUID()}`, channel = `private-${prefix}`;
async function call(method, path, uid, body = {}, id = channel) {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  const handle = streams.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack[0].handle;
  await handle({ auth: () => ({ userId: uid ? `${prefix}-${uid}` : null }), params: { channelId: id }, body, log: { error() {}, warn() {} } }, res);
  return res;
}
let failed;
try {
  for (const uid of [host, viewer]) await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)', [uid, `${prefix}-${uid}`, 'Pause test']);
  // Keep synthetic fixtures out of Discovery throughout the test.
  await pool.query("insert into live_stream_sessions(channel_id,host_user_id,host_name,title,category,is_private) values($1,$2,'Pause test','Pause test','Talk',true)", [channel, host]);
  await pool.query("insert into private_stream_invitations(streamer_user_id,invited_user_id,channel_id,title,background_object_path,status,expires_at) values($1,$2,$3,'Pause test','fixture','active',now()+interval '1 hour')", [host, viewer, channel]);
  const pause = (uid, paused) => call('put', '/streams/:channelId/pause', uid, { paused });
  assert.equal((await pause(null, true)).statusCode, 401);
  assert.equal((await pause(viewer, true)).statusCode, 403);
  assert.equal((await pause(host, 'true')).statusCode, 400);
  assert.equal((await call('put', '/streams/:channelId/pause', host, { paused: true }, 'missing')).statusCode, 404);
  const before = (await pool.query('select id,started_at,last_heartbeat_at from live_stream_sessions where channel_id=$1', [channel])).rows[0];
  assert.equal((await pause(host, true)).body.paused, true);
  assert.equal((await pause(host, true)).body.paused, true, 'Pause retry is idempotent');
  assert.equal((await call('get', '/streams/:channelId', viewer)).body.stream.paused, true, 'Late viewer reads the paused state');
  const runtime = await getActiveRuntimeStream(channel);
  // Test the durable rehydration path (used by Premium/restart) while staying private.
  runtime.requiredGift = { id: 'heart', name: 'Heart', emoji: '❤️', coinCost: 5 };
  assert.equal((await getActiveRuntimeStream(channel)).paused, true);
  const during = (await pool.query('select id,started_at,last_heartbeat_at,ended_at,paused from live_stream_sessions where channel_id=$1', [channel])).rows[0];
  assert.equal(during.id, before.id); assert.equal(+during.started_at, +before.started_at); assert.equal(during.ended_at, null);
  assert.equal(+during.last_heartbeat_at, +before.last_heartbeat_at, 'Pause does not fabricate host heartbeats');
  assert.equal((await call('post', '/streams/:channelId/heartbeat', host)).statusCode, 200, 'Paused host heartbeat continues');
  assert.equal((await pause(host, false)).body.paused, false);
  assert.equal((await call('get', '/streams/:channelId', viewer)).body.stream.paused, false);
  await pool.query('update live_stream_sessions set ended_at=now() where channel_id=$1', [channel]);
  assert.equal((await pause(host, false)).statusCode, 409, 'Pause cannot revive an ended session');
  console.log('PASS: live pause host authorization, boolean validation, missing/ended denial, idempotent retries, durable viewer/reload state, private access, preserved session and ongoing heartbeats. No coin or withdrawal fixtures.');
} catch (error) { failed = error; }
finally {
  await pool.query('delete from private_stream_invitations where channel_id=$1', [channel]);
  await pool.query('delete from live_stream_sessions where channel_id=$1', [channel]);
  await pool.query('delete from users where uid=any($1)', [[host, viewer]]);
  await pool.end(); unlinkSync(output);
}
if (failed) { console.error(failed); process.exit(1); }
process.exit(0);
