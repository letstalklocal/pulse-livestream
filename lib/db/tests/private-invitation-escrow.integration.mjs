import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const baseUid = 1_700_000_000 + (process.pid % 50_000) * 2;
const streamerUid = baseUid;
const viewerUid = baseUid + 1;
const amount = 50;
const invitationIds = [];

async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function createInvitation({ stale = false } = {}) {
  const channelId = `escrow-race-${randomUUID()}`;
  const { rows: [invitation] } = await pool.query(
    `INSERT INTO private_stream_invitations
      (streamer_user_id, invited_user_id, channel_id, title, background_object_path,
       status, required_gift_id, required_gift_name, required_gift_amount,
       payment_status, expires_at, paid_at, accepted_at)
     VALUES ($1, $2, $3, 'Race test', 'test/background', 'pending',
       'diamond', 'Diamond', $4, 'pending', now() + interval '10 minutes', NULL, NULL)
     RETURNING id`,
    [streamerUid, viewerUid, channelId, amount],
  );
  invitationIds.push(invitation.id);
  if (stale) await accept(invitation.id, true);
  return { id: invitation.id, channelId };
}

async function accept(id, stale = false) {
  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [id]);
    const { rows: [invite] } = await client.query(
      "SELECT * FROM private_stream_invitations WHERE id = $1", [id],
    );
    if (!invite || invite.status !== "pending") return false;
    const { rows: [balance] } = await client.query(
      `UPDATE coin_balances SET balance = balance - $1, updated_at = now()
       WHERE user_id = $2 AND balance >= $1 RETURNING balance`,
      [amount, viewerUid],
    );
    if (!balance) return false;
    await client.query(
      `INSERT INTO coin_transactions
       (from_user_id, amount, type, gift_name, channel_id, description, idempotency_key, balance_after)
       VALUES ($1, $2, 'private_invitation_hold', 'Diamond', $3, 'Private invitation escrow hold', $4, $5)`,
      [viewerUid, amount, invite.channel_id, `private-invitation:${id}:hold`, balance.balance],
    );
    await client.query(
      `UPDATE private_stream_invitations
       SET status = 'accepted', payment_status = 'paid', accepted_at = now(),
           paid_at = ${stale ? "now() - interval '6 minutes'" : "now()"}, updated_at = now()
       WHERE id = $1 AND status = 'pending'`,
      [id],
    );
    return true;
  });
}

async function finish(id, outcome) {
  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [id]);
    const { rows: [invite] } = await client.query(
      "SELECT * FROM private_stream_invitations WHERE id = $1", [id],
    );
    if (!invite || invite.status !== "accepted") return false;
    const isSettlement = outcome === "settlement";
    const ledgerOutcome = isSettlement ? "settlement" : "refund";
    const key = `private-invitation:${id}:${ledgerOutcome}`;
    const { rows: [ledger] } = await client.query(
      `INSERT INTO coin_transactions
       (from_user_id, to_user_id, amount, type, gift_name, channel_id, description, idempotency_key)
       VALUES (NULL, $1, $2, $3, 'Diamond', $4, $5, $6)
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [
        isSettlement ? streamerUid : viewerUid,
        amount,
        `private_invitation_${ledgerOutcome}`,
        invite.channel_id,
        `Private invitation escrow ${ledgerOutcome}`,
        key,
      ],
    );
    if (!ledger) return false;
    const recipient = isSettlement ? streamerUid : viewerUid;
    const { rows: [balance] } = await client.query(
      "UPDATE coin_balances SET balance = balance + $1, updated_at = now() WHERE user_id = $2 RETURNING balance",
      [amount, recipient],
    );
    await client.query("UPDATE coin_transactions SET balance_after = $1 WHERE id = $2", [balance.balance, ledger.id]);
    await client.query(
      `UPDATE private_stream_invitations SET status = $2, payment_status = $3,
       started_at = CASE WHEN $2 = 'active' THEN now() ELSE started_at END,
       refunded_at = CASE WHEN $2 <> 'active' THEN now() ELSE refunded_at END,
       updated_at = now() WHERE id = $1 AND status = 'accepted'`,
      [id, isSettlement ? "active" : outcome === "cancel" ? "cancelled" : "expired", isSettlement ? "settled" : "refunded"],
    );
    return true;
  });
}

async function assertOutcome(id, expected) {
  const { rows: [row] } = await pool.query(
    `SELECT
      (SELECT balance FROM coin_balances WHERE user_id = $1) viewer_balance,
      (SELECT balance FROM coin_balances WHERE user_id = $2) streamer_balance,
      count(*) FILTER (WHERE type = 'private_invitation_hold')::int holds,
      count(*) FILTER (WHERE type = 'private_invitation_settlement')::int settlements,
      count(*) FILTER (WHERE type = 'private_invitation_refund')::int refunds
     FROM coin_transactions WHERE idempotency_key LIKE $3`,
    [viewerUid, streamerUid, `private-invitation:${id}:%`],
  );
  assert.deepEqual(row, expected);
}

async function resetBalances() {
  await pool.query("UPDATE coin_balances SET balance = CASE WHEN user_id = $1 THEN 100 ELSE 10 END WHERE user_id = ANY($2::int[])", [viewerUid, [viewerUid, streamerUid]]);
}

async function cleanup() {
  if (invitationIds.length) {
    await pool.query("DELETE FROM coin_transactions WHERE idempotency_key LIKE ANY($1::text[])", [invitationIds.map((id) => `private-invitation:${id}:%`)]);
    await pool.query("DELETE FROM private_stream_invitations WHERE id = ANY($1::int[])", [invitationIds]);
  }
  await pool.query("DELETE FROM coin_balances WHERE user_id = ANY($1::int[])", [[viewerUid, streamerUid]]);
  await pool.query("DELETE FROM users WHERE uid = ANY($1::int[])", [[viewerUid, streamerUid]]);
}

try {
  await cleanup();
  await pool.query(
    `INSERT INTO users (uid, name, bio, followers_count, following_count)
     VALUES ($1, 'Escrow Streamer', '', 0, 0), ($2, 'Escrow Viewer', '', 0, 0)`,
    [streamerUid, viewerUid],
  );
  await pool.query("INSERT INTO coin_balances (user_id, balance) VALUES ($1, 10), ($2, 100)", [streamerUid, viewerUid]);

  const accepted = await createInvitation();
  assert.equal((await Promise.all(Array.from({ length: 8 }, () => accept(accepted.id)))).filter(Boolean).length, 1);
  await assertOutcome(accepted.id, { viewer_balance: 50, streamer_balance: 10, holds: 1, settlements: 0, refunds: 0 });

  await resetBalances();
  const expiryRace = await createInvitation({ stale: true });
  const expiryResults = await Promise.all([finish(expiryRace.id, "settlement"), finish(expiryRace.id, "refund")]);
  assert.equal(expiryResults.filter(Boolean).length, 1);
  const expiryWinner = expiryResults[0] ? "settlement" : "refund";
  await assertOutcome(expiryRace.id, expiryWinner === "settlement"
    ? { viewer_balance: 50, streamer_balance: 60, holds: 1, settlements: 1, refunds: 0 }
    : { viewer_balance: 100, streamer_balance: 10, holds: 1, settlements: 0, refunds: 1 });

  await resetBalances();
  const cancelRace = await createInvitation();
  assert.equal(await accept(cancelRace.id), true);
  const cancelResults = await Promise.all([finish(cancelRace.id, "settlement"), finish(cancelRace.id, "cancel")]);
  assert.equal(cancelResults.filter(Boolean).length, 1);
  const cancelWinner = cancelResults[0] ? "settlement" : "refund";
  await assertOutcome(cancelRace.id, cancelWinner === "settlement"
    ? { viewer_balance: 50, streamer_balance: 60, holds: 1, settlements: 1, refunds: 0 }
    : { viewer_balance: 100, streamer_balance: 10, holds: 1, settlements: 0, refunds: 1 });

  await resetBalances();
  const refunds = await createInvitation();
  assert.equal(await accept(refunds.id), true);
  await Promise.all(Array.from({ length: 12 }, () => finish(refunds.id, "refund")));
  await Promise.all(Array.from({ length: 12 }, () => finish(refunds.id, "refund")));
  await assertOutcome(refunds.id, { viewer_balance: 100, streamer_balance: 10, holds: 1, settlements: 0, refunds: 1 });

  console.log("Private invitation escrow concurrency integration tests passed");
} finally {
  await cleanup();
  await pool.end();
}