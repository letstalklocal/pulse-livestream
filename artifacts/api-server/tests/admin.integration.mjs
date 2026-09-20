import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const root = fileURLToPath(new URL("..", import.meta.url)),
  id = randomUUID(),
  out = `${root}/tests/.admin-${id}.cjs`;
await build({
  stdin: {
    contents: `import express from 'express';import router from './src/routes/admin';export {pool} from '@workspace/db';export function testApp(){const app=express();app.use((req,res,next)=>{req.auth=()=>({userId:req.get('x-test-user')||null,sessionId:req.get('x-test-user')?'test-session':null,sessionClaims:{fva:req.get('x-test-mfa')?[0,0]:[0,-1]},tokenType:'session_token'});next();});app.get('/mobile-probe',(req,res)=>res.json({signedIn:!!req.auth().userId}));app.use('/admin-data',router);return app}`,
    resolveDir: root,
  },
  outfile: out,
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["pg-native"],
  logLevel: "silent",
});
const { pool, testApp } = createRequire(import.meta.url)(out),
  staff = "admin-test-" + id,
  other = "ordinary-test-" + id;
const uid = 1900000000 + Math.floor(Math.random() * 1000000),
  prefix = "admin-integration-" + id;
let server;
const priorEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "test";
try {
  await pool.query(
    "INSERT INTO admin_staff(clerk_user_id,role) VALUES($1,'owner')",
    [staff],
  );
  for (let i = 0; i < 3; i++)
    await pool.query(
      "INSERT INTO users(uid,clerk_id,name,country_code,created_at) VALUES($1,$2,$3,'ES','2026-01-01 12:00:00.123456')",
      [uid + i, i === 0 ? staff : other + i, prefix + " " + i],
    );
  const original = (await pool.query("SELECT * FROM users WHERE uid=$1", [uid]))
    .rows[0];
  await pool.query(
    "INSERT INTO identity_verifications(user_id,reference,environment,status,is_verified,verification_type,upgrade_status) VALUES($1,$2,$3,'verified',true,'selfie','pending')",
    [
      uid,
      randomUUID(),
      process.env.DIDIT_ENVIRONMENT === "live" ? "live" : "sandbox",
    ],
  );
  server = testApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, user = staff, extra = {}) => {
    const r = await fetch(base + "/admin-data" + path, {
      headers: {
        ...(user
          ? { Authorization: "Bearer test-token", "x-test-user": user }
          : {}),
        ...extra,
      },
    });
    return { status: r.status, body: await r.json(), headers: r.headers };
  };
  assert.equal((await call("/users", null)).status, 401);
  assert.equal(
    (await call("/users", null, { "x-test-user": staff })).status,
    401,
    "cookies without bearer do not authorize",
  );
  assert.equal((await call("/users", other)).status, 403);
  assert.equal((await call("/users/" + uid, other)).status, 403);
  assert.equal((await call("/session")).status, 200);
  assert.equal((await call("/overview", null)).status, 401);
  assert.equal((await call("/overview", other)).status, 403);
  const overview = await call("/overview");
  assert.equal(overview.status, 200);
  assert.equal(overview.headers.get("cache-control"), "no-store");
  assert.equal(overview.body.growth.length, 7);
  assert.equal(
    overview.body.growth.reduce((sum, day) => sum + day.count, 0),
    overview.body.newUsers.current,
  );
  assert.equal((await call("/overview?range=all")).status, 400);
  // Both queues enforce staff authorization and expose only operational summaries.
  for (const route of [
    "/account-removals",
    "/verification-reviews",
    "/live-streams",
    "/moderation",
  ]) {
    assert.equal((await call(route, null)).status, 401);
    assert.equal((await call(route, other)).status, 403);
    for (const query of [
      "limit=0",
      "limit=51",
      "cursor=bad",
      "cursor=2147483648",
      "extra=x",
    ])
      assert.equal((await call(route + "?" + query)).status, 400);
  }
  for (const route of ["/live-streams", "/moderation"]) {
    const result = await call(route);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.ok(Array.isArray(result.body.rows));
    assert.equal((await call(route + "?filter=bad")).status, 400);
  }
  const requestIds = [];
  for (const status of ["pending", "completed", "cancelled", "rejected"]) {
    const result = await pool.query(
      "INSERT INTO account_deletion_requests(user_id,status,reason,review_notes,reviewed_at) VALUES($1,$2,$3,$4,CASE WHEN $2='pending' THEN NULL ELSE now() END) RETURNING id",
      [uid, status, "<test reason>", "Internal test note"],
    );
    requestIds.push(result.rows[0].id);
  }
  for (const status of ["pending", "completed", "cancelled", "rejected"]) {
    const result = await call("/account-removals?status=" + status);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.ok(result.body.requests.every((r) => r.status === status));
  }
  let removalCursor,
    seen = [];
  do {
    const page = await call(
      "/account-removals?status=all&limit=2" +
        (removalCursor ? "&cursor=" + removalCursor : ""),
    );
    seen.push(...page.body.requests.map((r) => r.id));
    removalCursor = page.body.nextCursor;
  } while (removalCursor);
  assert.equal(seen.length, new Set(seen).size);
  assert.ok(requestIds.every((id) => seen.includes(id)));
  assert.equal((await call("/account-removals?status=deleted")).status, 400);
  await pool.query(
    "UPDATE identity_verifications SET upgrade_status='review_needed' WHERE user_id=$1",
    [uid],
  );
  await pool.query(
    "INSERT INTO identity_verifications(user_id,reference,environment,status) VALUES($1,$2,$3,'review_needed'),($4,$5,$3,'pending')",
    [
      uid + 1,
      randomUUID(),
      process.env.DIDIT_ENVIRONMENT === "live" ? "live" : "sandbox",
      uid + 2,
      randomUUID(),
    ],
  );
  const reviews = await call("/verification-reviews");
  assert.equal(reviews.status, 200);
  assert.equal(reviews.headers.get("cache-control"), "no-store");
  assert.ok(
    reviews.body.reviews.some(
      (r) => r.uid === uid && r.isVerified && r.method === "selfie",
    ),
  );
  assert.ok(reviews.body.reviews.some((r) => r.uid === uid + 1));
  assert.ok(!reviews.body.reviews.some((r) => r.uid === uid + 2));
  assert.ok(
    (await call("/verification-reviews?kind=initial")).body.reviews.every(
      (r) => r.status === "review_needed",
    ),
  );
  assert.ok(
    (await call("/verification-reviews?kind=upgrade")).body.reviews.every(
      (r) => r.upgradeStatus === "review_needed",
    ),
  );
  const reviewPage = await call("/verification-reviews?limit=1");
  assert.ok(reviewPage.body.nextCursor);
  const nextReview = await call(
    "/verification-reviews?limit=1&cursor=" + reviewPage.body.nextCursor,
  );
  assert.notEqual(
    reviewPage.body.reviews[0].uid,
    nextReview.body.reviews[0].uid,
  );
  assert.deepEqual(
    Object.keys(reviews.body.reviews.find((r) => r.uid === uid)).sort(),
    [
      "checkedAt",
      "isVerified",
      "method",
      "name",
      "status",
      "uid",
      "updatedAt",
      "upgradeCheckedAt",
      "upgradeStatus",
    ].sort(),
  );
  await pool.query(
    "UPDATE identity_verifications SET environment=$2 WHERE user_id=$1",
    [uid + 1, process.env.DIDIT_ENVIRONMENT === "live" ? "sandbox" : "live"],
  );
  assert.ok(
    !(await call("/verification-reviews")).body.reviews.some(
      (r) => r.uid === uid + 1,
    ),
  );
  await pool.query(
    "DELETE FROM identity_verifications WHERE user_id IN ($1,$2)",
    [uid + 1, uid + 2],
  );
  await pool.query(
    "UPDATE identity_verifications SET upgrade_status='pending' WHERE user_id=$1",
    [uid],
  );
  for (const action of [
    "account-removals.list",
    "verification-reviews.list",
    "live-streams.list",
    "moderation.list",
  ]) {
    assert.ok(
      Number(
        (
          await pool.query(
            "SELECT count(*) FROM admin_audit_events WHERE actor_clerk_id=$1 AND action=$2",
            [staff, action],
          )
        ).rows[0].count,
      ) > 0,
    );
  }
  const first = await call("/users?q=" + prefix + "&limit=2");
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.equal(first.body.users.length, 2);
  assert.ok(first.body.nextCursor);
  const second = await call(
    "/users?q=" + prefix + "&limit=2&cursor=" + first.body.nextCursor,
  );
  assert.equal(second.body.users.length, 1);
  assert.equal(second.body.nextCursor, null);
  assert.equal(
    new Set([...first.body.users, ...second.body.users].map((u) => u.uid)).size,
    3,
    "keyset pagination retains timestamp precision",
  );
  const verified = await call("/users?q=" + prefix + "&status=verified");
  assert.equal(verified.body.users.length, 1);
  assert.equal(verified.body.users[0].verification.method, "selfie");
  assert.equal(verified.body.users[0].verification.upgradeStatus, "pending");
  const unverified = await call("/users?q=" + prefix + "&status=unverified");
  assert.equal(unverified.body.users.length, 2);
  const detail = await call("/users/" + uid);
  assert.deepEqual(Object.keys(detail.body).sort(), [
    "countryCode",
    "createdAt",
    "name",
    "uid",
    "verification",
  ]);
  assert.equal(JSON.stringify(detail.body).includes("sessionUrl"), false);
  for (const path of [
    "/users?limit=500",
    "/users?limit=2x",
    "/users?q[x]=a",
    "/users?status=bogus",
    "/users?cursor=bogus",
    "/users/1x",
  ])
    assert.equal((await call(path)).status, 400, path);
  assert.equal(
    (await call("/users?q=" + encodeURIComponent("' OR 1=1 --"))).body.users
      .length,
    0,
  );
  assert.equal(
    (await call("/users?q=" + encodeURIComponent("%"))).body.users.length,
    0,
    "wildcards are literal",
  );
  assert.equal((await call("/users/2147483647")).status, 404);
  process.env.NODE_ENV = "production";
  assert.equal((await call("/session")).status, 403);
  assert.equal(
    (await call("/session", staff, { "x-test-mfa": "yes" })).status,
    200,
  );
  for (const route of [
    "/account-removals",
    "/verification-reviews",
    "/live-streams",
    "/moderation",
  ]) {
    assert.equal((await call(route)).status, 403);
    assert.equal(
      (await call(route, staff, { "x-test-mfa": "yes" })).status,
      200,
    );
  }
  process.env.NODE_ENV = "test";
  await pool.query(
    "UPDATE admin_staff SET enabled=false WHERE clerk_user_id=$1",
    [staff],
  );
  assert.equal(
    (await call("/users")).status,
    403,
    "disabled staff immediately denied",
  );
  for (const route of [
    "/account-removals",
    "/verification-reviews",
    "/live-streams",
    "/moderation",
  ])
    assert.equal((await call(route)).status, 403);
  const mobile = await fetch(base + "/mobile-probe", {
    headers: { "x-test-user": staff },
  });
  assert.equal(
    (await mobile.json()).signedIn,
    true,
    "staff removal does not alter ordinary authentication",
  );
  assert.deepEqual(
    (await pool.query("SELECT * FROM users WHERE uid=$1", [uid])).rows[0],
    original,
    "admin reads and membership removal leave mobile profile unchanged",
  );
  assert.ok(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM admin_audit_events WHERE actor_clerk_id=$1 AND action='users.view'",
          [staff],
        )
      ).rows[0].count,
    ) > 0,
  );
  console.log(
    "PASS: auth isolation, staff removal, production-only MFA, search, filters, precise pagination, validation, response field allowlist, audit, unchanged ordinary profile.",
  );
} finally {
  process.env.NODE_ENV = priorEnv;
  if (server) await new Promise((r) => server.close(r));
  await pool.query(
    "DELETE FROM admin_audit_events WHERE actor_clerk_id=ANY($1)",
    [[staff, other]],
  );
  await pool.query("DELETE FROM admin_staff WHERE clerk_user_id=$1", [staff]);
  await pool.query(
    "DELETE FROM account_deletion_requests WHERE user_id BETWEEN $1 AND $2",
    [uid, uid + 2],
  );
  await pool.query("DELETE FROM users WHERE uid BETWEEN $1 AND $2", [
    uid,
    uid + 2,
  ]);
  await pool.end();
  unlinkSync(out);
}
