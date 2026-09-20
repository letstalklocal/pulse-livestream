import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const root = fileURLToPath(new URL("..", import.meta.url)),
  out = `${root}/tests/.overview-${randomUUID()}.cjs`;
await build({
  stdin: {
    contents: `export {readAdminOverview} from './src/lib/adminOverview';export {readAdminStreams,readAdminReports} from './src/lib/adminOperations';export {pool} from '@workspace/db';`,
    resolveDir: root,
  },
  outfile: out,
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["pg-native"],
  logLevel: "silent",
});
const { pool, readAdminOverview, readAdminStreams, readAdminReports } =
    createRequire(import.meta.url)(out),
  client = await pool.connect();
const now = new Date("2026-09-13T12:00:00.000Z");
try {
  await client.query("BEGIN");
  // Temporary tables shadow public tables only in this transaction. No real account/ledger changes.
  await client.query(`CREATE TEMP TABLE users(uid integer,created_at timestamp) ON COMMIT DROP;
 CREATE TEMP TABLE identity_verifications(user_id integer,is_verified boolean,environment text) ON COMMIT DROP;
 CREATE TEMP TABLE coin_transactions(amount integer,type text,created_at timestamp) ON COMMIT DROP;
 CREATE TEMP TABLE live_stream_sessions(id serial,host_user_id integer DEFAULT 1,host_name text DEFAULT 'Host',title text DEFAULT 'Title',category text DEFAULT 'General',channel_id text,is_private boolean,started_at timestamptz,last_heartbeat_at timestamptz,ended_at timestamptz) ON COMMIT DROP;
 CREATE TEMP TABLE private_stream_invitations(channel_id text,status text,updated_at timestamptz) ON COMMIT DROP;`);
  const empty = await readAdminOverview(client, now, "sandbox");
  assert.equal(empty.totalUsers, 0);
  assert.equal(empty.verifiedPercent, 0);
  assert.equal(empty.coinsGifted.current, 0);
  assert.equal(empty.newUsers.changePercent, null);
  assert.equal(empty.growth.length, 7);
  assert.ok(empty.growth.every((d) => d.count === 0));
  assert.equal(empty.range.start, "2026-09-07T00:00:00.000Z");
  assert.equal(empty.range.previousStart, "2026-08-31T12:00:00.000Z");
  const dates = [
    "2026-08-31T11:59:59.999",
    "2026-08-31T12:00:00",
    "2026-09-06T23:59:59.999",
    "2026-09-07T00:00:00",
    "2026-09-10T14:00:00",
    "2026-09-13T11:59:59.999",
    "2026-09-13T12:00:00",
    "2026-09-14T00:00:00",
  ];
  for (let i = 0; i < dates.length; i++)
    await client.query("INSERT INTO users VALUES($1,$2)", [i + 1, dates[i]]);
  await client.query(
    "INSERT INTO identity_verifications VALUES(4,true,'sandbox'),(5,true,'live'),(6,false,'sandbox'),(7,true,'sandbox'),(99,true,'sandbox')",
  );
  for (const row of [
    [10, "gift", dates[1]],
    [30, "gift", dates[2]],
    [20, "gift", dates[3]],
    [80, "gift", dates[5]],
    [900, "grant", dates[4]],
    [999, "private_invitation_settlement", dates[4]],
    [999, "private_invitation_hold", dates[4]],
    [999, "private_invitation_refund", dates[4]],
    [1000, "gift", dates[0]],
    [1000, "gift", dates[6]],
  ])
    await client.query("INSERT INTO coin_transactions VALUES($1,$2,$3)", row);
  async function stream(
    channel,
    age,
    { privateStream = false, ended = false } = {},
  ) {
    await client.query(
      "INSERT INTO live_stream_sessions(channel_id,is_private,started_at,last_heartbeat_at,ended_at) VALUES($1,$2,$3,$4,$5)",
      [
        channel,
        privateStream,
        new Date(now.getTime() - 3600000),
        new Date(now.getTime() - age),
        ended ? now : null,
      ],
    );
  }
  await stream("public-active", 59000);
  await stream("expired", 60000);
  await stream("stale", 61000);
  await stream("ended", 1000, { ended: true });
  await stream("seed-demo", 1000);
  await stream("future-heartbeat", -1000);
  await stream("private-active", 1000, { privateStream: true });
  await stream("private-expired-invitation", 1000, { privateStream: true });
  await stream("private-no-invitation", 1000, { privateStream: true });
  await stream("private-ended-invitation", 1000, { privateStream: true });
  await client.query(
    "INSERT INTO private_stream_invitations VALUES('private-active','active',$1),('private-expired-invitation','active',$2),('private-ended-invitation','ended',$1)",
    [new Date(now.getTime() - 74000), new Date(now.getTime() - 75000)],
  );
  const actual = await readAdminOverview(client, now, "sandbox");
  const listed = await readAdminStreams(client, "all", null, 20, now);
  assert.equal(listed.rows.length, actual.liveStreams);
  assert.deepEqual(
    Object.keys(listed.rows[0]).sort(),
    [
      "id",
      "hostUid",
      "hostName",
      "title",
      "category",
      "isPrivate",
      "startedAt",
      "lastHeartbeatAt",
    ].sort(),
  );
  assert.equal(
    (await readAdminStreams(client, "private", null, 20, now)).rows.length,
    1,
  );
  assert.equal(
    (await readAdminStreams(client, "public", null, 20, now)).rows.length,
    1,
  );
  const firstLive = await readAdminStreams(client, "all", null, 1, now);
  assert.ok(firstLive.nextCursor);
  const secondLive = await readAdminStreams(
    client,
    "all",
    Number(firstLive.nextCursor),
    1,
    now,
  );
  assert.notEqual(firstLive.rows[0].id, secondLive.rows[0].id);
  assert.equal(secondLive.nextCursor, null);
  assert.equal(
    (
      await readAdminStreams(
        client,
        "all",
        null,
        20,
        new Date(now.getTime() + 61000),
      )
    ).rows.length,
    0,
  );
  await client.query(`CREATE TEMP TABLE stream_reports(id serial,session_id integer,reason text,details text,status text,created_at timestamptz DEFAULT now()) ON COMMIT DROP;
    CREATE TEMP TABLE post_reports(id serial,reported_post_id integer,owner_user_id integer,reason text,details text,status text,created_at timestamptz DEFAULT now()) ON COMMIT DROP;
    CREATE TEMP TABLE user_reports(id serial,reported_uid integer,source text,reason text,details text,status text,created_at timestamptz DEFAULT now()) ON COMMIT DROP;`);
  await client.query(
    "INSERT INTO stream_reports(session_id,reason,details,status) VALUES(1,'spam','first','pending'),(1,'other','second','resolved')",
  );
  await client.query(
    "INSERT INTO post_reports(reported_post_id,owner_user_id,reason,details,status) VALUES(999,NULL,'spam','deleted post','pending'),(999,NULL,'other','second','resolved')",
  );
  await client.query(
    "INSERT INTO user_reports(reported_uid,source,reason,details,status) VALUES(1,'dm','spam','report text','pending'),(1,'profile','other','second','resolved')",
  );
  for (const kind of ["stream", "post", "user"]) {
    const pending = await readAdminReports(client, kind, "pending", null, 20);
    assert.equal(pending.rows.length, 1);
    assert.equal(pending.rows[0].status, "pending");
    assert.deepEqual(
      Object.keys(pending.rows[0]).sort(),
      [
        "id",
        "targetId",
        "ownerUid",
        "source",
        "reason",
        "details",
        "status",
        "createdAt",
      ].sort(),
    );
    const first = await readAdminReports(client, kind, "all", null, 1);
    assert.ok(first.nextCursor);
    const second = await readAdminReports(
      client,
      kind,
      "all",
      Number(first.nextCursor),
      1,
    );
    assert.notEqual(first.rows[0].id, second.rows[0].id);
    assert.equal(second.nextCursor, null);
  }
  assert.equal(
    (await readAdminReports(client, "post", "pending", null, 20)).rows[0]
      .ownerUid,
    null,
  );
  assert.equal(actual.totalUsers, 6);
  assert.equal(actual.verifiedAccounts, 1);
  assert.equal(actual.verifiedPercent, 16.7);
  assert.equal(actual.liveStreams, 2);
  assert.deepEqual(actual.newUsers, {
    current: 3,
    previous: 2,
    changePercent: 50,
  });
  assert.deepEqual(actual.coinsGifted, {
    current: 100,
    previous: 40,
    changePercent: 150,
  });
  assert.deepEqual(
    actual.growth.map((d) => d.count),
    [1, 0, 0, 1, 0, 0, 1],
  );
  assert.equal(
    actual.growth.reduce((sum, d) => sum + d.count, 0),
    actual.newUsers.current,
  );
  // Time-zone changes must not move day boundaries or alter counts.
  await client.query("SET LOCAL TIME ZONE 'Pacific/Honolulu'");
  assert.deepEqual(await readAdminOverview(client, now, "sandbox"), actual);
  // Durable active-stream counts require no process-local registry and naturally expire.
  assert.equal(
    (
      await readAdminOverview(
        client,
        new Date(now.getTime() + 61000),
        "sandbox",
      )
    ).liveStreams,
    0,
  );
  const midnight = await readAdminOverview(
    client,
    new Date("2026-09-13T00:00:00Z"),
    "sandbox",
  );
  assert.equal(midnight.growth.at(-1).count, 0);
  assert.equal(midnight.growth.length, 7);
  assert.equal(
    (await readAdminOverview(client, now, "live")).verifiedAccounts,
    1,
  );
  console.log(
    "PASS: overview zero data, UTC/end boundaries, equal-duration comparisons, seven daily buckets, verification environment, gifts-only totals, durable/public/private stream expiry, demo exclusion, database timezone independence.",
  );
} finally {
  await client.query("ROLLBACK");
  client.release();
  await pool.end();
  unlinkSync(out);
}
