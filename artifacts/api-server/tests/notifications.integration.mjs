import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync, unlinkSync } from "node:fs";
import { build } from "esbuild";
const dir = fileURLToPath(new URL("..", import.meta.url));
const output = `${dir}/tests/.notifications-${randomUUID()}.cjs`;
await build({
  stdin: {
    contents: `export { default as router } from './src/routes/notifications'; export { pool } from '@workspace/db'; export { canShowNotification, collectNotifications, notificationBody } from '../mobile/utils/inAppNotifications';`,
    resolveDir: dir,
  },
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["pg-native"],
  logLevel: "silent",
});
const {
  router,
  pool,
  canShowNotification,
  collectNotifications,
  notificationBody,
} = createRequire(import.meta.url)(output);
const prefix = `notification-test-${randomUUID()}`;
const a = 1900000000 + Math.floor(Math.random() * 1000000),
  b = a + 1,
  c = a + 2;
const uids = [a, b, c];
const partyId = `${prefix}-party`,
  battleId = `${prefix}-battle`;
const channels = [`${prefix}-a`, `${prefix}-b`, `${prefix}-private`];
const call = async (method, path, uid, body = {}, query = {}) => {
  const handler = router.stack.find(
    (l) => l.route?.path === path && l.route.methods[method],
  ).route.stack[0].handle;
  const res = {
    statusCode: 200,
    status(n) {
      this.statusCode = n;
      return this;
    },
    set() {
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await handler(
    {
      auth: () => ({
        userId: uid ? `${prefix}-${uid}` : null,
        tokenType: "session_token",
      }),
      body,
      query,
    },
    res,
  );
  return res;
};
const prefs = (uid, body) =>
  call(body ? "patch" : "get", "/notification-preferences", uid, body);
const since = Date.now() - 1000;
const feed = (uid, query = { since: String(since) }) =>
  call("get", "/notifications/in-app", uid, {}, query);
try {
  await pool.query(
    readFileSync(
      new URL(
        "../../../lib/db/migrations/20260910_notification_preferences.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const uid of uids)
    await pool.query("insert into users(uid,clerk_id,name) values($1,$2,$3)", [
      uid,
      `${prefix}-${uid}`,
      `Person ${uid}`,
    ]);
  assert.equal((await prefs(null)).statusCode, 401);
  assert.equal((await prefs(null, { enabled: false })).statusCode, 401);
  assert.equal((await feed(null)).statusCode, 401);
  assert.equal((await prefs(a, { messages: "false" })).statusCode, 400);
  assert.equal((await prefs(a, { userId: b })).statusCode, 400);
  const defaults = (await prefs(a)).body;
  assert.equal(defaults.enabled, true);
  assert.equal(Object.hasOwn(defaults, "party"), false);
  await pool.query(
    "insert into notification_preferences(user_id, preferences) values($1, '{\"party\":true}'::jsonb)",
    [a],
  );
  assert.equal(Object.hasOwn((await prefs(a)).body, "party"), false);

  await Promise.all([
    prefs(a, { messages: false }),
    prefs(a, { followers: false }),
  ]);
  assert.equal((await prefs(a)).body.messages, false);
  assert.equal((await prefs(a)).body.followers, false);
  assert.equal((await prefs(b)).body.messages, true);
  await prefs(a, { messages: true, followers: true });
  assert.equal((await feed(a, { since: "bad" })).statusCode, 400);
  assert.deepEqual((await feed(a, {})).body.notifications, []);
  await pool.query(
    "insert into direct_messages(from_user_id,to_user_id,text) values($1,$2,'secret message'),($2,$1,'outgoing'),($1,$3,'not yours')",
    [b, a, c],
  );
  await pool.query(
    "insert into follows(follower_id,followed_id) values($1,$2),($2,$1),($2,$3)",
    [b, a, c],
  );
  await pool.query(
    "insert into coin_transactions(from_user_id,to_user_id,amount,type,description,gift_name) values($1,$2,5,'gift','test gift','Rose')",
    [b, a],
  );
  // Only DM gifts and direct-media payments belong in the gifts banner category.
  await pool.query(
    "insert into coin_transactions(from_user_id,to_user_id,amount,type,gift_name,channel_id) values($1,$2,100,'gift','Rose','test-live'),(null,$2,200,'grant',null,null),($1,$2,300,'gift',null,null)",
    [b, a],
  );
  const mediaMessage = (
    await pool.query(
      "insert into direct_messages(from_user_id,to_user_id,text,kind,media_price) values($1,$2,'Media','media',7) returning id",
      [a, b],
    )
  ).rows[0].id;
  await pool.query(
    "insert into direct_media_purchases(message_id,buyer_user_id,idempotency_key) values($1,$2,$3)",
    [mediaMessage, b, prefix],
  );
  await pool.query(
    "insert into coin_transactions(from_user_id,to_user_id,amount,type,idempotency_key) values($1,$2,7,'gift',$3)",
    [b, a, prefix],
  );
  const post = (
    await pool.query(
      "insert into posts(owner_user_id,image_object_path) values($1,'/objects/test') returning id",
      [a],
    )
  ).rows[0].id;
  await pool.query(
    "insert into post_comments(post_id,user_id,text,request_id) values($1,$2,'secret comment',$3)",
    [post, b, prefix],
  );
  await pool.query(
    "insert into post_reactions(post_id,user_id,kind) values($1,$2,'like'),($1,$3,'like')",
    [post, b, a],
  );
  for (const [i, uid] of [
    [0, a],
    [1, b],
    [2, c],
  ])
    await pool.query(
      "insert into live_stream_sessions(channel_id,host_user_id,host_name,title,category,is_private) values($1,$2,'Host','Live','Chat',$3)",
      [channels[i], uid, i === 2],
    );
  await pool.query(
    "insert into private_stream_invitations(streamer_user_id,invited_user_id,channel_id,title,background_object_path,expires_at) values($1,$2,$3,'Private','/objects/test',now()+interval '1 minute')",
    [b, a, `${prefix}-invite`],
  );
  const invitation = (
    await pool.query(
      "select id from private_stream_invitations where channel_id=$1",
      [`${prefix}-invite`],
    )
  ).rows[0].id;
  await pool.query(
    "insert into direct_messages(from_user_id,to_user_id,text,kind,private_stream_invitation_id) values($1,$2,'Private live','private_stream_invitation',$3)",
    [b, a, invitation],
  );
  await pool.query(
    "insert into live_parties(id,first_channel_id,second_channel_id,status,expires_at) values($1,$2,$3,'pending',now()+interval '1 minute')",
    [partyId, channels[1], channels[0]],
  );
  await pool.query(
    "insert into live_battles(id,party_id,requester_uid,status,expires_at) values($1,$2,$3,'pending',now()+interval '1 minute')",
    [battleId, partyId, b],
  );
  const premiumChannel = `${prefix}-premium`;
  channels.push(premiumChannel);
  await pool.query(
    "insert into live_stream_sessions(channel_id,host_user_id,host_name,title,category,required_gift_id,required_gift_name,required_gift_coin_cost) values($1,$2,'Host','Premium session','Chat','rose','Rose',1)",
    [premiumChannel, b],
  );
  const events = (await feed(a)).body.notifications;
  assert.deepEqual(
    [...new Set(events.map((e) => e.category))].sort(),
    [
      "followers",
      "gifts",
      "live",
      "messages",
      "posts",
      "privateInvitations",
    ].sort(),
  );
  assert.equal(events.filter((e) => e.category === "messages").length, 1);
  const gifts = events.filter((e) => e.category === "gifts");
  assert.equal(gifts.length, 2);
  assert.ok(gifts.every((e) => e.route === `/dm/${b}`));
  assert.ok(gifts.some((e) => e.body.includes("5 coins")));
  assert.ok(gifts.some((e) => e.body.includes("7 coins")));
  assert.ok(
    gifts.every(
      (e) => !/100|200|300/.test(e.body.split(": ").slice(1).join(": ")),
    ),
  );
  assert.equal(canShowNotification(gifts[0], defaults, `/dm/${b}`), false);
  assert.equal(canShowNotification(gifts[0], defaults, "/go-live"), true);

  assert.equal(events.filter((e) => e.category === "posts").length, 2);
  assert.equal(events.filter((e) => e.category === "party").length, 0);
  assert.equal(events.filter((e) => e.category === "live").length, 2);
  assert.ok(
    events.every(
      (e) =>
        !e.body.includes("not yours") &&
        !e.body.includes("outgoing") &&
        Number.isFinite(e.createdAt),
    ),
  );
  assert.ok(
    events.some(
      (e) =>
        e.category === "live" &&
        e.title === "Premium live" &&
        e.route === `/stream/${premiumChannel}`,
    ),
  );
  assert.ok(
    events.some(
      (e) =>
        e.category === "live" &&
        e.title === "Live now" &&
        e.route === `/stream/${channels[1]}`,
    ),
  );
  await prefs(a, { live: false });
  assert.ok(
    (await feed(a)).body.notifications.every((e) => e.category !== "live"),
  );
  await prefs(a, { live: true });
  await pool.query(
    "update live_stream_sessions set ended_at=now() where channel_id=$1",
    [premiumChannel],
  );
  assert.ok(
    (await feed(a)).body.notifications.every(
      (e) => e.route !== `/stream/${premiumChannel}`,
    ),
  );
  await pool.query(
    "update live_stream_sessions set ended_at=null,last_heartbeat_at=now()-interval '2 minutes' where channel_id=$1",
    [premiumChannel],
  );
  assert.ok(
    (await feed(a)).body.notifications.every(
      (e) => e.route !== `/stream/${premiumChannel}`,
    ),
  );
  await pool.query(
    "update live_stream_sessions set last_heartbeat_at=now() where channel_id=$1",
    [premiumChannel],
  );
  await prefs(a, { previews: false, messages: false });
  let next = (await feed(a)).body.notifications;
  assert.ok(
    next.every((e) => e.category !== "messages" && !e.body.includes("secret")),
  );
  assert.ok(next.some((e) => e.category === "privateInvitations"));
  await prefs(a, { enabled: false });
  assert.deepEqual((await feed(a)).body.notifications, []);
  await prefs(a, { enabled: true, messages: true });
  await pool.query(
    "insert into user_blocks(blocker_user_id,blocked_user_id) values($1,$2)",
    [b, a],
  );
  assert.deepEqual((await feed(a)).body.notifications, []);
  await pool.query("delete from user_blocks where blocker_user_id=$1", [b]);
  await pool.query(
    "insert into creator_blocks(host_user_id,viewer_user_id) values($1,$2)",
    [b, a],
  );
  assert.ok(
    (await feed(a)).body.notifications.every((e) => e.category !== "live"),
  );
  const message = events.find((e) => e.category === "messages");
  assert.equal(canShowNotification(message, defaults, message.route), false);
  assert.equal(
    canShowNotification(message, { ...defaults, messages: false }, "/settings"),
    false,
  );
  assert.equal(
    canShowNotification(message, { ...defaults, enabled: false }, "/settings"),
    false,
  );
  assert.equal(canShowNotification(message, defaults, "/settings"), true);
  assert.equal(notificationBody(message, false), "Open Pulse to view it.");
  const seen = new Set();
  assert.equal(
    collectNotifications([message], seen, 0, defaults, "/settings").length,
    1,
  );
  assert.equal(
    collectNotifications([message], seen, 0, defaults, "/settings").length,
    0,
  );
  assert.equal(
    collectNotifications(
      [message],
      new Set(),
      message.createdAt + 1,
      defaults,
      "/settings",
    ).length,
    0,
  );

  console.log(
    "Notifications passed: every category, ownership, block rules, private live exclusion, settings persistence/concurrent saves, previews, master mute, and active-conversation suppression.",
  );
} finally {
  await pool.query("delete from live_battles where id=$1", [battleId]);
  await pool.query("delete from live_parties where id=$1", [partyId]);
  await pool.query(
    "delete from live_stream_sessions where channel_id=any($1::text[])",
    [channels],
  );
  await pool.query(
    "delete from direct_messages where from_user_id=any($1::int[]) or to_user_id=any($1::int[])",
    [uids],
  );
  await pool.query(
    "delete from private_stream_invitations where streamer_user_id=any($1::int[])",
    [uids],
  );
  await pool.query("delete from posts where owner_user_id=any($1::int[])", [
    uids,
  ]);
  await pool.query(
    "delete from follows where follower_id=any($1::int[]) or followed_id=any($1::int[])",
    [uids],
  );
  await pool.query(
    "delete from coin_transactions where from_user_id=any($1::int[]) or to_user_id=any($1::int[])",
    [uids],
  );
  await pool.query("delete from users where uid=any($1::int[])", [uids]);
  await pool.end();
  unlinkSync(output);
}
