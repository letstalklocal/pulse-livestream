import { PREMIUM_GIFT_CATALOG } from "../lib/giftCatalog";
import { purchaseMediaPack } from "../lib/mediaPackPurchase";
import { StickerError } from "../lib/liveStickers";
import { pushEarnings } from "../lib/wsHub";
import { requireChatAllowed } from "../lib/messagePreferences";
import { requireContactAllowed } from "../lib/userSafety";
import { Router, type ErrorRequestHandler } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, coinTransactionsTable, directMessagesTable, mediaPackItemsTable, mediaPackPurchasesTable, mediaPacksTable, usersTable } from "@workspace/db";
import { createPrivateGetUrl, createPrivateUploadUrl, createPrivateResumableUpload } from "../lib/objectStorage";

const router = Router();
// iOS ImagePicker reports fractional milliseconds; PostgreSQL stores whole milliseconds.
function normalizeDurations(items: unknown) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (item && typeof item.durationMs === "number" && Number.isFinite(item.durationMs)
      && item.durationMs >= 0 && item.durationMs <= 2147483647) item.durationMs = Math.round(item.durationMs);
  }
}
const validDuration = (value: unknown) => value == null || (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647);

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
const packResponse = async (pack: typeof mediaPacksTable.$inferSelect, includeUrls: boolean, unlocked: boolean, isOwner: boolean) => {
  const items = await db.select().from(mediaPackItemsTable).where(eq(mediaPackItemsTable.packId, pack.id)).orderBy(mediaPackItemsTable.position);
  const preview = items.find((item) => item.contentType.startsWith("image/")) ?? items[0];
  return { id: String(pack.id), name: pack.name, price: pack.coinPrice, giftId: pack.giftId, itemCount: items.length, ownerUserId: String(pack.ownerUserId), unlocked, isOwner, items: await Promise.all(items.map(async (x) => ({
    id: String(x.id),
    position: x.position,
    mediaType: x.contentType.startsWith("video/") ? "video" : "image",
    contentType: x.contentType,
    width: x.width,
    height: x.height,
    durationMs: x.durationMs,
    ...(includeUrls ? { mediaUrl: await createPrivateGetUrl(x.objectPath) } : {}),
    ...(!includeUrls && preview?.id === x.id ? { previewUrl: await createPrivateGetUrl(x.objectPath) } : {}),
  }))) };
};

router.post("/media-packs/uploads", async (req, res): Promise<any> => {
  if (!await requireUser(req, res)) return;
  const { contentType, resumable } = req.body ?? {};
  if (typeof contentType !== "string" || (!contentType.startsWith("image/") && !contentType.startsWith("video/"))) return res.status(400).json({ error: "A valid image/video content type is required" });
  try { res.status(201).json(resumable === true ? await createPrivateResumableUpload(contentType) : await createPrivateUploadUrl()); } catch (error) { req.log?.error({ code: (error as any)?.code, operation: "media-upload-session" }, "Media upload session failed"); res.status(500).json({ error: "Upload failed. Please try again." }); }
});
router.get("/media-packs", async (req, res) => {
  const user = await requireUser(req, res); if (!user) return;
  const packs = await db.select().from(mediaPacksTable).where(eq(mediaPacksTable.ownerUserId, user.uid));
  res.json({ packs: await Promise.all(packs.map((x) => packResponse(x, true, true, true))) });
});
router.post("/media-packs", async (req, res): Promise<any> => {
  const user = await requireUser(req, res); if (!user) return;
  const { name, items, giftId } = req.body ?? {};
  normalizeDurations(items);
  if (typeof giftId !== "string" || !Object.hasOwn(PREMIUM_GIFT_CATALOG, giftId)) return res.status(400).json({ error: "Choose a valid sticker gift" });
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80 || !Array.isArray(items) || items.length < 1 || items.length > 20 || items.some((x) => !x || typeof x.objectPath !== "string" || !x.objectPath.startsWith("/objects/") || typeof x.contentType !== "string" || (!x.contentType.startsWith("image/") && !x.contentType.startsWith("video/")) || !Number.isInteger(x.width) || x.width <= 0 || x.width > 2147483647 || !Number.isInteger(x.height) || x.height <= 0 || x.height > 2147483647 || !validDuration(x.durationMs))) return res.status(400).json({ error: "Invalid pack" });
  const pack = await db.transaction(async (tx) => {
    const [created] = await tx.insert(mediaPacksTable).values({ ownerUserId: user.uid, name: name.trim(), coinPrice: PREMIUM_GIFT_CATALOG[giftId as keyof typeof PREMIUM_GIFT_CATALOG].coinCost, giftId }).returning();
    await tx.insert(mediaPackItemsTable).values(items.map((x: any, position: number) => ({ packId: created!.id, position, objectPath: x.objectPath, contentType: x.contentType, width: x.width, height: x.height, durationMs: x.durationMs ?? null })));
    return created!;
  });
  res.status(201).json({ pack: await packResponse(pack, true, true, true) });
});
// Update the existing pack rather than replacing its identity or purchase records.
router.put("/media-packs/:packId", async (req, res): Promise<any> => {
  const user = await requireUser(req, res); if (!user) return;
  const id = Number(req.params.packId);
  const { giftId, items } = req.body ?? {};
  normalizeDurations(items);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647 || typeof giftId !== "string" || !Object.hasOwn(PREMIUM_GIFT_CATALOG, giftId) || !Array.isArray(items) || items.length < 1 || items.length > 20) return res.status(400).json({ error: "Invalid pack" });
  const retainedIds: number[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") return res.status(400).json({ error: "Invalid pack item" });
    if (item.id !== undefined) {
      if (typeof item.id !== "string" || !/^[1-9][0-9]*$/.test(item.id) || !Number.isSafeInteger(Number(item.id)) || retainedIds.includes(Number(item.id))) return res.status(400).json({ error: "Invalid pack item" });
      retainedIds.push(Number(item.id));
    } else if (typeof item.objectPath !== "string" || !item.objectPath.startsWith("/objects/") || typeof item.contentType !== "string" || (!item.contentType.startsWith("image/") && !item.contentType.startsWith("video/")) || !Number.isInteger(item.width) || item.width <= 0 || !Number.isInteger(item.height) || item.height <= 0 || !validDuration(item.durationMs)) {
      return res.status(400).json({ error: "Invalid pack item" });
    }
  }
  try {
    const pack = await db.transaction(async tx => {
      const [existing] = await tx.select().from(mediaPacksTable).where(and(eq(mediaPacksTable.id, id), eq(mediaPacksTable.ownerUserId, user.uid))).for("update");
      if (!existing) throw new StickerError(404, "Pack not found");
      const oldItems = await tx.select().from(mediaPackItemsTable).where(eq(mediaPackItemsTable.packId, id));
      if (retainedIds.some(itemId => !oldItems.some(item => item.id === itemId))) throw new StickerError(409, "Pack items changed. Reopen the pack and try again.");
      const removed = oldItems.filter(item => !retainedIds.includes(item.id)).map(item => item.id);
      if (removed.length) await tx.delete(mediaPackItemsTable).where(and(eq(mediaPackItemsTable.packId, id), inArray(mediaPackItemsTable.id, removed)));
      // Move retained positions out of the way before assigning the new order.
      const offset = Math.max(20, ...oldItems.map(item => item.position)) + 1;
      await tx.update(mediaPackItemsTable).set({ position: sql`${mediaPackItemsTable.position} + ${offset}` }).where(eq(mediaPackItemsTable.packId, id));
      for (const [position, item] of items.entries()) {
        if (item.id !== undefined) {
          await tx.update(mediaPackItemsTable).set({ position }).where(and(eq(mediaPackItemsTable.id, Number(item.id)), eq(mediaPackItemsTable.packId, id)));
        } else {
          await tx.insert(mediaPackItemsTable).values({ packId: id, position, objectPath: item.objectPath, contentType: item.contentType, width: item.width, height: item.height, durationMs: item.durationMs ?? null });
        }
      }
      const [updated] = await tx.update(mediaPacksTable).set({ giftId, coinPrice: PREMIUM_GIFT_CATALOG[giftId as keyof typeof PREMIUM_GIFT_CATALOG].coinCost }).where(eq(mediaPacksTable.id, id)).returning();
      return updated;
    });
    res.json({ pack: await packResponse(pack, true, true, true) });
  } catch (error) {
    if (error instanceof StickerError) return res.status(error.status).json({ error: error.message });
    throw error;
  }
});
router.delete("/media-packs/:packId", async (req, res): Promise<any> => {
  const user = await requireUser(req, res); if (!user) return;
  const id = Number(req.params.packId); const deleted = Number.isInteger(id) ? await db.delete(mediaPacksTable).where(and(eq(mediaPacksTable.id, id), eq(mediaPacksTable.ownerUserId, user.uid))).returning() : [];
  if (!deleted[0]) return res.status(404).json({ error: "Pack not found" }); res.json({ success: true });
});
router.get("/media-packs/:packId", async (req, res): Promise<any> => {
  const user = await requireUser(req, res); if (!user) return;
  const id = Number(req.params.packId); const pack = Number.isInteger(id) ? (await db.select().from(mediaPacksTable).where(eq(mediaPacksTable.id, id)).limit(1))[0] : null;
  if (!pack) return res.status(404).json({ error: "Pack not found" });
  if (!await requireContactAllowed(res, user.uid, pack.ownerUserId)) return;
  const isOwner = pack.ownerUserId === user.uid;
  const [purchase, received] = await Promise.all([db.select().from(mediaPackPurchasesTable).where(and(eq(mediaPackPurchasesTable.packId, id), eq(mediaPackPurchasesTable.buyerUserId, user.uid))).limit(1), db.select({ id: directMessagesTable.id }).from(directMessagesTable).where(and(eq(directMessagesTable.mediaPackId, id), eq(directMessagesTable.toUserId, user.uid))).limit(1)]);
  if (!isOwner && !purchase[0] && !received[0]) return res.status(403).json({ error: "Pack access denied" });
  res.json({ pack: await packResponse(pack, isOwner || !!purchase[0], isOwner || !!purchase[0], isOwner) });
});
router.post("/media-packs/:packId/send", async (req, res): Promise<any> => {
  const user = await requireUser(req, res); if (!user) return; const id = Number(req.params.packId), recipientId = Number(req.body?.recipientId), idempotencyKey = key(req.body?.idempotencyKey);
  if (!Number.isInteger(id) || !Number.isInteger(recipientId) || !idempotencyKey) return res.status(400).json({ error: "recipientId and idempotencyKey are required" });
  if (!await requireContactAllowed(res, user.uid, recipientId)) return;
  if (!await requireChatAllowed(res, user.uid, recipientId)) return;
  const pack = (await db.select().from(mediaPacksTable).where(and(eq(mediaPacksTable.id, id), eq(mediaPacksTable.ownerUserId, user.uid))).limit(1))[0]; if (!pack) return res.status(404).json({ error: "Pack not found" });
  const existing = (await db.select().from(directMessagesTable).where(eq(directMessagesTable.idempotencyKey, idempotencyKey)).limit(1))[0];
  if (existing) { if (existing.fromUserId !== user.uid || existing.toUserId !== recipientId || existing.mediaPackId !== id) return res.status(409).json({ error: "Idempotency key was used for another request" }); return res.json({ message: { id: String(existing.id), kind: existing.kind, mediaPackId: String(id), ts: existing.createdAt.getTime() } }); }
  if (recipientId === user.uid || !(await db.select({ uid: usersTable.uid }).from(usersTable).where(eq(usersTable.uid, recipientId)).limit(1))[0]) return res.status(404).json({ error: "Recipient not found" });
  const [message] = await db.insert(directMessagesTable).values({ fromUserId: user.uid, toUserId: recipientId, text: "", kind: "media_pack", mediaPackId: id, idempotencyKey }).returning();
  res.status(201).json({ message: { id: String(message!.id), kind: message!.kind, mediaPackId: String(id), ts: message!.createdAt.getTime() } });
});
router.post("/media-packs/:packId/unlock", async (req, res): Promise<any> => {
  const user = await requireUser(req, res); if (!user) return; const id = Number(req.params.packId), idempotencyKey = key(req.body?.idempotencyKey);
  if (!Number.isInteger(id) || !idempotencyKey) return res.status(400).json({ error: "idempotencyKey is required" });
  const expectedPrice = req.body?.expectedPrice;
  if (expectedPrice !== undefined && (!Number.isSafeInteger(expectedPrice) || expectedPrice <= 0)) return res.status(400).json({ error: "Invalid pack price" });
  const live = req.body?.live;
  if (live !== undefined && (!live || typeof live.channelId !== "string" || live.channelId.length > 200 || typeof live.stickerId !== "string" || live.stickerId.length > 100)) return res.status(400).json({ error: "Invalid live sticker" });
  try {
    const result = await purchaseMediaPack(user, id, idempotencyKey, live, expectedPrice);
    if (result.channelId && !result.duplicate) {
      try {
        const [row] = await db.select({ total: sql<number>`coalesce(sum(${coinTransactionsTable.amount}), 0)` }).from(coinTransactionsTable).where(and(eq(coinTransactionsTable.channelId, result.channelId), eq(coinTransactionsTable.type, "gift")));
        pushEarnings(result.channelId, Number(row?.total ?? 0));
      } catch (error) { req.log?.warn({ err: error }, "Pack earnings notification failed after commit"); }
    }
    res.json({ balance: result.balance });
  } catch (error) {
    if (error instanceof StickerError) return res.status(error.status).json({ error: error.message });
    req.log?.error({ err: error }, "Pack purchase failed");
    res.status(500).json({ error: "Pack could not be unlocked" });
  }
});
// Express otherwise returns an HTML error page for an unhandled async route failure.
const packErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  req.log?.error({ code: error?.cause?.code ?? error?.code, operation: req.method, route: req.route?.path }, "Media pack request failed");
  res.status(500).json({ error: "Please try again.", code: "MEDIA_PACK_REQUEST_FAILED" });
};
router.use(packErrorHandler);
export default router;
