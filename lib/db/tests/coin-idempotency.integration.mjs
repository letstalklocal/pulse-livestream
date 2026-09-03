import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";

const { Pool } = pg;
const rootDir = new URL("../../..", import.meta.url);
const port = 18_000 + (process.pid % 1_000);
const senderUid = 1_900_000_000 + (process.pid % 50_000) * 2;
const recipientUid = senderUid + 1;
const idempotencyKey = `coin-idempotency-${randomUUID()}`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let server;
let serverOutput = "";

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/healthz`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await delay(250);
  }
  throw new Error("API server did not become ready");
}

async function spend() {
  const response = await fetch(`http://127.0.0.1:${port}/api/coins/spend`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      uid: senderUid,
      recipientUid,
      amount: 25,
      giftName: "Retry Check",
      senderName: "Integration Test",
      description: "idempotency integration test",
      idempotencyKey,
    }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function cleanup() {
  await pool.query("DELETE FROM coin_transactions WHERE idempotency_key = $1", [idempotencyKey]);
  await pool.query("DELETE FROM coin_balances WHERE user_id = ANY($1::int[])", [[senderUid, recipientUid]]);
  await pool.query("DELETE FROM users WHERE uid = ANY($1::int[])", [[senderUid, recipientUid]]);
}

try {
  await cleanup();
  await pool.query(
    `INSERT INTO users (uid, name, bio, followers_count, following_count)
     VALUES ($1, 'Idempotency Sender', '', 0, 0),
            ($2, 'Idempotency Recipient', '', 0, 0)`,
    [senderUid, recipientUid],
  );
  await pool.query(
    `INSERT INTO coin_balances (user_id, balance)
     VALUES ($1, 100), ($2, 10)`,
    [senderUid, recipientUid],
  );

  server = spawn(
    "node",
    ["artifacts/api-server/dist/index.mjs"],
    {
      cwd: rootDir,
      env: { ...process.env, PORT: String(port), NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  server.stdout.on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.on("data", (chunk) => { serverOutput += chunk; });

  await waitForServer();

  const [first, second] = await Promise.all([spend(), spend()]);
  const laterRetry = await spend();
  assert.deepEqual(first, { balance: 75 });
  assert.deepEqual(second, first);
  assert.deepEqual(laterRetry, first);

  const result = await pool.query(
    `SELECT
       (SELECT balance FROM coin_balances WHERE user_id = $1) AS sender_balance,
       (SELECT balance FROM coin_balances WHERE user_id = $2) AS recipient_balance,
       (SELECT count(*)::int FROM coin_transactions WHERE idempotency_key = $3) AS ledger_rows`,
    [senderUid, recipientUid, idempotencyKey],
  );

  assert.deepEqual(result.rows[0], {
    sender_balance: 75,
    recipient_balance: 35,
    ledger_rows: 1,
  });
  console.log("Coin idempotency integration test passed");
} catch (error) {
  if (server) {
    console.error("API server output:\n", serverOutput);
  }
  throw error;
} finally {
  if (server) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      delay(2_000),
    ]);
  }
  await cleanup();
  await pool.end();
}