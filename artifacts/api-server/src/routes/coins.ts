import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq, sql, and, inArray } from "drizzle-orm";
import { db, coinBalancesTable, coinTransactionsTable, usersTable } from "@workspace/db";
import * as wsHub from "../lib/wsHub";
import { requireChannelAccess } from "../lib/privateChannelAccess";

const router = Router();

class IdempotencyConflictError extends Error {}

async function getOrCreateBalance(userId: number): Promise<number> {
  await db
    .insert(coinBalancesTable)
    .values({ userId, balance: 0 })
    .onConflictDoNothing();

  const rows = await db
    .select()
    .from(coinBalancesTable)
    .where(eq(coinBalancesTable.userId, userId))
    .limit(1);

  return rows[0]?.balance ?? 0;
}

// GET /streams/:channelId/leaderboard — top gifters for a stream
router.get("/streams/:channelId/leaderboard", async (req, res) => {
  const channelId = req.params["channelId"] ?? "";
  if (!await requireChannelAccess(req, res, channelId)) return;
  const rows = await db
    .select({
      uid: coinTransactionsTable.fromUserId,
      coins: sql<number>`cast(sum(${coinTransactionsTable.amount}) as int)`,
    })
    .from(coinTransactionsTable)
    .where(
      and(
        eq(coinTransactionsTable.channelId, channelId),
        eq(coinTransactionsTable.type, "gift"),
      ),
    )
    .groupBy(coinTransactionsTable.fromUserId)
    .orderBy(sql`sum(${coinTransactionsTable.amount}) desc`)
    .limit(10);

  // Fetch names for all uids in one query
  const uids = rows.map((r) => r.uid).filter((u): u is number => u !== null);
  const { usersTable } = await import("@workspace/db");
  const userRows = uids.length
    ? await db.select({ uid: usersTable.uid, name: usersTable.name }).from(usersTable).where(inArray(usersTable.uid, uids))
    : [];
  const nameMap = new Map(userRows.map((u) => [u.uid, u.name]));

  const entries = rows
    .filter((r) => r.uid !== null)
    .map((r, i) => ({
      rank: i + 1,
      uid: r.uid as number,
      name: nameMap.get(r.uid as number) ?? "Viewer",
      coins: Number(r.coins),
    }));

  res.json({ entries });
});

// GET /streams/:channelId/earnings — total coins gifted during a specific stream
router.get("/streams/:channelId/earnings", async (req, res) => {
  const channelId = req.params["channelId"] ?? "";
  if (!await requireChannelAccess(req, res, channelId)) return;
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${coinTransactionsTable.amount}), 0)` })
    .from(coinTransactionsTable)
    .where(
      and(
        eq(coinTransactionsTable.channelId, channelId),
        eq(coinTransactionsTable.type, "gift"),
      ),
    );
  res.json({ coins: Number(rows[0]?.total ?? 0) });
});

// GET /coins/balance?uid=123
router.get("/coins/balance", async (req, res) => {
  const uid = parseInt(String(req.query["uid"] ?? ""), 10);
  if (isNaN(uid)) {
    res.status(400).json({ error: "uid query param required" });
    return;
  }
  const balance = await getOrCreateBalance(uid);
  res.json({ balance });
});

// POST /coins/spend
router.post("/coins/spend", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const { uid, recipientUid, amount, giftName, senderName, channelId, description, idempotencyKey } = req.body as {
    uid?: number;
    recipientUid?: number;
    amount?: number;
    giftName?: string;
    senderName?: string;
    channelId?: string;
    description?: string;
    idempotencyKey?: string;
  };

  if (!uid || typeof uid !== "number") {
    res.status(400).json({ error: "uid is required" });
    return;
  }
  const [sender] = await db.select({ uid: usersTable.uid })
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId))
    .limit(1);
  if (!sender || sender.uid !== uid) {
    res.status(403).json({ error: "You can only spend your own coins" });
    return;
  }
  if (!amount || typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" });
    return;
  }
  if (!idempotencyKey || typeof idempotencyKey !== "string" || idempotencyKey.length > 100) {
    res.status(400).json({ error: "idempotencyKey is required and must be at most 100 characters" });
    return;
  }
  if (channelId && !await requireChannelAccess(req, res, channelId)) return;

  const effectiveRecipientUid =
    typeof recipientUid === "number" && recipientUid !== uid ? recipientUid : null;

  let transfer: { balance: number; duplicate: boolean } | null;
  try {
    transfer = await db.transaction(async (tx) => {
      // Serialize retries for the same key, including the race where both
      // requests arrive before either one inserts its ledger row.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${idempotencyKey}))`);

      const existing = await tx
        .select()
        .from(coinTransactionsTable)
        .where(eq(coinTransactionsTable.idempotencyKey, idempotencyKey))
        .limit(1);
      if (existing[0]) {
        const sameRequest =
          existing[0].type === "gift" &&
          existing[0].fromUserId === uid &&
          existing[0].toUserId === effectiveRecipientUid &&
          existing[0].amount === amount &&
          existing[0].channelId === (channelId ?? null);
        if (!sameRequest) throw new IdempotencyConflictError();

        const currentBalance = existing[0].balanceAfter == null
          ? await tx
              .select({ balance: coinBalancesTable.balance })
              .from(coinBalancesTable)
              .where(eq(coinBalancesTable.userId, uid))
              .limit(1)
          : [];
        return {
          balance: existing[0].balanceAfter ?? currentBalance[0]?.balance ?? 0,
          duplicate: true,
        };
      }

      // Keep the row creation inside the transaction so every balance operation
      // uses the same atomic unit of work.
      await tx
        .insert(coinBalancesTable)
        .values({ userId: uid, balance: 0 })
        .onConflictDoNothing();

      // The balance predicate is evaluated while PostgreSQL locks this row.
      // Concurrent gifts therefore cannot both spend the same coins.
      const updated = await tx
        .update(coinBalancesTable)
        .set({ balance: sql`${coinBalancesTable.balance} - ${amount}`, updatedAt: new Date() })
        .where(and(
          eq(coinBalancesTable.userId, uid),
          sql`${coinBalancesTable.balance} >= ${amount}`,
        ))
        .returning();

      if (!updated[0]) return null;

      if (effectiveRecipientUid) {
        await tx
          .insert(coinBalancesTable)
          .values({ userId: effectiveRecipientUid, balance: 0 })
          .onConflictDoNothing();
        await tx
          .update(coinBalancesTable)
          .set({ balance: sql`${coinBalancesTable.balance} + ${amount}`, updatedAt: new Date() })
          .where(eq(coinBalancesTable.userId, effectiveRecipientUid));
      }

      // The ledger row commits or rolls back with both balance changes.
      await tx.insert(coinTransactionsTable).values({
        fromUserId:  uid,
        toUserId:    effectiveRecipientUid,
        amount,
        type:        "gift",
        giftName:    giftName ?? null,
        channelId:   channelId ?? null,
        description: description ?? "",
        idempotencyKey,
        balanceAfter: updated[0].balance,
      });

      return { balance: updated[0].balance, duplicate: false };
    });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      res.status(409).json({ error: "This idempotency key was already used for a different gift." });
      return;
    }
    req.log.error({ err: error }, "Gift transaction failed");
    res.status(500).json({ error: "Gift could not be completed. No balances were changed." });
    return;
  }

  if (!transfer) {
    const current = await getOrCreateBalance(uid);
    res.status(402).json({ error: "Insufficient coins", balance: current });
    return;
  }

  // Push updated earnings total to broadcaster's WebSocket immediately
  if (channelId && !transfer.duplicate) {
    try {
      const rows = await db
        .select({ total: sql<number>`coalesce(sum(${coinTransactionsTable.amount}), 0)` })
        .from(coinTransactionsTable)
        .where(
          and(
            eq(coinTransactionsTable.channelId, channelId),
            eq(coinTransactionsTable.type, "gift"),
          ),
        );
      const total = Number(rows[0]?.total ?? 0);
      wsHub.pushEarnings(channelId, total);
      wsHub.pushGift(channelId, giftName ?? "", senderName ?? "Viewer", total);
    } catch (error) {
      // The transfer is already committed. A notification failure must not
      // cause the client to retry and charge the sender a second time.
      req.log.warn({ err: error }, "Gift notification failed after commit");
    }
  }

  res.json({ balance: transfer.balance });
});

// POST /coins/grant  (dev / manual testing — no payment required)
router.post("/coins/grant", async (req, res) => {
  const { uid, amount, note } = req.body as {
    uid?: number;
    amount?: number;
    note?: string;
  };
  if (!uid || typeof uid !== "number") {
    res.status(400).json({ error: "uid is required" });
    return;
  }
  if (!amount || typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" });
    return;
  }

  try {
    const balance = await db.transaction(async (tx) => {
      await tx
        .insert(coinBalancesTable)
        .values({ userId: uid, balance: 0 })
        .onConflictDoNothing();

      const updated = await tx
        .update(coinBalancesTable)
        .set({ balance: sql`${coinBalancesTable.balance} + ${amount}`, updatedAt: new Date() })
        .where(eq(coinBalancesTable.userId, uid))
        .returning();

      await tx.insert(coinTransactionsTable).values({
        fromUserId:  null,
        toUserId:    uid,
        amount,
        type:        "grant",
        giftName:    null,
        channelId:   null,
        description: note ?? "manual grant",
        balanceAfter: updated[0]?.balance ?? amount,
      });

      return updated[0]?.balance ?? amount;
    });

    res.json({ balance });
  } catch (error) {
    req.log.error({ err: error }, "Grant transaction failed");
    res.status(500).json({ error: "Coins could not be granted. No balance was changed." });
  }
});

export default router;
