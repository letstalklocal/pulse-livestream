import { Router } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  liveStreamSessionsTable,
  mediaPacksTable,
  mediaPackItemsTable,
  mediaPackPurchasesTable,
} from "@workspace/db";
import { authenticatedUser } from "../lib/streamModeration";
import {
  assertStickerAccess,
  StickerError,
  validateStickers,
} from "../lib/liveStickers";
import { PREMIUM_GIFT_CATALOG } from "../lib/giftCatalog";
const router = Router();
router.get("/streams/:channelId/stickers", async (req, res): Promise<any> => {
  const user = await authenticatedUser(req);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  try {
    const [session] = await db
      .select()
      .from(liveStreamSessionsTable)
      .where(
        eq(liveStreamSessionsTable.channelId, String(req.params.channelId)),
      )
      .limit(1);
    await assertStickerAccess(session, user);
    const stickers = await Promise.all(
      session.stickers.map(async (sticker) => {
        const gift =
          PREMIUM_GIFT_CATALOG[
            sticker.giftId as keyof typeof PREMIUM_GIFT_CATALOG
          ];
        if (!gift) return null;
        if (sticker.kind === "gift")
          return {
            ...sticker,
            price: gift.coinCost,
            name: gift.name,
            videos: 0,
            pictures: 0,
            owned: false,
          };
        const [pack] = await db
          .select()
          .from(mediaPacksTable)
          .where(
            and(
              eq(mediaPacksTable.id, sticker.packId!),
              eq(mediaPacksTable.ownerUserId, session.hostUserId),
            ),
          )
          .limit(1);
        if (!pack) return null;
        const items = await db
          .select({ contentType: mediaPackItemsTable.contentType })
          .from(mediaPackItemsTable)
          .where(eq(mediaPackItemsTable.packId, pack.id));
        const [purchase] = await db
          .select({ id: mediaPackPurchasesTable.id })
          .from(mediaPackPurchasesTable)
          .where(
            and(
              eq(mediaPackPurchasesTable.packId, pack.id),
              eq(mediaPackPurchasesTable.buyerUserId, user.uid),
            ),
          )
          .limit(1);
        return {
          ...sticker,
          giftId: pack.giftId,
          name: pack.name,
          price: pack.coinPrice,
          videos: items.filter((i) => i.contentType.startsWith("video/"))
            .length,
          pictures: items.filter((i) => i.contentType.startsWith("image/"))
            .length,
          owned: !!purchase || user.uid === session.hostUserId,
        };
      }),
    );
    // Never publish asset URLs, object paths, or another viewer's ownership state.
    res.json({
      stickers: stickers.filter(Boolean),
      hostUid: session.hostUserId,
    });
  } catch (error) {
    if (error instanceof StickerError)
      return res.status(error.status).json({ error: error.message });
    throw error;
  }
});
router.delete(
  "/streams/:channelId/stickers/:stickerId",
  async (req, res): Promise<any> => {
    const user = await authenticatedUser(req);
    if (!user)
      return res.status(401).json({ error: "Authentication required" });
    try {
      await db.transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(liveStreamSessionsTable)
          .where(
            eq(liveStreamSessionsTable.channelId, String(req.params.channelId)),
          )
          .for("update");
        if (!session || session.hostUserId !== user.uid || session.endedAt)
          throw new StickerError(403, "Only the live host can remove stickers");
        await tx
          .update(liveStreamSessionsTable)
          .set({
            stickers: session.stickers.filter(
              (s) => s.id !== req.params.stickerId,
            ),
          })
          .where(eq(liveStreamSessionsTable.id, session.id));
      });
      res.json({ success: true });
    } catch (error) {
      if (error instanceof StickerError)
        return res.status(error.status).json({ error: error.message });
      throw error;
    }
  },
);
router.put(
  "/streams/:channelId/stickers/:stickerId",
  async (req, res): Promise<any> => {
    const user = await authenticatedUser(req);
    if (!user)
      return res.status(401).json({ error: "Authentication required" });
    try {
      const [replacement] = await validateStickers([req.body], user.uid);
      await db.transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(liveStreamSessionsTable)
          .where(
            eq(liveStreamSessionsTable.channelId, String(req.params.channelId)),
          )
          .for("update");
        if (
          !session ||
          session.hostUserId !== user.uid ||
          session.endedAt ||
          session.lastHeartbeatAt.getTime() <= Date.now() - 60_000
        )
          throw new StickerError(
            403,
            "Only the live host can replace stickers",
          );
        if (!session.stickers.some((s) => s.id === req.params.stickerId))
          throw new StickerError(404, "Sticker unavailable");
        if (
          replacement.packId &&
          session.stickers.some(
            (s) =>
              s.id !== req.params.stickerId && s.packId === replacement.packId,
          )
        )
          throw new StickerError(400, "This pack is already on a sticker");
        await tx
          .update(liveStreamSessionsTable)
          .set({
            stickers: session.stickers.map((s) =>
              s.id === req.params.stickerId ? replacement : s,
            ),
          })
          .where(eq(liveStreamSessionsTable.id, session.id));
      });
      res.json({ success: true });
    } catch (error) {
      if (error instanceof StickerError)
        return res.status(error.status).json({ error: error.message });
      throw error;
    }
  },
);
export default router;
