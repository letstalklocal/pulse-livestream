import { Router } from "express";
import { desc, eq, inArray, or } from "drizzle-orm";
import { db, directMessagesTable, usersTable } from "@workspace/db";

const router = Router();
const MAX_MESSAGE_LENGTH = 2_000;
const HISTORY_LIMIT = 500;

router.get("/dms/:uid", async (req, res) => {
  const uid = Number.parseInt(req.params["uid"] ?? "", 10);
  if (!Number.isInteger(uid)) {
    res.status(400).json({ error: "Invalid uid" });
    return;
  }

  const rows = await db
    .select()
    .from(directMessagesTable)
    .where(
      or(
        eq(directMessagesTable.fromUserId, uid),
        eq(directMessagesTable.toUserId, uid),
      ),
    )
    .orderBy(desc(directMessagesTable.createdAt), desc(directMessagesTable.id))
    .limit(HISTORY_LIMIT);

  const userIds = [...new Set(rows.flatMap((message) => [
    message.fromUserId,
    message.toUserId,
  ]))];
  const users = userIds.length
    ? await db
        .select({ uid: usersTable.uid, name: usersTable.name })
        .from(usersTable)
        .where(inArray(usersTable.uid, userIds))
    : [];
  const names = new Map(users.map((user) => [user.uid, user.name]));

  res.json({
    messages: rows.reverse().map((message) => ({
      id: String(message.id),
      senderId: String(message.fromUserId),
      senderName: names.get(message.fromUserId) ?? String(message.fromUserId),
      recipientId: String(message.toUserId),
      recipientName: names.get(message.toUserId) ?? String(message.toUserId),
      text: message.text,
      ts: message.createdAt.getTime(),
    })),
  });
});

router.post("/dms", async (req, res) => {
  const senderId = Number(req.body?.senderId);
  const recipientId = Number(req.body?.recipientId);
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

  if (!Number.isInteger(senderId) || !Number.isInteger(recipientId)) {
    res.status(400).json({ error: "Valid senderId and recipientId are required" });
    return;
  }
  if (senderId === recipientId) {
    res.status(400).json({ error: "Cannot message yourself" });
    return;
  }
  if (!text || text.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: `Message must be 1-${MAX_MESSAGE_LENGTH} characters` });
    return;
  }

  const users = await db
    .select({ uid: usersTable.uid, name: usersTable.name })
    .from(usersTable)
    .where(inArray(usersTable.uid, [senderId, recipientId]));
  const names = new Map(users.map((user) => [user.uid, user.name]));
  if (!names.has(senderId) || !names.has(recipientId)) {
    res.status(404).json({ error: "Sender or recipient was not found" });
    return;
  }

  const [message] = await db
    .insert(directMessagesTable)
    .values({ fromUserId: senderId, toUserId: recipientId, text })
    .returning();

  if (!message) {
    res.status(500).json({ error: "Message could not be saved" });
    return;
  }

  res.status(201).json({
    message: {
      id: String(message.id),
      senderId: String(message.fromUserId),
      senderName: names.get(message.fromUserId),
      recipientId: String(message.toUserId),
      recipientName: names.get(message.toUserId),
      text: message.text,
      ts: message.createdAt.getTime(),
    },
  });
});

export default router;