import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync, unlinkSync } from "node:fs";
import { build } from "esbuild";
const dir = fileURLToPath(new URL("..", import.meta.url));
const output = `${dir}/tests/.moments-${randomUUID()}.cjs`;
await build({
  stdin: {
    contents: `export { default as moments } from './src/routes/moments'; export { pool } from '@workspace/db'; export * as ws from './src/lib/wsHub'; export * as liveChat from './src/lib/liveChat';`,
    resolveDir: dir,
  },
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["pg-native"],
  logLevel: "silent",
  plugins: [
    {
      name: "mock-storage",
      setup(build) {
        build.onResolve({ filter: /(^|\/)objectStorage$/ }, () => ({
          path: "storage",
          namespace: "test",
        }));
        build.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents: `export async function createPrivateUploadUrl(){return {objectPath:'/objects/test-'+Math.random()}}; export async function createPrivatePutUrl(path){return 'https://test/upload'}; export async function createPrivateGetUrl(path){return 'https://test/play?object='+path}; export async function privateObjectMetadata(){if(globalThis.__momentRender.fail) throw new Error('missing upload'); return {size:1024,contentType:'video/mp4'}}; export async function deletePrivateObject(path){globalThis.__momentRender.deleted.push(path)}`,
        }));
      },
    },
  ],
});
const originalFetch = globalThis.fetch;
globalThis.__momentRender = { calls: 0, fail: false, deleted: [] };
globalThis.fetch = async (url, options) =>
  String(url).startsWith("https://test/")
    ? new Response(options?.method === "PUT" ? "" : "raw video")
    : originalFetch(url, options);
const { moments, pool, ws, liveChat } = createRequire(import.meta.url)(output);
const prefix = `moments-test-${randomUUID()}`,
  ids = [];
const call = async (path, method, body = {}, userId = prefix, id = 0) => {
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await moments.stack
    .find((layer) => layer.route?.path === path && layer.route.methods[method])
    .route.stack[0].handle(
      {
        body,
        params: { id: String(id) },
        auth: () => ({ userId, tokenType: "session_token" }),
      },
      res,
    );
  return res;
};
try {
  await pool.query(
    readFileSync(
      new URL(
        "../../../lib/db/migrations/20260911_moments.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pool.query(
    readFileSync(
      new URL(
        "../../../lib/db/migrations/20260911_moment_gift_video.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pool.query(
    readFileSync(
      new URL(
        "../../../lib/db/migrations/20260911_moment_live_capture.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal((await call("/moments", "get", {}, null)).statusCode, 401);
  const first = 1820000000 + Math.floor(Math.random() * 10000000);
  for (let i = 0; i < 2; i++) {
    await pool.query("insert into users(uid,clerk_id,name) values($1,$2,$3)", [
      first + i,
      i === 0 ? prefix : prefix + "-other",
      "Moments test",
    ]);
    ids.push(first + i);
  }
  for (const [suffix, amount, type, channel] of [
    ["small", 499, "gift", "live"],
    ["valid", 500, "gift", "live"],
    ["pack", 1000, "gift", null],
    ["grant", 1000, "grant", "live"],
  ]) {
    await pool.query(
      "insert into coin_transactions(from_user_id,to_user_id,amount,type,channel_id,idempotency_key,description) values($1,$2,$3,$4,$5,$6,$7)",
      [ids[1], ids[0], amount, type, channel, prefix + suffix, prefix],
    );
  }
  for (const suffix of ["small", "pack", "grant"])
    assert.equal(
      (await call("/moments/uploads", "post", { giftId: prefix + suffix }))
        .statusCode,
      404,
    );
  assert.equal(
    (
      await call(
        "/moments/uploads",
        "post",
        { giftId: prefix + "valid" },
        prefix + "-other",
      )
    ).statusCode,
    404,
  );
  await pool.query(
    "update coin_transactions set gift_name='Crown' where idempotency_key=$1",
    [prefix + "valid"],
  );
  const acknowledgements = [];
  const liveSocket = {
    readyState: 1,
    send: (data) => acknowledgements.push(JSON.parse(data)),
  };
  ws.subscribe("live", liveSocket);
  assert.equal(
    (
      await call(
        "/moments/live-gift",
        "post",
        { giftId: prefix + "valid" },
        null,
      )
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await call(
        "/moments/live-gift",
        "post",
        { giftId: prefix + "valid" },
        prefix + "-other",
      )
    ).statusCode,
    404,
  );
  assert.equal(
    (await call("/moments/live-gift", "post", { giftId: prefix + "small" }))
      .statusCode,
    404,
  );
  assert.equal(
    (await call("/moments/live-gift", "post", { giftId: prefix + "valid" }))
      .statusCode,
    200,
  );
  assert.equal(acknowledgements[0].type, "gift_in_video");
  assert.equal(acknowledgements[0].giftId, prefix + "valid");
  assert.equal(acknowledgements[0].inVideo, true);
  assert.equal(
    (
      await call("/moments/live-gift", "post", {
        giftId: prefix + "valid",
        inVideo: false,
      })
    ).statusCode,
    200,
  );
  assert.equal(acknowledgements.at(-1).inVideo, false);
  assert.equal(
    (
      await call("/moments/live-gift", "post", {
        giftId: prefix + "valid",
        inVideo: "invalid",
      })
    ).statusCode,
    400,
  );
  ws.unsubscribe("live", liveSocket);
  const created = await call("/moments/uploads", "post", {
    giftId: prefix + "valid",
  });
  assert.equal(created.statusCode, 200);
  const id = created.body.id;
  assert.equal(
    (await call("/moments/uploads", "post", { giftId: prefix + "valid" })).body
      .id,
    id,
  );
  assert.equal(
    (await call("/moments/:id/play", "get", {}, prefix, id)).statusCode,
    404,
  );
  assert.equal(
    (
      await call(
        "/moments/:id/complete",
        "post",
        { durationMs: 7000 },
        prefix + "-other",
        id,
      )
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await call(
        "/moments/:id/complete",
        "post",
        { durationMs: 10001 },
        prefix,
        id,
      )
    ).statusCode,
    400,
  );
  globalThis.__momentRender.fail = true;
  assert.equal(
    (
      await call(
        "/moments/:id/complete",
        "post",
        { durationMs: 7000 },
        prefix,
        id,
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (await call("/moments", "get")).body.moments[0].status,
    "uploading",
  );
  globalThis.__momentRender.fail = false;
  const completed = await Promise.all([
    call(
      "/moments/:id/complete",
      "post",
      { durationMs: 7000, captureMode: "live-gift-v1" },
      prefix,
      id,
    ),
    call(
      "/moments/:id/complete",
      "post",
      { durationMs: 7000, captureMode: "live-gift-v1" },
      prefix,
      id,
    ),
  ]);
  assert.ok(completed.every((r) => r.statusCode === 200));
  assert.equal(
    globalThis.__momentRender.calls,
    0,
    "recorded files must never be encoded on the server",
  );
  const stored = (
    await pool.query(
      "select object_path,embedded_object_path,capture_mode from moments where id=$1",
      [id],
    )
  ).rows[0];
  assert.equal(stored.embedded_object_path, null);
  assert.equal(stored.capture_mode, "live-gift-v1");
  assert.equal(
    (await call("/moments/:id/play", "get", {}, prefix, id)).body.url,
    "https://test/play?object=" + stored.object_path,
  );
  assert.equal(
    (
      await call(
        "/moments/:id/complete",
        "post",
        { durationMs: 7000 },
        prefix,
        id,
      )
    ).statusCode,
    200,
  );
  assert.equal(
    globalThis.__momentRender.calls,
    0,
    "playback and retries must not encode video",
  );
  assert.equal(
    (await call("/moments/:id/play", "get", {}, prefix, id)).statusCode,
    200,
  );
  assert.equal(
    (await call("/moments/:id/play", "get", {}, prefix + "-other", id))
      .statusCode,
    404,
  );
  assert.equal(
    (await call("/moments", "get", {}, prefix + "-other")).body.moments.length,
    0,
  );
  assert.equal((await call("/moments", "get")).body.moments[0].amount, 500);
  assert.equal(
    (await call("/moments/:id", "delete", {}, prefix + "-other", id))
      .statusCode,
    404,
  );
  assert.equal(
    (await call("/moments/:id", "delete", {}, prefix, id)).statusCode,
    200,
  );
  assert.deepEqual(globalThis.__momentRender.deleted, [
    stored.object_path,
    stored.object_path + ".gift-v1.mp4",
  ]);
  assert.equal(
    (await call("/moments/uploads", "post", { giftId: prefix + "valid" }))
      .statusCode,
    410,
  );
  const events = [];
  const socket = {
    readyState: 1,
    send: (data) => events.push(JSON.parse(data)),
  };
  ws.subscribe("test-channel", socket);
  const details = {
    giftId: "unique-gift",
    amount: 500,
    senderUid: ids[1],
    recipientUid: ids[0],
  };
  ws.pushGift("test-channel", "Gift", "Sender", 12345, details);
  ws.pushPartyGift("test-channel", "Gift", "Sender", details);
  ws.pushGift("test-channel", "Gift", "Sender", 99999, details);
  const giftMessage = liveChat.getChatMessage(
    "test-channel",
    "gift:unique-gift",
  );
  assert.equal(giftMessage.text, "sent 🪙 500 coins · Gift");
  assert.equal(
    liveChat.chatStore.get("test-channel").length,
    1,
    "duplicate notifications must not duplicate gift chat",
  );
  liveChat.deletedMessages.set("test-channel", [giftMessage.id]);
  liveChat.chatStore.set("test-channel", []);
  ws.pushGift("test-channel", "Gift", "Sender", 99999, details);
  assert.equal(
    liveChat.chatStore.get("test-channel").length,
    0,
    "removed gift notices must stay removed",
  );
  liveChat.clearChat("test-channel");
  ws.unsubscribe("test-channel", socket);
  assert.equal(events[0].coins, 12345);
  assert.equal(events[0].amount, 500);
  assert.equal(events[1].recipientUid, ids[0]);
  assert.equal(events[1].giftId, "unique-gift");
  console.log(
    "PASS: 500 threshold, recipient ownership, gift type, idempotent upload, private playback, completion validation, deletion, and exact gift metadata in normal/party events. Upload retry, concurrent completion and unchanged-file playback passed. Storage/encoding were mocked; device capture and actual upload require separate verification.",
  );
} finally {
  if (ids.length) {
    await pool.query("delete from moments where owner_user_id=any($1::int[])", [
      ids,
    ]);
    await pool.query("delete from coin_transactions where description=$1", [
      prefix,
    ]);
    await pool.query("delete from users where uid=any($1::int[])", [ids]);
  }
  await pool.end();
  unlinkSync(output);
  globalThis.fetch = originalFetch;
  delete globalThis.__momentRender;
}
