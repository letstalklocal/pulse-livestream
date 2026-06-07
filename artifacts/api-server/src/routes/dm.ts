import { Router } from "express";
import { or, and, eq, asc, desc } from "drizzle-orm";
import { db, directMessagesTable, usersTable } from "@workspace/db";

const router = Router();

// POST /dm/send — persist a DM to the DB
router.post("/dm/send", async (req, res) => {
  const { fromUid, toUid, text } = req.body as {
    fromUid?: unknown;
    toUid?: unknown;
    text?: unknown;
  };

  const from = typeof fromUid === "number" ? fromUid : parseInt(String(fromUid ?? ""), 10);
  const to = typeof toUid === "number" ? toUid : parseInt(String(toUid ?? ""), 10);

  if (!from || !to || isNaN(from) || isNaN(to)) {
    res.status(400).json({ error: "fromUid and toUid are required" });
    return;
  }
  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const [row] = await db
    .insert(directMessagesTable)
    .values({ fromUserId: from, toUserId: to, text: text.trim() })
    .returning();

  if (!row) {
    res.status(500).json({ error: "Failed to store message" });
    return;
  }

  res.json({
    message: {
      id: row.id,
      fromUserId: row.fromUserId,
      toUserId: row.toUserId,
      text: row.text,
      createdAt: row.createdAt.toISOString(),
    },
  });
});

// GET /dm/conversation?fromUid=&toUid=&limit= — fetch history between two users
router.get("/dm/conversation", async (req, res) => {
  const fromUid = parseInt(String(req.query["fromUid"] ?? ""), 10);
  const toUid = parseInt(String(req.query["toUid"] ?? ""), 10);
  const limit = Math.min(parseInt(String(req.query["limit"] ?? "50"), 10) || 50, 100);

  if (isNaN(fromUid) || isNaN(toUid)) {
    res.status(400).json({ error: "fromUid and toUid are required" });
    return;
  }

  // Fetch messages in both directions between these two users, chronological order
  const rows = await db
    .select({
      id: directMessagesTable.id,
      fromUserId: directMessagesTable.fromUserId,
      toUserId: directMessagesTable.toUserId,
      text: directMessagesTable.text,
      createdAt: directMessagesTable.createdAt,
    })
    .from(directMessagesTable)
    .where(
      or(
        and(
          eq(directMessagesTable.fromUserId, fromUid),
          eq(directMessagesTable.toUserId, toUid),
        ),
        and(
          eq(directMessagesTable.fromUserId, toUid),
          eq(directMessagesTable.toUserId, fromUid),
        ),
      ),
    )
    .orderBy(asc(directMessagesTable.createdAt))
    .limit(limit);

  res.json({
    messages: rows.map((r) => ({
      id: r.id,
      fromUserId: r.fromUserId,
      toUserId: r.toUserId,
      text: r.text,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

export default router;
