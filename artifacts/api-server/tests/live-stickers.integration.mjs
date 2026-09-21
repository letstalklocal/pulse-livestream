import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync, unlinkSync } from "node:fs";
import { build } from "esbuild";
const dir = fileURLToPath(new URL("..", import.meta.url));
const output = `${dir}/tests/.live-stickers-${randomUUID()}.cjs`;
await build({
  stdin: {
    contents: `export { default as stickers } from './src/routes/live-stickers'; export { default as packs } from './src/routes/media-packs'; export { default as coins } from './src/routes/coins'; export { validateStickers } from './src/lib/liveStickers'; export { pool } from '@workspace/db';`,
    resolveDir: dir,
  },
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["pg-native"],
  logLevel: "silent",
  plugins: [{ name: "pack-test-storage", setup(b) {
    b.onResolve({ filter: /\/objectStorage$/ }, () => ({ path: "storage", namespace: "pack-test" }));
    b.onLoad({ filter: /.*/, namespace: "pack-test" }, () => ({ contents: 'exports.createPrivateGetUrl = async p => "https://fixture.invalid" + p; exports.createPrivateUploadUrl = async () => ({ uploadUrl: "https://fixture.invalid/upload", objectPath: "/objects/fixture" });' }));
  } }],
});
const { stickers, packs, coins, validateStickers, pool } = createRequire(
  import.meta.url,
)(output);
const prefix = `stickers-test-${randomUUID()}`,
  host = 1810000000 + Math.floor(Math.random() * 1000000),
  buyer = host + 1,
  other = host + 2,
  poor = host + 3;
const users = [host, buyer, other, poor],
  channel = `${prefix}-live`,
  second = `${prefix}-second`;
let packId, dmPack, sessionId;
async function call(router, path, method, uid, body = {}, params = {}) {
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
  await router.stack
    .find((l) => l.route?.path === path && l.route.methods[method])
    .route.stack[0].handle(
      {
        auth: () => ({
          userId: uid ? `${prefix}-${uid}` : null,
          tokenType: "session_token",
        }),
        body,
        params,
        log: { warn() {}, error() {} },
      },
      res,
    );
  return res;
}
const status = (uid = buyer, ch = channel) =>
  call(
    stickers,
    "/streams/:channelId/stickers",
    "get",
    uid,
    {},
    { channelId: ch },
  );
const buy = (
  uid = buyer,
  key = randomUUID(),
  p = packId,
  live = { channelId: channel, stickerId: "pack" },
) =>
  call(
    packs,
    "/media-packs/:packId/unlock",
    "post",
    uid,
    { idempotencyKey: key, ...(live ? { live } : {}) },
    { packId: String(p) },
  );
const balances = async () =>
  (
    await pool.query(
      "select user_id,balance from coin_balances where user_id=ANY($1::int[]) order by user_id",
      [users],
    )
  ).rows;
try {
  await pool.query(
    readFileSync(
      new URL(
        "../../../lib/db/migrations/20260921_live_stickers.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const uid of users) {
    await pool.query("insert into users(uid,clerk_id,name) values($1,$2,$3)", [
      uid,
      `${prefix}-${uid}`,
      "Sticker test",
    ]);
    await pool.query(
      "insert into coin_balances(user_id,balance) values($1,$2)",
      [uid, uid === poor ? 0 : 1000],
    );
  }
  const createBody = { name: `${prefix}-saved-gift`, price: 299, giftId: "diamond", items: [{ objectPath: `/objects/${prefix}/photo`, contentType: "image/jpeg", width: 100, height: 100 }] };
  for (const invalidGift of [undefined, null, "bad", "toString"]) {
    assert.equal((await call(packs, "/media-packs", "post", host, { ...createBody, giftId: invalidGift })).statusCode, 400, "Creation requires a catalog gift");
  }
  const created = await call(packs, "/media-packs", "post", host, createBody);
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.pack.giftId, "diamond");
  assert.equal(created.body.pack.price, 50, "Diamond sets the price, ignoring a client-supplied price");
  const savedId = Number(created.body.pack.id);
  const listed = await call(packs, "/media-packs", "get", host);
  assert.equal(listed.body.packs.find(p => Number(p.id) === savedId).giftId, "diamond", "Saved gift survives reload");
  assert.equal((await validateStickers([{ kind: "pack", giftId: "rose", packId: savedId }], host))[0].giftId, "diamond", "Server uses saved pack artwork even if a stale client sends a different gift");
  const savedItemId = created.body.pack.items[0].id;
  const edit = (uid, body) => call(packs, "/media-packs/:packId", "put", uid, body, { packId: String(savedId) });
  const editBody = { giftId: "rocket", items: [{ id: savedItemId }, { objectPath: `/objects/${prefix}/added`, contentType: "video/mp4", mediaType: "video", width: 100, height: 100, durationMs: 1000 }] };
  assert.equal((await edit(null, editBody)).statusCode, 401);
  assert.equal((await edit(other, editBody)).statusCode, 404, "Other accounts cannot edit packs");
  for (const body of [{ ...editBody, giftId: "bad" }, { ...editBody, items: [] }, { ...editBody, items: Array(21).fill({ id: savedItemId }) }, { ...editBody, items: [{ id: savedItemId }, { id: savedItemId }] }]) {
    assert.equal((await edit(host, body)).statusCode, 400);
  }
  assert.equal((await edit(host, { giftId: "rose", items: [{ id: "2147483647" }] })).statusCode, 409, "Unknown item cannot be imported into this pack");
  let edited = await edit(host, editBody);
  assert.equal(edited.statusCode, 200);
  assert.equal(edited.body.pack.id, String(savedId));
  assert.equal(edited.body.pack.price, 100, "Rocket sets the updated price");
  assert.equal(edited.body.pack.name, createBody.name);
  assert.equal(edited.body.pack.giftId, "rocket");
  assert.equal(edited.body.pack.items[0].id, savedItemId, "Kept media retains its identity");
  const addedItemId = edited.body.pack.items[1].id;
  edited = await edit(host, { giftId: "heart", items: [{ id: addedItemId }, { id: savedItemId }] });
  assert.deepEqual(edited.body.pack.items.map(item => item.id), [addedItemId, savedItemId], "Reordering is atomic without unique-position collisions");
  await pool.query("insert into media_pack_purchases(pack_id,buyer_user_id,idempotency_key) values($1,$2,$3)", [savedId, buyer, `${prefix}-owned-edit`]);
  edited = await edit(host, { giftId: "crown", price: 1, name: "Do not change", items: [{ id: addedItemId }] });
  assert.equal(edited.body.pack.items.length, 1);
  assert.equal(edited.body.pack.items[0].id, addedItemId);
  assert.equal(edited.body.pack.giftId, "crown");
  assert.equal(edited.body.pack.price, 500, "Crown sets the price, ignoring an arbitrary client price");
  assert.equal(edited.body.pack.name, createBody.name);
  const ownedAfterEdit = await call(packs, "/media-packs/:packId", "get", buyer, {}, { packId: String(savedId) });
  assert.equal(ownedAfterEdit.body.pack.unlocked, true, "Existing purchase survives edit");
  assert.equal(ownedAfterEdit.body.pack.items[0].id, addedItemId, "Existing buyer sees updated contents");
  assert.equal((await edit(host, editBody)).statusCode, 409, "Stale editor cannot resurrect removed media");
  assert.equal((await pool.query("select gift_id from media_packs where id=$1", [savedId])).rows[0].gift_id, "crown", "Failed edit preserves saved artwork");
  const triggerName = `pack_edit_failure_${host}`;
  await pool.query(`create function ${triggerName}() returns trigger language plpgsql as $$ begin raise exception 'fixture edit failure'; end $$`);
  try {
    await pool.query(`create trigger ${triggerName} before insert on media_pack_items for each row when (NEW.pack_id = ${savedId}) execute function ${triggerName}()`);
    await assert.rejects(edit(host, { giftId: "rose", items: [editBody.items[1]] }), error => error.cause?.message === "fixture edit failure");
    const preserved = await call(packs, "/media-packs/:packId", "get", host, {}, { packId: String(savedId) });
    assert.equal(preserved.body.pack.giftId, "crown");
    assert.deepEqual(preserved.body.pack.items.map(item => item.id), [addedItemId], "Mid-edit database failure rolls back removals and gift changes");
  } finally {
    await pool.query(`drop trigger if exists ${triggerName} on media_pack_items`);
    await pool.query(`drop function if exists ${triggerName}()`);
  }
  await pool.query("insert into direct_messages(from_user_id,to_user_id,text,kind,media_pack_id,idempotency_key) values($1,$2,'','media_pack',$3,$4)", [host, other, savedId, `${prefix}-edit-dm`]);
  const purchaseKey = `${prefix}-edited-purchase`;
  const unlockEdited = expectedPrice => call(packs, "/media-packs/:packId/unlock", "post", other, { idempotencyKey: purchaseKey, expectedPrice }, { packId: String(savedId) });
  assert.equal((await unlockEdited(50)).statusCode, 409, "Old confirmed price cannot charge the newly selected gift price");
  assert.equal((await pool.query("select balance from coin_balances where user_id=$1", [other])).rows[0].balance, 1000);
  const paidEdited = await unlockEdited(500);
  assert.equal(paidEdited.statusCode, 200);
  assert.equal(paidEdited.body.balance, 500, "Updated pack charges exactly Crown's value");
  assert.equal((await unlockEdited(50)).body.balance, 500, "Purchased pack never charges again, even after a stale-price retry");
  assert.equal((await pool.query("select amount from coin_transactions where idempotency_key=$1", [purchaseKey])).rows[0].amount, 500);
  await pool.query("delete from direct_messages where media_pack_id=$1", [savedId]);
  await pool.query("delete from coin_transactions where idempotency_key=$1", [purchaseKey]);
  await pool.query("update coin_balances set balance=1000 where user_id=ANY($1::int[])", [[host, other]]);
  packId = (
    await pool.query(
      "insert into media_packs(owner_user_id,name,coin_price) values($1,$2,40) returning id",
      [host, prefix],
    )
  ).rows[0].id;
  dmPack = (
    await pool.query(
      "insert into media_packs(owner_user_id,name,coin_price) values($1,$2,25) returning id",
      [host, `${prefix}-dm`],
    )
  ).rows[0].id;
  for (let i = 0; i < 4; i++)
    await pool.query(
      "insert into media_pack_items(pack_id,position,object_path,content_type) values($1,$2,$3,$4)",
      [
        packId,
        i,
        `/objects/${prefix}/${i}`,
        i < 2 ? "video/mp4" : "image/jpeg",
      ],
    );
  sessionId = (
    await pool.query(
      "insert into live_stream_sessions(channel_id,host_user_id,host_name,title,category,stickers,is_private) values($1,$2,$3,$3,$3,$4,true) returning id",
      [
        channel,
        host,
        prefix,
        JSON.stringify([
          { id: "pack", kind: "pack", giftId: "rose", packId },
          { id: "gift", kind: "gift", giftId: "rose" },
        ]),
      ],
    )
  ).rows[0].id;
  await pool.query(
    "insert into live_stream_sessions(channel_id,host_user_id,host_name,title,category,is_private) values($1,$2,$3,$3,$3,true)",
    [second, other, prefix],
  );
  // Keep synthetic sessions out of the shared development Discovery feed.
  assert.equal(
    (
      await pool.query(
        "select count(*)::int n from live_stream_sessions where channel_id=ANY($1::text[]) and is_private=false",
        [[channel, second]],
      )
    ).rows[0].n,
    0,
  );
  if (process.env.VERIFY_STICKER_DISCOVERY === "1") {
    const response = await fetch("http://127.0.0.1:8080/api/streams");
    assert.equal(response.status, 200);
    const feed = await response.json();
    assert.ok(
      feed.streams.every((s) => !s.channelId.startsWith(prefix)),
      "Running Discovery excludes active sticker fixtures",
    );
  }
  assert.equal((await status(null)).statusCode, 401);
  const list = await status();
  assert.equal(list.statusCode, 200);
  assert.equal(list.body.stickers[0].price, 40);
  assert.equal(list.body.stickers[0].videos, 2);
  assert.equal(list.body.stickers[0].pictures, 2);
  assert.equal(list.body.stickers[0].owned, false);
  await pool.query("update media_packs set gift_id='heart' where id=$1", [packId]);
  assert.equal((await status()).body.stickers[0].giftId, "heart", "Active pack sticker reflects the saved gift after edit");
  await pool.query("update media_packs set gift_id='rose' where id=$1", [packId]);
  assert.ok(
    !JSON.stringify(list.body).includes("/objects/"),
    "No protected asset paths",
  );
  assert.equal(
    (await validateStickers([{ kind: "pack", giftId: "rose", packId }], host))
      .length,
    1,
  );
  for (const config of [
    null,
    [{}, {}, {}],
    [{ kind: "pack", giftId: "rose", packId }],
    [{ kind: "gift", giftId: "invalid" }],
  ])
    await assert.rejects(validateStickers(config, other));
  assert.equal((await buy(null)).statusCode, 401);
  assert.equal((await buy(host)).statusCode, 403);
  assert.equal((await buy(poor)).statusCode, 402);
  assert.equal(
    (await buy(buyer, randomUUID(), packId, null)).statusCode,
    403,
    "Unsent DM still cannot be purchased",
  );
  assert.equal(
    (
      await buy(buyer, randomUUID(), packId, {
        channelId: second,
        stickerId: "pack",
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await buy(buyer, randomUUID(), packId, {
        channelId: channel,
        stickerId: "gift",
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await pool.query(
        "select count(*)::int n from direct_messages where to_user_id=$1",
        [poor],
      )
    ).rows[0].n,
    0,
    "Failed purchase creates no receipt",
  );
  await pool.query(
    "insert into stream_moderation(session_id,viewer_user_id,removed) values($1,$2,true)",
    [sessionId, other],
  );
  assert.equal(
    (await buy(other)).statusCode,
    403,
    "Removed viewer cannot purchase",
  );
  await pool.query("delete from stream_moderation where session_id=$1", [
    sessionId,
  ]);
  await pool.query(
    "update live_stream_sessions set last_heartbeat_at=now()-interval '2 minutes' where id=$1",
    [sessionId],
  );
  assert.equal((await status()).statusCode, 404, "Stale live cannot advertise");
  await pool.query(
    "update live_stream_sessions set last_heartbeat_at=now() where id=$1",
    [sessionId],
  );
  const before = await balances();
  const keys = [randomUUID(), randomUUID()];
  const payments = await Promise.all([
    buy(buyer, keys[0]),
    buy(buyer, keys[0]),
    buy(buyer, keys[1]),
  ]);
  payments.forEach((r) =>
    assert.equal(r.statusCode, 200, JSON.stringify(r.body)),
  );
  assert.equal(
    (await buy(buyer, keys[0])).statusCode,
    200,
    "Lost-response retry",
  );
  const after = await balances();
  assert.equal(
    after.find((r) => r.user_id === buyer).balance,
    before.find((r) => r.user_id === buyer).balance - 40,
  );
  assert.equal(
    after.find((r) => r.user_id === host).balance,
    before.find((r) => r.user_id === host).balance + 40,
  );
  assert.equal(
    (
      await pool.query(
        "select count(*)::int n from media_pack_purchases where pack_id=$1 and buyer_user_id=$2",
        [packId, buyer],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await pool.query(
        "select count(*)::int n from direct_messages where media_pack_id=$1 and to_user_id=$2",
        [packId, buyer],
      )
    ).rows[0].n,
    1,
    "One unlocked receipt",
  );
  assert.equal((await status()).body.stickers[0].owned, true);
  assert.equal((await status(other)).body.stickers[0].owned, false);
  assert.equal(
    (await buy(buyer, randomUUID(), packId, null)).statusCode,
    200,
    "DM sees same ownership",
  );
  const earnings = await call(
    coins,
    "/streams/:channelId/earnings",
    "get",
    buyer,
    {},
    { channelId: channel },
  );
  assert.equal(earnings.body.coins, 40);
  const ranking = await call(
    coins,
    "/streams/:channelId/leaderboard",
    "get",
    buyer,
    {},
    { channelId: channel },
  );
  assert.equal(ranking.body.entries.find((e) => e.uid === buyer).coins, 40);
  await pool.query(
    "insert into direct_messages(from_user_id,to_user_id,text,kind,media_pack_id,idempotency_key) values($1,$2,'','media_pack',$3,$4)",
    [host, other, dmPack, randomUUID()],
  );
  assert.equal((await buy(other, randomUUID(), dmPack, null)).statusCode, 200);
  assert.equal(
    (
      await call(
        coins,
        "/streams/:channelId/earnings",
        "get",
        buyer,
        {},
        { channelId: channel },
      )
    ).body.coins,
    40,
    "Separate DM purchase has no live credit",
  );
  assert.equal(
    (await buy(other, keys[0], dmPack, null)).statusCode,
    409,
    "Key cannot be stolen",
  );
  await pool.query(
    "insert into user_blocks(blocker_user_id,blocked_user_id) values($1,$2)",
    [host, other],
  );
  assert.equal((await buy(other)).statusCode, 403);
  assert.equal((await status(other)).statusCode, 403);
  await pool.query(
    "delete from user_blocks where blocker_user_id=$1 and blocked_user_id=$2",
    [host, other],
  );
  await pool.query(
    "update live_stream_sessions set required_gift_id='rose',required_gift_name='Rose',required_gift_emoji='🌹',required_gift_coin_cost=1 where id=$1",
    [sessionId],
  );
  assert.equal((await buy(other)).statusCode, 403, "Unadmitted Premium viewer");
  await pool.query(
    "update live_stream_sessions set premium_free_viewer_ids=$1 where id=$2",
    [JSON.stringify([other]), sessionId],
  );
  assert.equal((await buy(other)).statusCode, 200, "Free-entry viewer may buy");
  await pool.query(
    "update live_stream_sessions set required_gift_id=null where id=$1",
    [sessionId],
  );
  const giftBody = {
    uid: buyer,
    recipientUid: host,
    amount: 1,
    giftName: "Rose",
    senderName: "Tester",
    channelId: channel,
    stickerId: "gift",
    idempotencyKey: randomUUID(),
  };
  const gift = () => call(coins, "/coins/spend", "post", buyer, giftBody);
  assert.equal((await gift()).statusCode, 200);
  assert.equal((await gift()).statusCode, 200);
  assert.equal(
    (
      await call(coins, "/coins/spend", "post", buyer, {
        ...giftBody,
        amount: 500,
        idempotencyKey: randomUUID(),
      })
    ).statusCode,
    409,
    "Gift sticker cost validated",
  );
  assert.equal(
    (
      await call(
        coins,
        "/streams/:channelId/earnings",
        "get",
        buyer,
        {},
        { channelId: channel },
      )
    ).body.coins,
    81,
    "Two packs and one gift; retries do not score",
  );
  await pool.query("update live_stream_sessions set stickers=$1 where id=$2", [
    JSON.stringify([
      { id: "pack", kind: "pack", giftId: "rose", packId: dmPack },
      { id: "gift", kind: "gift", giftId: "rose" },
    ]),
    sessionId,
  ]);
  assert.equal(
    (await status(other)).body.stickers[0].owned,
    true,
    "Already bought in DMs shows View pack",
  );
  assert.equal((await buy(other, randomUUID(), dmPack)).statusCode, 200);
  assert.equal(
    (
      await call(
        coins,
        "/streams/:channelId/earnings",
        "get",
        buyer,
        {},
        { channelId: channel },
      )
    ).body.coins,
    81,
    "Existing DM ownership never gets retroactive live credit",
  );
  assert.equal(
    (
      await call(
        stickers,
        "/streams/:channelId/stickers/:stickerId",
        "delete",
        buyer,
        {},
        { channelId: channel, stickerId: "pack" },
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await call(
        stickers,
        "/streams/:channelId/stickers/:stickerId",
        "delete",
        host,
        {},
        { channelId: channel, stickerId: "pack" },
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (await buy(poor)).statusCode,
    404,
    "Removed offer cannot be purchased",
  );
  const replacementBody = { kind: "gift", giftId: "heart" };
  const replacementParams = { channelId: channel, stickerId: "gift" };
  assert.equal(
    (
      await call(
        stickers,
        "/streams/:channelId/stickers/:stickerId",
        "put",
        buyer,
        replacementBody,
        replacementParams,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await call(
        stickers,
        "/streams/:channelId/stickers/:stickerId",
        "put",
        host,
        { kind: "gift", giftId: "bad" },
        replacementParams,
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await call(
        stickers,
        "/streams/:channelId/stickers/:stickerId",
        "put",
        host,
        replacementBody,
        replacementParams,
      )
    ).statusCode,
    200,
  );
  const updated = (await status()).body.stickers;
  assert.equal(updated.length, 1, "Replacement does not add a slot");
  assert.equal(updated[0].giftId, "heart");
  assert.notEqual(
    updated[0].id,
    "gift",
    "Replacement gets a new offer identity",
  );
  assert.equal(
    (
      await call(coins, "/coins/spend", "post", buyer, {
        ...giftBody,
        idempotencyKey: randomUUID(),
      })
    ).statusCode,
    409,
    "Replaced offer cannot charge a stale price",
  );
  assert.equal(
    (
      await call(
        stickers,
        "/streams/:channelId/stickers/:stickerId",
        "put",
        host,
        replacementBody,
        replacementParams,
      )
    ).statusCode,
    404,
    "Stale replacement cannot overwrite the new offer",
  );
  await pool.query(
    "update live_stream_sessions set ended_at=now() where id=$1",
    [sessionId],
  );
  assert.equal((await status()).statusCode, 404);
  assert.equal(
    (
      await call(coins, "/coins/spend", "post", buyer, {
        ...giftBody,
        idempotencyKey: randomUUID(),
      })
    ).statusCode,
    404,
    "Ended stream cannot sell",
  );
  console.log(
    "PASS: real DB sticker metadata/auth/ownership, shared DM purchase, concurrent retries, exact balances/receipts/earnings/rankings, Premium/block rules, gift validation and removed/ended offers.",
  );
} finally {
  await pool.query(
    "delete from coin_transactions where from_user_id=ANY($1::int[]) or to_user_id=ANY($1::int[])",
    [users],
  );
  await pool.query(
    "delete from direct_messages where from_user_id=ANY($1::int[]) or to_user_id=ANY($1::int[])",
    [users],
  );
  await pool.query(
    "delete from media_packs where owner_user_id=ANY($1::int[])",
    [users],
  );
  await pool.query(
    "delete from live_stream_sessions where host_user_id=ANY($1::int[])",
    [users],
  );
  await pool.query(
    "delete from user_blocks where blocker_user_id=ANY($1::int[]) or blocked_user_id=ANY($1::int[])",
    [users],
  );
  await pool.query("delete from coin_balances where user_id=ANY($1::int[])", [
    users,
  ]);
  await pool.query(
    "delete from users where uid=ANY($1::int[]) and clerk_id like $2",
    [users, `${prefix}%`],
  );
  await pool.end();
  unlinkSync(output);
}
