import { Router } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, coinBalancesTable, coinTransactionsTable, directMessagesTable, mediaPackItemsTable, mediaPackPurchasesTable, mediaPacksTable, usersTable } from "@workspace/db";
import { createPrivateGetUrl, createPrivateUploadUrl } from "../lib/objectStorage";

const router = Router();
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
  return { id: String(pack.id), name: pack.name, price: pack.coinPrice, itemCount: items.length, ownerUserId: String(pack.ownerUserId), unlocked, isOwner, items: await Promise.all(items.map(async (x) => ({ id: String(x.id), position: x.position, mediaType: x.contentType.startsWith("video/") ? "video" : "image", contentType: x.contentType, width: x.width, height: x.height, durationMs: x.durationMs, ...(includeUrls ? { mediaUrl: await createPrivateGetUrl(x.objectPath) } : {}) }))) };
};

router.post("/media-packs/uploads", async (req, res): Promise<any> => {
  if (!await requireUser(req, res)) return;
  const { contentType } = req.body ?? {};
  if (typeof contentType !== "string" || (!contentType.startsWith("image/") && !contentType.startsWith("video/"))) return res.status(400).json({ error: "A valid image/video content type is required" });
  try { res.status(201).json(await createPrivateUploadUrl()); } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : "Upload URL could not be created" }); }
});
router.get("/media-packs", async (req, res) => {
  const user = await requireUser(req, res); if (!user) return;
  const packs = await db.select().from(mediaPacksTable).where(eq(mediaPacksTable.ownerUserId, user.uid));
  res.json({ packs: await Promise.all(packs.map((x) => packResponse(x, true, true, true))) });
});
router.post("/media-packs", async (req, res): Promise<any> => {
  const user = await requireUser(req, res); if (!user) return;
  const { name, price, items } = req.body ?? {};
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80 || !Number.isInteger(price) || price <= 0 || !Array.isArray(items) || items.length < 1 || items.length > 20 || items.some((x) => !x || typeof x.objectPath !== "string" || !x.objectPath.startsWith("/objects/") || typeof x.contentType !== "string" || (!x.contentType.startsWith("image/") && !x.contentType.startsWith("video/")) || !Number.isInteger(x.width) || !Number.isInteger(x.height))) return res.status(400).json({ error: "Invalid pack" });
  const pack = await db.transaction(async (tx) => {
    const [created] = await tx.insert(mediaPacksTable).values({ ownerUserId: user.uid, name: name.trim(), coinPrice: price }).returning();
    await tx.insert(mediaPackItemsTable).values(items.map((x: any, position: number) => ({ packId: created!.id, position, objectPath: x.objectPath, contentType: x.contentType, width: x.width, height: x.height, durationMs: x.durationMs ?? null })));
    return created!;
  });
  res.status(201).json({ pack: await packResponse(pack, true, true, true) });
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
  const isOwner = pack.ownerUserId === user.uid;
  const [purchase, received] = await Promise.all([db.select().from(mediaPackPurchasesTable).where(and(eq(mediaPackPurchasesTable.packId, id), eq(mediaPackPurchasesTable.buyerUserId, user.uid))).limit(1), db.select({ id: directMessagesTable.id }).from(directMessagesTable).where(and(eq(directMessagesTable.mediaPackId, id), eq(directMessagesTable.toUserId, user.uid))).limit(1)]);
  if (!isOwner && !purchase[0] && !received[0]) return res.status(403).json({ error: "Pack access denied" });
  res.json({ pack: await packResponse(pack, isOwner || !!purchase[0], isOwner || !!purchase[0], isOwner) });
});
router.post("/media-packs/:packId/send", async (req, res): Promise<any> => {
  const user = await requireUser(req, res); if (!user) return; const id = Number(req.params.packId), recipientId = Number(req.body?.recipientId), idempotencyKey = key(req.body?.idempotencyKey);
  if (!Number.isInteger(id) || !Number.isInteger(recipientId) || !idempotencyKey) return res.status(400).json({ error: "recipientId and idempotencyKey are required" });
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
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${idempotencyKey}))`);
      const pack = (await tx.select().from(mediaPacksTable).where(eq(mediaPacksTable.id, id)).limit(1))[0]; if (!pack) return "missing" as const;
      if (pack.ownerUserId === user.uid) return { balance: (await tx.select({ balance: coinBalancesTable.balance }).from(coinBalancesTable).where(eq(coinBalancesTable.userId, user.uid)).limit(1))[0]?.balance ?? 0 };
      if (!(await tx.select({ id: directMessagesTable.id }).from(directMessagesTable).where(and(eq(directMessagesTable.mediaPackId, id), eq(directMessagesTable.toUserId, user.uid))).limit(1))[0]) return "forbidden" as const;
      const old = (await tx.select().from(mediaPackPurchasesTable).where(eq(mediaPackPurchasesTable.idempotencyKey, idempotencyKey)).limit(1))[0];
      if (old) { if (old.packId !== id || old.buyerUserId !== user.uid) throw new Error("conflict"); return { balance: (await tx.select({ balance: coinBalancesTable.balance }).from(coinBalancesTable).where(eq(coinBalancesTable.userId, user.uid)).limit(1))[0]?.balance ?? 0 }; }
      if ((await tx.select({ id: coinTransactionsTable.id }).from(coinTransactionsTable).where(eq(coinTransactionsTable.idempotencyKey, idempotencyKey)).limit(1))[0]) throw new Error("conflict");
      const prior = (await tx.select().from(mediaPackPurchasesTable).where(and(eq(mediaPackPurchasesTable.packId, id), eq(mediaPackPurchasesTable.buyerUserId, user.uid))).limit(1))[0];
      if (prior) return { balance: (await tx.select({ balance: coinBalancesTable.balance }).from(coinBalancesTable).where(eq(coinBalancesTable.userId, user.uid)).limit(1))[0]?.balance ?? 0 };
      await tx.insert(coinBalancesTable).values({ userId: user.uid, balance: 0 }).onConflictDoNothing(); const spent = await tx.update(coinBalancesTable).set({ balance: sql`${coinBalancesTable.balance} - ${pack.coinPrice}`, updatedAt: new Date() }).where(and(eq(coinBalancesTable.userId, user.uid), sql`${coinBalancesTable.balance} >= ${pack.coinPrice}`)).returning();
      if (!spent[0]) return "insufficient" as const;
      await tx.insert(coinBalancesTable).values({ userId: pack.ownerUserId, balance: 0 }).onConflictDoNothing(); await tx.update(coinBalancesTable).set({ balance: sql`${coinBalancesTable.balance} + ${pack.coinPrice}`, updatedAt: new Date() }).where(eq(coinBalancesTable.userId, pack.ownerUserId));
      await tx.insert(coinTransactionsTable).values({ fromUserId: user.uid, toUserId: pack.ownerUserId, amount: pack.coinPrice, type: "gift", description: `Media pack ${id}`, idempotencyKey }); await tx.insert(mediaPackPurchasesTable).values({ packId: id, buyerUserId: user.uid, idempotencyKey }); return { balance: spent[0].balance };
    });
    if (result === "missing") return res.status(404).json({ error: "Pack not found" }); if (result === "forbidden") return res.status(403).json({ error: "Pack was not sent to you" }); if (result === "insufficient") { const b = (await db.select({ balance: coinBalancesTable.balance }).from(coinBalancesTable).where(eq(coinBalancesTable.userId, user.uid)).limit(1))[0]?.balance ?? 0; return res.status(402).json({ error: "Insufficient coins", balance: b }); } res.json(result);
  } catch (error) { if (error instanceof Error && error.message === "conflict") return res.status(409).json({ error: "Idempotency key was used for another request" }); res.status(500).json({ error: "Pack could not be unlocked" }); }
});
export default router;