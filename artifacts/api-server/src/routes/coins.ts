import { Router } from "express";
import { eq, sql, and, inArray } from "drizzle-orm";
import { db, coinBalancesTable, coinTransactionsTable } from "@workspace/db";
import * as wsHub from "../lib/wsHub";

const router = Router();

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
  const { uid, recipientUid, amount, giftName, senderName, channelId, description } = req.body as {
    uid?: number;
    recipientUid?: number;
    amount?: number;
    giftName?: string;
    senderName?: string;
    channelId?: string;
    description?: string;
  };

  if (!uid || typeof uid !== "number") {
    res.status(400).json({ error: "uid is required" });
    return;
  }
  if (!amount || typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" });
    return;
  }

  const current = await getOrCreateBalance(uid);
  if (current < amount) {
    res.status(402).json({ error: "Insufficient coins", balance: current });
    return;
  }

  // Deduct from sender
  const updated = await db
    .update(coinBalancesTable)
    .set({ balance: sql`${coinBalancesTable.balance} - ${amount}`, updatedAt: new Date() })
    .where(eq(coinBalancesTable.userId, uid))
    .returning();

  // Credit recipient (streamer) if provided
  if (recipientUid && typeof recipientUid === "number" && recipientUid !== uid) {
    await getOrCreateBalance(recipientUid);
    await db
      .update(coinBalancesTable)
      .set({ balance: sql`${coinBalancesTable.balance} + ${amount}`, updatedAt: new Date() })
      .where(eq(coinBalancesTable.userId, recipientUid));
  }

  // Single unified transaction row — captures both sides, channel, and gift name
  await db.insert(coinTransactionsTable).values({
    fromUserId:  uid,
    toUserId:    recipientUid ?? null,
    amount,
    type:        "gift",
    giftName:    giftName ?? null,
    channelId:   channelId ?? null,
    description: description ?? "",
  });

  // Push updated earnings total to broadcaster's WebSocket immediately
  if (channelId) {
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
  }

  res.json({ balance: updated[0]?.balance ?? current - amount });
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

  await getOrCreateBalance(uid);

  const updated = await db
    .update(coinBalancesTable)
    .set({ balance: sql`${coinBalancesTable.balance} + ${amount}`, updatedAt: new Date() })
    .where(eq(coinBalancesTable.userId, uid))
    .returning();

  await db.insert(coinTransactionsTable).values({
    fromUserId:  null,
    toUserId:    uid,
    amount,
    type:        "grant",
    giftName:    null,
    channelId:   null,
    description: note ?? "manual grant",
  });

  res.json({ balance: updated[0]?.balance ?? amount });
});

export default router;
