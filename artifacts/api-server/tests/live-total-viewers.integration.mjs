import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const dir = fileURLToPath(new URL("..", import.meta.url));
const output = `${dir}/tests/.live-viewers-${randomUUID()}.cjs`;
await build({
  stdin: { contents: "export { default as streams, getRuntimeStream } from './src/routes/streams'; export { pool } from '@workspace/db';", resolveDir: dir },
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["pg-native"],
  logLevel: "silent",
});
const { streams, getRuntimeStream, pool } = createRequire(import.meta.url)(output);
unlinkSync(output);

const prefix = `total-viewers-${randomUUID()}`;
const host = 1820000000 + Math.floor(Math.random() * 1000000);
const first = host + 1;
const second = host + 2;
const third = host + 3;
const channelId = `${prefix}-live`;

async function call(method, path, uid, body = {}) {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await streams.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack[0].handle({
    auth: () => ({ userId: uid ? `${prefix}-${uid}` : null }),
    params: { channelId }, body, log: { warn() {}, error() {} },
  }, res);
  return res;
}
const presence = (uid, action) => call("post", "/streams/:channelId/presence", uid, { action });
const total = async () => Number((await pool.query("select total_viewers from live_stream_sessions where channel_id=$1", [channelId])).rows[0].total_viewers);

try {
  for (const uid of [host, first, second, third]) {
    await pool.query("insert into users(uid,clerk_id,name) values($1,$2,$3)", [uid, `${prefix}-${uid}`, `Viewer ${uid}`]);
  }
  await pool.query("insert into live_stream_sessions(channel_id,host_user_id,host_name,title,category) values($1,$2,'Host','Live','Talk')", [channelId, host]);
  assert.equal((await presence(null, "join")).statusCode, 401);
  assert.equal((await presence(host, "join")).statusCode, 400, "Host is excluded from audience totals");
  assert.equal((await presence(first, "join")).statusCode, 200);
  assert.equal((await presence(first, "join")).statusCode, 200, "Heartbeat succeeds");
  assert.equal(await total(), 1, "Heartbeat counts once");
  await presence(first, "leave");
  await presence(first, "join");
  assert.equal(await total(), 1, "Returning account still counts once");
  await Promise.all([presence(second, "join"), presence(second, "join")]);
  assert.equal(await total(), 2, "Concurrent joins count the second account once");
  await presence(first, "leave");
  const detail = await call("get", "/streams/:channelId", first);
  assert.equal(detail.body.stream.totalViewers, 2, "Stream detail includes durable total");
  assert.equal(detail.body.stream.viewerCount, 1, "Watching now remains separate");

  await pool.query("update live_stream_sessions set required_gift_id='rose',required_gift_name='Rose',required_gift_emoji='🌹',required_gift_coin_cost=1 where channel_id=$1", [channelId]);
  getRuntimeStream(channelId).requiredGift = { id: "rose", name: "Rose", emoji: "🌹", coinCost: 1 };
  assert.equal((await presence(third, "join")).statusCode, 403, "Unadmitted Premium viewer cannot inflate total");
  assert.equal(await total(), 2);
  await pool.query("update live_stream_sessions set premium_free_viewer_ids=$1 where channel_id=$2", [JSON.stringify([third]), channelId]);
  assert.equal((await presence(third, "join")).statusCode, 200);
  assert.equal(await total(), 3);
  console.log("PASS: total viewers counts each admitted account once, persists across leaves, and stays separate from current presence.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    await pool.query("delete from live_stream_sessions where channel_id=$1", [channelId]);
    await pool.query("delete from users where uid=any($1::int[])", [[host, first, second, third]]);
    await pool.end();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0); // streams.ts has a maintenance interval.
}
