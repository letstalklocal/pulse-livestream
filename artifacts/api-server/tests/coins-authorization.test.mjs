import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { transformSync } from "esbuild";

const require = createRequire(import.meta.url);
const { code } = transformSync(readFileSync(new URL("../src/routes/coins.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" });

// Execute the real route and Clerk getAuth, replacing only database and channel I/O.
function fixture(clerkId, senderUid) {
  let lookups = 0;
  let transfers = 0;
  const dbModule = {
    usersTable: { uid: "uid", clerkId: "clerkId" },
    coinBalancesTable: {}, coinTransactionsTable: {},
    db: {
      select() {
        lookups++;
        return { from: () => ({ where: () => ({ limit: async () => senderUid == null ? [] : [{ uid: senderUid }] }) }) };
      },
      async transaction() { transfers++; return { balance: 75, duplicate: true }; },
    },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((id) => {
    if (id === "@workspace/db") return dbModule;
    if (id === "../lib/wsHub") return {};
    if (id === "../lib/liveParty") return {};
    if (id === "../lib/userSafety") return { requireContactAllowed: async () => true };
    if (id === "../lib/privateChannelAccess") return { requireChannelAccess: async () => true };
    return require(id);
  }, module, module.exports);
  const handler = module.exports.default.stack.find((layer) => layer.route?.path === "/coins/spend").route.stack[0].handle;
  const req = {
    auth: () => ({ userId: clerkId, tokenType: "session_token" }),
    body: { uid: 123, recipientUid: 456, amount: 25, idempotencyKey: "test-gift" },
  };
  const res = { statusCode: 200, body: null, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; } };
  return { run: () => handler(req, res), res, counts: () => ({ lookups, transfers }) };
}

for (const [name, clerkId, senderUid, expected] of [
  ["signed-out caller", null, 123, 401],
  ["another user's UID", "user_attacker", 999, 403],
  ["Clerk user without a local profile", "user_unsynced", null, 403],
  ["authenticated owner", "user_owner", 123, 200],
]) {
  test(name, async () => {
    const f = fixture(clerkId, senderUid);
    await f.run();
    assert.equal(f.res.statusCode, expected);
    assert.equal(f.counts().transfers, expected === 200 ? 1 : 0);
    if (!clerkId) assert.equal(f.counts().lookups, 0);
    if (expected === 200) assert.deepEqual(f.res.body, { balance: 75 });
  });
}
