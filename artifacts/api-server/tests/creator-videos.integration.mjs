import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync, unlinkSync } from "node:fs";
import { build } from "esbuild";
const dir = fileURLToPath(new URL("..", import.meta.url)),
  output = `${dir}/tests/.creator-videos-${randomUUID()}.cjs`;
await build({
  stdin: {
    contents: `export { default as router, disableVideoBeforeLive } from './src/routes/creator-videos'; export { pool, db } from '@workspace/db';`,
    resolveDir: dir,
  },
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["pg-native"],
  logLevel: "silent",
});
const { router, pool, db, disableVideoBeforeLive } = createRequire(
  import.meta.url,
)(output);
const prefix = `video-test-${randomUUID()}`,
  a = 1860000000 + Math.floor(Math.random() * 1000000),
  b = a + 1,
  c = a + 2;
let remote = {
  guid: randomUUID(),
  status: 4,
  encodeProgress: 100,
  width: 720,
  height: 1280,
  hasMP4Fallback: true,
  availableResolutions: "480p,720p,240p,360p",
  length: 4,
  thumbnailFileName: "thumbnail.jpg",
};
const previousFetch = global.fetch;
const env = Object.fromEntries(
  [
    "BUNNY_STREAM_LIBRARY_ID",
    "BUNNY_STREAM_API_KEY",
    "BUNNY_STREAM_HOSTNAME",
  ].map((k) => [k, process.env[k]]),
);
const deletedProviderIds = [];
let deleteStatus = 204;
global.fetch = async (url, init) => {
  if (init?.method === "DELETE") {
    deletedProviderIds.push(String(url).split("/").at(-1));
    return new Response(null, { status: deleteStatus });
  }
  return init?.method === "HEAD"
    ? new Response(null, {
        status: 200,
        headers: { "content-length": "10000" },
      })
    : Response.json(remote);
};
async function call(method, path, uid, body = {}, params = {}, expectedError = false) {
  const res = {
    statusCode: 200,
    headersSent: false,
    set() {
      return this;
    },
    status(n) {
      this.statusCode = n;
      return this;
    },
    json(body) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
  };
  const route = router.stack.find(
    (l) => l.route?.path === path && l.route.methods[method],
  );
  assert.ok(route, path);
  await route.route.stack[0].handle(
    {
      auth: () => ({ userId: uid ? `${prefix}-${uid}` : null }),
      params,
      body,
      log: {
        error: (e) => {
          if (!expectedError) throw e.err;
        },
      },
    },
    res,
  );
  return res;
}
try {
  await pool.query(
    readFileSync(
      new URL(
        "../../../lib/db/migrations/20260918_creator_videos.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const uid of [a, b, c])
    await pool.query("insert into users(uid,clerk_id,name)values($1,$2,$3)", [
      uid,
      `${prefix}-${uid}`,
      "Video test",
    ]);
  for (const [method, path] of [
    ["get", "/creator-videos/library"],
    ["get", "/creator-videos/:id/viewers"],
    ["post", "/creator-videos/uploads"],
    ["put", "/creator-videos/visibility"],
    ["delete", "/creator-videos/:id"],
  ])
    assert.equal((await call(method, path, null)).statusCode, 401);
  delete process.env.BUNNY_STREAM_API_KEY;
  assert.equal(
    (await call("get", "/creator-videos/library", a)).body.uploadsConfigured,
    false,
  );
  assert.equal(
    (
      await call("post", "/creator-videos/uploads", a, {
        filename: "clip.mp4",
        bytes: 100,
      })
    ).statusCode,
    503,
  );
  process.env.BUNNY_STREAM_LIBRARY_ID = "123";
  process.env.BUNNY_STREAM_API_KEY = "fake-test-key";
  process.env.BUNNY_STREAM_HOSTNAME = "test.b-cdn.net";
  const upload = await call("post", "/creator-videos/uploads", a, {
    filename: "first.mp4",
    bytes: 100,
  });
  assert.equal(upload.statusCode, 201);
  assert.ok(upload.body.headers.AuthorizationSignature);
  assert.ok(!JSON.stringify(upload.body).includes("fake-test-key"));
  const id = upload.body.id;
  assert.equal(
    (await call("post", "/creator-videos/:id/refresh", b, {}, { id }))
      .statusCode,
    404,
  );
  assert.equal(
    (await call("put", "/creator-videos/selection", a, { id })).statusCode,
    404,
    "unprocessed cannot be selected",
  );
  assert.equal(
    (await call("post", "/creator-videos/:id/refresh", a, {}, { id })).body
      .status,
    "ready",
  );
  assert.equal(
    (await call("put", "/creator-videos/selection", b, { id })).statusCode,
    404,
    "cannot select another owner video",
  );
  assert.equal(
    (await call("put", "/creator-videos/selection", a, { id })).body.enabled,
    false,
  );
  assert.equal(
    (await call("get", "/creator-videos/:id", b, {}, { id })).statusCode,
    404,
    "disabled private to owner",
  );
  assert.equal(
    (await call("put", "/creator-videos/visibility", a, { enabled: true }))
      .statusCode,
    200,
  );
  assert.ok(
    (await call("get", "/creator-videos/feed", b)).body.videos.some(
      (v) => v.id === id,
    ),
  );
  const sessionId = randomUUID();
  await call(
    "post",
    "/creator-videos/:id/views",
    b,
    { sessionId, watchedSeconds: 0 },
    { id },
  );
  await pool.query(
    "update creator_video_views set last_seen_at=now()-interval '10 seconds' where id=$1",
    [sessionId],
  );
  await call(
    "post",
    "/creator-videos/:id/views",
    b,
    { sessionId, watchedSeconds: 999999 },
    { id },
  );
  const view = (
    await pool.query("select * from creator_video_views where id=$1", [
      sessionId,
    ])
  ).rows[0];
  assert.ok(view.watched_seconds <= 11, "wall time caps client values");
  assert.equal(
    (
      await call(
        "post",
        "/creator-videos/:id/views",
        c,
        { sessionId, watchedSeconds: 5 },
        { id },
      )
    ).statusCode,
    409,
    "session ownership",
  );
  await pool.query("insert into coin_balances(user_id,balance)values($1,100)", [
    b,
  ]);
  const gift = { giftId: "diamond", requestId: randomUUID() };
  const sent = await Promise.all([
    call("post", "/creator-videos/:id/gifts", b, gift, { id }),
    call("post", "/creator-videos/:id/gifts", b, gift, { id }),
  ]);
  assert.ok(sent.every((r) => r.statusCode === 200));
  assert.equal(
    (
      await pool.query("select balance from coin_balances where user_id=$1", [
        b,
      ])
    ).rows[0].balance,
    50,
    "retry spends once",
  );
  assert.equal(
    (
      await pool.query("select balance from coin_balances where user_id=$1", [
        a,
      ])
    ).rows[0].balance,
    50,
    "owner credited once",
  );
  assert.equal(
    (
      await call(
        "post",
        "/creator-videos/:id/gifts",
        b,
        { giftId: "crown", requestId: randomUUID() },
        { id },
      )
    ).statusCode,
    402,
  );
  assert.equal(
    (
      await call(
        "post",
        "/creator-videos/:id/gifts",
        a,
        { giftId: "rose", requestId: randomUUID() },
        { id },
      )
    ).statusCode,
    403,
  );
  const stats = (await call("get", "/creator-videos/:id/stats", a, {}, { id }))
    .body;
  assert.equal(stats.coins, 50);
  assert.equal(stats.viewers, 1);
  assert.equal(stats.senders[0].senderUid, b);
  assert.equal(stats.gifts.length, 1);
  assert.equal(
    (await call("get", "/creator-videos/:id/stats", b, {}, { id })).statusCode,
    404,
  );
  for (const viewer of [b, c, c]) {
    await call('post', '/creator-videos/:id/views', viewer, { sessionId: randomUUID(), watchedSeconds: 0 }, { id });
  }
  const ownerList = (await call('get', '/creator-videos/:id/viewers', a, {}, { id })).body;
  assert.equal(ownerList.viewers, 2, 'viewer list counts distinct accounts across sessions');
  assert.equal(ownerList.coins, 50);
  assert.equal(ownerList.isOwner, true);
  assert.equal(ownerList.entries.length, 2, 'owner sees current viewers including nongifters');
  assert.equal(ownerList.entries[0].uid, b);
  assert.equal(ownerList.entries[0].coins, 50);
  assert.equal(ownerList.entries[0].watching, true);
  const audienceList = (await call('get', '/creator-videos/:id/viewers', b, {}, { id })).body;
  assert.equal(audienceList.isOwner, false);
  assert.deepEqual(audienceList.entries.map(p => p.uid), [b], 'audience sees gift senders only');
  assert.ok(audienceList.entries.every(p => !('watching' in p)), 'audience never receives individual presence');
  await pool.query("update creator_video_views set last_seen_at=now()-interval '40 seconds' where video_id=$1 and viewer_user_id=$2", [id,b]);
  const departed = (await call('get', '/creator-videos/:id/viewers', a, {}, { id })).body;
  assert.equal(departed.viewers, 1);
  assert.equal(departed.entries[0].uid, b, 'departed gifter remains ranked');
  assert.equal(departed.entries[0].watching, false);
  await call('put', '/creator-videos/visibility', a, { enabled: false });
  assert.equal((await call('get', '/creator-videos/:id/viewers', b, {}, { id })).statusCode, 404, 'disabled video list inaccessible to audience');
  assert.equal((await call('get', '/creator-videos/:id/viewers', a, {}, { id })).statusCode, 200, 'creator can inspect offline preview statistics');
  await call('put', '/creator-videos/visibility', a, { enabled: true });
  const message = { message: "hello", clientId: randomUUID() };
  await call("post", "/creator-videos/:id/chat", b, message, { id });
  await call("post", "/creator-videos/:id/chat", b, message, { id });
  assert.equal(
    (await call("get", "/creator-videos/:id/chat", c, {}, { id })).body.messages
      .length,
    1,
  );
  await pool.query(
    "insert into user_blocks(blocker_user_id,blocked_user_id)values($1,$2)",
    [a, c],
  );
  assert.equal(
    (await call("get", "/creator-videos/:id", c, {}, { id })).statusCode,
    404,
  );
  assert.equal((await call('get', '/creator-videos/:id/viewers', c, {}, { id })).statusCode, 404, 'blocking applies to video viewer list');
  await db.transaction((tx) => disableVideoBeforeLive(tx, a));
  assert.equal(
    (await call("get", "/creator-videos/library", a)).body.enabled,
    false,
  );
  await pool.query(
    "insert into live_stream_sessions(channel_id,host_user_id,host_name,title,category)values($1,$2,$3,$4,$5)",
    [prefix, a, "Video test", "Test", "Talk"],
  );
  assert.equal(
    (await call("put", "/creator-videos/visibility", a, { enabled: true }))
      .statusCode,
    409,
  );
  await pool.query(
    "update live_stream_sessions set ended_at=now() where channel_id=$1",
    [prefix],
  );
  remote = { ...remote, guid: randomUUID() };
  const second = (
    await call("post", "/creator-videos/uploads", a, {
      filename: "second.mp4",
      bytes: 100,
    })
  ).body.id;
  await call("post", "/creator-videos/:id/refresh", a, {}, { id: second });
  await call("put", "/creator-videos/selection", a, { id: second });
  const history = (await call("get", "/creator-videos/library", a)).body;
  assert.equal(history.videos.length, 2);
  assert.equal(history.enabled, false);
  assert.ok(history.videos.find((v) => v.id === id).thumbnailUrl);
  await call("put", "/creator-videos/selection", a, { id });
  assert.equal(
    (await call("get", "/creator-videos/:id/stats", a, {}, { id })).body.coins,
    50,
    "reuse preserves statistics",
  );
  remote = { ...remote, guid: randomUUID(), width: 1280, height: 720 };
  const landscape = (
    await call("post", "/creator-videos/uploads", a, {
      filename: "landscape.mp4",
      bytes: 100,
    })
  ).body.id;
  assert.equal(
    (
      await call(
        "post",
        "/creator-videos/:id/refresh",
        a,
        {},
        { id: landscape },
      )
    ).body.status,
    "failed",
    "server rejects landscape",
  );
  remote = {...remote, guid: randomUUID(), width: 720, height: 1280};
  const pendingA = (await call('post','/creator-videos/uploads',a,{filename:'pending-a.mp4',bytes:100})).body.id;
  remote = {...remote,guid:randomUUID()};
  const pendingB = (await call('post','/creator-videos/uploads',a,{filename:'pending-b.mp4',bytes:100})).body.id;
  await call('post','/creator-videos/:id/refresh',a,{}, {id:pendingA});
  assert.equal((await call('get','/creator-videos/library',a)).body.selectedId,id,'older completion cannot replace the newer pending choice');
  await call('post','/creator-videos/:id/refresh',a,{}, {id:pendingB});
  const automatic = (await call('get','/creator-videos/library',a)).body;
  assert.equal(automatic.selectedId,pendingB,'latest completed upload becomes selected');
  assert.equal(automatic.enabled,false,'automatic selection never publishes');
  remote = {...remote,guid:randomUUID()};
  const pendingC = (await call('post','/creator-videos/uploads',a,{filename:'pending-c.mp4',bytes:100})).body.id;
  await call('put','/creator-videos/selection',a,{id});
  await call('post','/creator-videos/:id/refresh',a,{}, {id:pendingC});
  assert.equal((await call('get','/creator-videos/library',a)).body.selectedId,id,'manual history selection wins over late encoding');
  const remove = (uid, videoId, expectedError = false) => call('delete', '/creator-videos/:id', uid, {}, { id: videoId }, expectedError);
  assert.equal((await remove(b, landscape)).statusCode, 404, 'another account cannot remove an upload');
  assert.equal((await remove(a, id)).statusCode, 409, 'ready history is protected');
  assert.equal(deletedProviderIds.length, 0, 'rejected removal never touches Bunny');
  assert.equal((await remove(a, landscape)).statusCode, 200, 'failed upload can be removed');
  assert.equal((await remove(a, landscape)).statusCode, 404, 'repeated removal is harmless');
  await call('put', '/creator-videos/visibility', a, { enabled: true });
  remote = { ...remote, guid: randomUUID(), status: 0 };
  const stuck = (await call('post', '/creator-videos/uploads', a, { filename: 'stuck.mp4', bytes: 100 })).body.id;
  assert.equal((await call('post', '/creator-videos/:id/refresh', a, {}, { id: stuck })).body.status, 'uploading', 'empty provider record is not described as encoding');
  deleteStatus = 500;
  assert.equal((await remove(a, stuck, true)).statusCode, 503, 'provider failure is retryable');
  assert.equal((await pool.query('select pending_video_id from creator_video_settings where owner_user_id=$1', [a])).rows[0].pending_video_id, stuck, 'provider failure retains pending state');
  assert.equal((await pool.query('select count(*)::int as n from creator_videos where id=$1', [stuck])).rows[0].n, 1);
  deleteStatus = 404;
  assert.equal((await remove(a, stuck)).statusCode, 200, 'already absent Bunny asset can be cleared locally');
  const afterRemoval = (await call('get', '/creator-videos/library', a)).body;
  assert.ok(!afterRemoval.videos.some(v => v.id === stuck));
  assert.equal(afterRemoval.selectedId, id, 'removal preserves selected ready video');
  assert.equal(afterRemoval.enabled, true, 'removal preserves ready video visibility');
  assert.equal((await call('get', '/creator-videos/:id/stats', a, {}, { id })).body.coins, 50, 'removal preserves saved video gift statistics');
  assert.equal((await pool.query('select pending_video_id from creator_video_settings where owner_user_id=$1', [a])).rows[0].pending_video_id, null);
  deleteStatus = 204;
  remote = { ...remote, guid: randomUUID(), status: 3 };
  const processing = (await call('post', '/creator-videos/uploads', a, { filename: 'processing.mp4', bytes: 100 })).body.id;
  remote.encodeProgress = 63;
  assert.equal((await call('post', '/creator-videos/:id/refresh', a, {}, { id: processing })).body.encodingProgress, 63, 'returns actual provider progress');
  remote.encodeProgress = 150;
  assert.equal((await call('post', '/creator-videos/:id/refresh', a, {}, { id: processing })).body.encodingProgress, 100, 'bounds provider progress');
  delete remote.encodeProgress;
  assert.equal((await call('post', '/creator-videos/:id/refresh', a, {}, { id: processing })).body.encodingProgress, null, 'unknown progress is not fabricated');
  assert.equal((await remove(a, processing)).statusCode, 200, 'processing upload can be removed');
  console.log('PASS: incomplete upload removal ownership, ready history/stats preservation, pending cleanup and provider failure/404 retry behavior.');
  console.log(
    "PASS: real database ownership, upload signing/config failure, encoding validation, selection/history reuse, live disablement, shared chat, watch caps, blocking, atomic gifts/retry/insufficient funds and owner-only statistics. Bunny transport mocked.",
  );
} finally {
  global.fetch = previousFetch;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await pool.query(
    "delete from creator_video_chat where sender_user_id=ANY($1)",
    [[a, b, c]],
  );
  await pool.query(
    "delete from creator_video_gifts where video_id in(select id from creator_videos where owner_user_id=$1)",
    [a],
  );
  await pool.query(
    "delete from creator_video_views where viewer_user_id=ANY($1)",
    [[a, b, c]],
  );
  await pool.query(
    "delete from creator_video_settings where owner_user_id=ANY($1)",
    [[a, b, c]],
  );
  await pool.query("delete from creator_videos where owner_user_id=ANY($1)", [
    [a, b, c],
  ]);
  await pool.query(
    "delete from coin_transactions where from_user_id=ANY($1) or to_user_id=ANY($1)",
    [[a, b, c]],
  );
  await pool.query("delete from coin_balances where user_id=ANY($1)", [
    [a, b, c],
  ]);
  await pool.query("delete from live_stream_sessions where channel_id=$1", [
    prefix,
  ]);
  await pool.query("delete from users where uid=ANY($1) and clerk_id like $2", [
    [a, b, c],
    `${prefix}%`,
  ]);
  await pool.end();
  unlinkSync(output);
}
