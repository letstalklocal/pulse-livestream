import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, coinTransactionsTable as ledger, usersTable } from "@workspace/db";

const router = Router();

// Owner-only earnings. Range boundaries are UTC instants for the phone's local calendar.
router.get("/earnings", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const start =
    typeof req.query.start === "string"
      ? new Date(req.query.start)
      : new Date(NaN);
  const end =
    typeof req.query.end === "string" ? new Date(req.query.end) : new Date(NaN);
  const duration = end.getTime() - start.getTime();
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 367 * 86400000
  ) {
    res
      .status(400)
      .json({ error: "A valid date range of at most one year is required" });
    return;
  }
  const [owner] = await db
    .select({ uid: usersTable.uid })
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId))
    .limit(1);
  if (!owner) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  const filter = and(
    eq(ledger.toUserId, owner.uid),
    eq(ledger.type, "gift"),
    gte(ledger.createdAt, start),
    lt(ledger.createdAt, end),
  );
  // One grouped query keeps the summary and ranking consistent during incoming gifts.
  const rows = await db
    .select({
      uid: ledger.fromUserId,
      name: usersTable.name,
      coins: sql<string>`sum(${ledger.amount})`,
      transactions: sql<string>`count(*)`,
    })
    .from(ledger)
    .leftJoin(usersTable, eq(ledger.fromUserId, usersTable.uid))
    .where(filter)
    .groupBy(ledger.fromUserId, usersTable.name)
    .orderBy(sql`sum(${ledger.amount}) desc`, ledger.fromUserId);
  const entries = rows.map((row, index) => ({
    rank: index + 1,
    uid: row.uid,
    name: row.name ?? "Unknown supporter",
    coins: Number(row.coins),
    transactions: Number(row.transactions),
  }));
  res.json({
    coins: entries.reduce((total, row) => total + row.coins, 0),
    transactions: entries.reduce((total, row) => total + row.transactions, 0),
    supporters: entries.filter((row) => row.uid !== null).length,
    entries: entries.slice(0, 20),
  });
});

export default router;
