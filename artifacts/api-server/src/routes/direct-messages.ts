import { Router } from "express";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { coinBalancesTable, coinTransactionsTable, db, directMediaPurchasesTable, directMessagesTable, privateStreamInvitationsTable, usersTable } from "@workspace/db";
import { createPrivateGetUrl } from "../lib/objectStorage";

const router = Router();
const MAX_MESSAGE_LENGTH = 2_000;
const HISTORY_LIMIT = 500;
const key = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 200 ? value : null;

async function currentUser(req: any) {
  const clerkId = req.auth?.()?.userId;
  if (!clerkId) return null;
  return (await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1))[0] ?? null;
}
async function requireUser(req: any, res: any) {
  const user = await currentUser(req);
  if (!user) { res.status(401).json({ error: "Authentication required" }); return null; }
  return user;
}

async function messageResponse(message: typeof directMessagesTable.$inferSelect, names: Map<number, string>, viewerId: number, purchased: Set<number>, invitations = new Map<number, typeof privateStreamInvitationsTable.$inferSelect>()) {
  const isMedia = message.kind === "media";
  const price = message.mediaPrice ?? 0;
  const unlocked = !isMedia || message.fromUserId === viewerId || price === 0 || purchased.has(message.id);
  const response: Record<string, unknown> = {
    id: String(message.id),
    senderId: String(message.fromUserId),
    senderName: names.get(message.fromUserId) ?? String(message.fromUserId),
    recipientId: String(message.toUserId),
    recipientName: names.get(message.toUserId) ?? String(message.toUserId),
    text: message.text,
    kind: message.kind,
    mediaPackId: message.mediaPackId === null ? null : String(message.mediaPackId),
    ts: message.createdAt.getTime(),
  };
  if (isMedia) {
    response.mediaType = message.mediaContentType?.startsWith("video/") ? "video" : "image";
    response.contentType = message.mediaContentType;
    response.width = message.mediaWidth;
    response.height = message.mediaHeight;
    response.durationMs = message.mediaDurationMs;
    response.price = price;
    response.unlocked = unlocked;
    if (message.mediaObjectPath) {
      if (unlocked) response.mediaUrl = await createPrivateGetUrl(message.mediaObjectPath);
      else response.previewUrl = await createPrivateGetUrl(message.mediaObjectPath);
    }
  }
  if (message.kind === "private_stream_invitation" && message.privateStreamInvitationId) {
    const invitation = invitations.get(message.privateStreamInvitationId);
    if (invitation) {
      const status = invitation.status === "pending" && invitation.expiresAt <= new Date() ? "expired" : invitation.status;
      response.invitation = {
        id: String(invitation.id), streamerUserId: String(invitation.streamerUserId),
        invitedUserId: String(invitation.invitedUserId), channelId: invitation.channelId, title: invitation.title,
        status, expiresAt: invitation.expiresAt.getTime(), startedAt: invitation.startedAt?.getTime() ?? null,
        endedAt: invitation.endedAt?.getTime() ?? null,
        backgroundImageUrl: await createPrivateGetUrl(invitation.backgroundObjectPath),
      };
    }
  }
  return response;
}

router.get("/dms/:uid", async (req, res): Promise<any> => {
  const viewer = await requireUser(req, res); if (!viewer) return;
  const uid = Number.parseInt(req.params["uid"] ?? "", 10);
  if (!Number.isInteger(uid) || uid !== viewer.uid) return res.status(403).json({ error: "DM access denied" });
  const rows = await db.select().from(directMessagesTable).where(or(eq(directMessagesTable.fromUserId, uid), eq(directMessagesTable.toUserId, uid))).orderBy(desc(directMessagesTable.createdAt), desc(directMessagesTable.id)).limit(HISTORY_LIMIT);
  const userIds = [...new Set(rows.flatMap((message) => [message.fromUserId, message.toUserId]))];
  const invitationIds = rows.flatMap((message) => message.privateStreamInvitationId ? [message.privateStreamInvitationId] : []);
  const [users, purchases, invitations] = await Promise.all([
    userIds.length ? db.select({ uid: usersTable.uid, name: usersTable.name }).from(usersTable).where(inArray(usersTable.uid, userIds)) : [],
    rows.length ? db.select({ messageId: directMediaPurchasesTable.messageId }).from(directMediaPurchasesTable).where(and(eq(directMediaPurchasesTable.buyerUserId, viewer.uid), inArray(directMediaPurchasesTable.messageId, rows.map((x) => x.id)))) : [],
    invitationIds.length ? db.select().from(privateStreamInvitationsTable).where(inArray(privateStreamInvitationsTable.id, invitationIds)) : [],
  ]);
  const names = new Map(users.map((user) => [user.uid, user.name]));
  const purchased = new Set(purchases.map((purchase) => purchase.messageId));
  const expiredInvitationIds = invitations
    .filter((invitation) => invitation.status === "pending" && invitation.expiresAt <= new Date())
    .map((invitation) => invitation.id);
  const staleActiveInvitationIds = invitations
    .filter((invitation) => invitation.status === "active" && invitation.updatedAt.getTime() <= Date.now() - 75_000)
    .map((invitation) => invitation.id);
  if (expiredInvitationIds.length) {
    await db.update(privateStreamInvitationsTable)
      .set({ status: "expired", updatedAt: new Date() })
      .where(inArray(privateStreamInvitationsTable.id, expiredInvitationIds));
    for (const invitation of invitations) {
      if (expiredInvitationIds.includes(invitation.id)) invitation.status = "expired";
    }
  }
  if (staleActiveInvitationIds.length) {
    const now = new Date();
    await db.update(privateStreamInvitationsTable)
      .set({ status: "ended", endedAt: now, updatedAt: now })
      .where(inArray(privateStreamInvitationsTable.id, staleActiveInvitationIds));
    for (const invitation of invitations) {
      if (staleActiveInvitationIds.includes(invitation.id)) {
        invitation.status = "ended";
        invitation.endedAt = now;
      }
    }
  }
  const invitationMap = new Map(invitations.map((invitation) => [invitation.id, invitation]));
  res.json({ messages: await Promise.all(rows.reverse().map((message) => messageResponse(message, names, viewer.uid, purchased, invitationMap))) });
});

router.post("/dms/media", async (req, res): Promise<any> => {
  const sender = await requireUser(req, res); if (!sender) return;
  const { recipientId, objectPath, mediaType, contentType, width, height, durationMs } = req.body ?? {};
  const price = req.body?.price ?? 0;
  const idempotencyKey = key(req.body?.idempotencyKey);
  if (!Number.isInteger(recipientId) || recipientId === sender.uid || typeof objectPath !== "string" || !objectPath.startsWith("/objects/") || (mediaType !== "image" && mediaType !== "video") || typeof contentType !== "string" || !contentType.startsWith(`${mediaType}/`) || !Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0 || (durationMs !== undefined && (!Number.isInteger(durationMs) || durationMs < 0)) || !Number.isInteger(price) || price < 0 || !idempotencyKey) return res.status(400).json({ error: "Invalid media DM" });
  const recipient = (await db.select({ uid: usersTable.uid, name: usersTable.name }).from(usersTable).where(eq(usersTable.uid, recipientId)).limit(1))[0];
  if (!recipient) return res.status(404).json({ error: "Recipient not found" });
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${idempotencyKey}))`);
      const existing = (await tx.select().from(directMessagesTable).where(eq(directMessagesTable.idempotencyKey, idempotencyKey)).limit(1))[0];
      if (existing) {
        const matches = existing.fromUserId === sender.uid
          && existing.toUserId === recipientId
          && existing.kind === "media"
          && existing.mediaObjectPath === objectPath
          && existing.mediaContentType === contentType
          && existing.mediaWidth === width
          && existing.mediaHeight === height
          && existing.mediaDurationMs === (durationMs ?? null)
          && existing.mediaPrice === price;
        if (!matches) return { conflict: true as const };
        return { message: existing, created: false as const };
      }
      const [message] = await tx.insert(directMessagesTable).values({ fromUserId: sender.uid, toUserId: recipientId, text: "", kind: "media", mediaObjectPath: objectPath, mediaContentType: contentType, mediaWidth: width, mediaHeight: height, mediaDurationMs: durationMs ?? null, mediaPrice: price, idempotencyKey }).returning();
      return { message: message!, created: true as const };
    });
    if ("conflict" in result) return res.status(409).json({ error: "Idempotency key was used for another request" });
    const names = new Map([[sender.uid, sender.name], [recipient.uid, recipient.name]]);
    res.status(result.created ? 201 : 200).json({ message: await messageResponse(result.message, names, sender.uid, new Set()) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Media DM could not be sent" });
  }
});

router.post("/dms/:messageId/unlock", async (req, res): Promise<any> => {
  const buyer = await requireUser(req, res); if (!buyer) return;
  const messageId = Number(req.params.messageId); const idempotencyKey = key(req.body?.idempotencyKey);
  if (!Number.isInteger(messageId) || !idempotencyKey) return res.status(400).json({ error: "idempotencyKey is required" });
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${idempotencyKey}))`);
      const message = (await tx.select().from(directMessagesTable).where(eq(directMessagesTable.id, messageId)).limit(1))[0];
      if (!message || message.kind !== "media") return "missing" as const;
      if (message.toUserId !== buyer.uid) return "forbidden" as const;
      const balance = async () => (await tx.select({ balance: coinBalancesTable.balance }).from(coinBalancesTable).where(eq(coinBalancesTable.userId, buyer.uid)).limit(1))[0]?.balance ?? 0;
      const old = (await tx.select().from(directMediaPurchasesTable).where(eq(directMediaPurchasesTable.idempotencyKey, idempotencyKey)).limit(1))[0];
      if (old) { if (old.messageId !== messageId || old.buyerUserId !== buyer.uid) throw new Error("conflict"); return { balance: await balance(), unlocked: true }; }
      if ((await tx.select({ id: coinTransactionsTable.id }).from(coinTransactionsTable).where(eq(coinTransactionsTable.idempotencyKey, idempotencyKey)).limit(1))[0]) throw new Error("conflict");
      if ((await tx.select({ id: directMediaPurchasesTable.id }).from(directMediaPurchasesTable).where(and(eq(directMediaPurchasesTable.messageId, messageId), eq(directMediaPurchasesTable.buyerUserId, buyer.uid))).limit(1))[0]) return { balance: await balance(), unlocked: true };
      const price = message.mediaPrice ?? 0;
      if (price === 0) {
        await tx.insert(directMediaPurchasesTable).values({ messageId, buyerUserId: buyer.uid, idempotencyKey });
        return { balance: await balance(), unlocked: true };
      }
      await tx.insert(coinBalancesTable).values({ userId: buyer.uid, balance: 0 }).onConflictDoNothing();
      const spent = await tx.update(coinBalancesTable).set({ balance: sql`${coinBalancesTable.balance} - ${price}`, updatedAt: new Date() }).where(and(eq(coinBalancesTable.userId, buyer.uid), sql`${coinBalancesTable.balance} >= ${price}`)).returning();
      if (!spent[0]) return "insufficient" as const;
      await tx.insert(coinBalancesTable).values({ userId: message.fromUserId, balance: 0 }).onConflictDoNothing();
      await tx.update(coinBalancesTable).set({ balance: sql`${coinBalancesTable.balance} + ${price}`, updatedAt: new Date() }).where(eq(coinBalancesTable.userId, message.fromUserId));
      await tx.insert(coinTransactionsTable).values({ fromUserId: buyer.uid, toUserId: message.fromUserId, amount: price, type: "gift", description: `Direct media ${messageId}`, idempotencyKey });
      await tx.insert(directMediaPurchasesTable).values({ messageId, buyerUserId: buyer.uid, idempotencyKey });
      return { balance: spent[0].balance, unlocked: true };
    });
    if (result === "missing") return res.status(404).json({ error: "Media message not found" });
    if (result === "forbidden") return res.status(403).json({ error: "Only the recipient can unlock this media" });
    if (result === "insufficient") { const balance = (await db.select({ balance: coinBalancesTable.balance }).from(coinBalancesTable).where(eq(coinBalancesTable.userId, buyer.uid)).limit(1))[0]?.balance ?? 0; return res.status(402).json({ error: "Insufficient coins", balance }); }
    const unlockedMessage = (await db.select().from(directMessagesTable).where(eq(directMessagesTable.id, messageId)).limit(1))[0];
    const mediaUrl = unlockedMessage?.mediaObjectPath ? await createPrivateGetUrl(unlockedMessage.mediaObjectPath) : undefined;
    res.json({ ...result, mediaUrl });
  } catch (error) { if (error instanceof Error && error.message === "conflict") return res.status(409).json({ error: "Idempotency key was used for another request" }); res.status(500).json({ error: "Media could not be unlocked" }); }
});

router.post("/dms", async (req, res) => {
  const senderId = Number(req.body?.senderId);
  const recipientId = Number(req.body?.recipientId);
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!Number.isInteger(senderId) || !Number.isInteger(recipientId)) { res.status(400).json({ error: "Valid senderId and recipientId are required" }); return; }
  if (senderId === recipientId) { res.status(400).json({ error: "Cannot message yourself" }); return; }
  if (!text || text.length > MAX_MESSAGE_LENGTH) { res.status(400).json({ error: `Message must be 1-${MAX_MESSAGE_LENGTH} characters` }); return; }
  const users = await db.select({ uid: usersTable.uid, name: usersTable.name }).from(usersTable).where(inArray(usersTable.uid, [senderId, recipientId]));
  const names = new Map(users.map((user) => [user.uid, user.name]));
  if (!names.has(senderId) || !names.has(recipientId)) { res.status(404).json({ error: "Sender or recipient was not found" }); return; }
  const [message] = await db.insert(directMessagesTable).values({ fromUserId: senderId, toUserId: recipientId, text }).returning();
  if (!message) { res.status(500).json({ error: "Message could not be saved" }); return; }
  res.status(201).json({ message: await messageResponse(message, names, senderId, new Set()) });
});

export default router;