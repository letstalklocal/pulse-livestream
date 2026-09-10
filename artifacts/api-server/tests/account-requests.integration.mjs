import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync, unlinkSync } from "node:fs";
import { build } from "esbuild";

const dir = fileURLToPath(new URL("..", import.meta.url));
const output = `${dir}/tests/.account-test-${randomUUID()}.cjs`;
await build({
  stdin: {
    contents: `export { default as account } from './src/routes/account'; export { pool } from '@workspace/db';`,
    resolveDir: dir,
  },
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["pg-native"],
  logLevel: "silent",
});
const { account, pool } = createRequire(import.meta.url)(output);
const prefix = `account-test-${randomUUID()}`;
const a = 1800000000 + Math.floor(Math.random() * 10000000),
  b = a + 1;
const call = async (method, uid, body = {}) => {
  const handler = account.stack.find(
    (l) =>
      l.route?.path === "/account/deletion-request" && l.route.methods[method],
  ).route.stack[0].handle;
  const res = {
    statusCode: 200,
    status(n) {
      this.statusCode = n;
      return this;
    },
    json(value) {
      this.body = value;
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
    },
    res,
  );
  return res;
};
try {
  await pool.query(
    readFileSync(
      new URL(
        "../../../lib/db/migrations/20260910_account_deletion_requests.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const uid of [a, b])
    await pool.query("insert into users(uid,clerk_id,name) values($1,$2,$3)", [
      uid,
      `${prefix}-${uid}`,
      `Account test ${uid}`,
    ]);
  for (const method of ["get", "post", "delete"])
    assert.equal(
      (await call(method, null, { confirmation: "DELETE" })).statusCode,
      401,
    );
  assert.equal((await call("get", b + 1)).statusCode, 404);
  assert.equal(
    (await call("post", a, { confirmation: "delete" })).statusCode,
    400,
  );
  assert.equal(
    (
      await call("post", a, {
        confirmation: "DELETE",
        reason: "x".repeat(2001),
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await call("post", a, { confirmation: "DELETE", reason: 10 })).statusCode,
    400,
  );
  assert.equal((await call("get", a)).body.balance, 0);

  await pool.query("insert into coin_balances(user_id,balance) values($1,25)", [
    a,
  ]);
  // Even a balance too small to spend must not prevent asking for manual review.
  for (const amount of [25, 1]) {
    await pool.query("update coin_balances set balance=$2 where user_id=$1", [
      a,
      amount,
    ]);
    const report = await call("post", a, { confirmation: "DELETE", uid: b });
    assert.equal(report.statusCode, 202);
    assert.equal((await call("get", a)).body.balance, amount);
    assert.equal(
      (
        await pool.query("select balance from coin_balances where user_id=$1", [
          a,
        ])
      ).rows[0].balance,
      amount,
    );
    await call("delete", a);
  }
  await pool.query("delete from account_deletion_requests where user_id=$1", [
    a,
  ]);
  await pool.query("update coin_balances set balance=0 where user_id=$1", [a]);

  const submitted = await Promise.all(
    Array.from({ length: 3 }, () =>
      call("post", a, {
        confirmation: "DELETE",
        reason: "  Please remove my account  ",
        uid: b,
      }),
    ),
  );
  assert.ok(submitted.every((r) => r.statusCode === 202));
  assert.equal(new Set(submitted.map((r) => r.body.request.id)).size, 1);
  const saved = (
    await pool.query(
      "select * from account_deletion_requests where user_id=$1",
      [a],
    )
  ).rows;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].reason, "Please remove my account");
  assert.equal((await call("get", b)).body.request, null);
  assert.equal((await call("get", a)).body.request.status, "pending");
  assert.equal(
    (await pool.query("select clerk_id from users where uid=$1", [a])).rows[0]
      .clerk_id,
    `${prefix}-${a}`,
  );
  await call("delete", b, { uid: a });
  assert.equal((await call("get", a)).body.request.status, "pending");
  await call("delete", a);
  assert.equal((await call("get", a)).body.request.status, "cancelled");
  assert.equal(
    (await call("post", a, { confirmation: "DELETE" })).statusCode,
    202,
  );
  await call("delete", a);

  // Receiving coins while requesting review must never spend or clear the balance.
  const credit = await pool.connect();
  try {
    await credit.query("begin");
    await credit.query("update coin_balances set balance=9 where user_id=$1", [
      a,
    ]);
    const request = call("post", a, { confirmation: "DELETE" });
    await credit.query("commit");
    assert.equal((await request).statusCode, 202);
  } finally {
    await credit.query("rollback");
    credit.release();
  }
  assert.equal((await call("get", a)).body.balance, 9);
  console.log(
    "Account request integration checks passed: authentication, ownership, validation, coins, concurrency, persistence, cancellation, and no automatic deletion.",
  );
} finally {
  await pool.query(
    "delete from account_deletion_requests where user_id=any($1::int[])",
    [[a, b]],
  );
  await pool.query("delete from coin_balances where user_id=any($1::int[])", [
    [a, b],
  ]);
  await pool.query("delete from users where uid=any($1::int[])", [[a, b]]);
  await pool.end();
  unlinkSync(output);
}
