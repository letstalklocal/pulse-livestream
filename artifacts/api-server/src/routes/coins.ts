import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, coinBalancesTable, coinTransactionsTable } from "@workspace/db";

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
  const { uid, amount, description } = req.body as {
    uid?: number;
    amount?: number;
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

  const updated = await db
    .update(coinBalancesTable)
    .set({ balance: sql`${coinBalancesTable.balance} - ${amount}`, updatedAt: new Date() })
    .where(eq(coinBalancesTable.userId, uid))
    .returning();

  await db.insert(coinTransactionsTable).values({
    userId: uid,
    amount: -amount,
    type: "spend",
    description: description ?? "",
  });

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
    userId: uid,
    amount,
    type: "grant",
    description: note ?? "manual grant",
  });

  res.json({ balance: updated[0]?.balance ?? amount });
});

export default router;
