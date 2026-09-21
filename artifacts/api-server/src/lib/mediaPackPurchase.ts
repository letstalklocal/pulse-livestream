import { and, eq, sql } from "drizzle-orm";
import {
  db,
  coinBalancesTable,
  coinTransactionsTable,
  directMessagesTable,
  liveStreamSessionsTable,
  mediaPacksTable,
  mediaPackPurchasesTable,
} from "@workspace/db";
import { contactBlocked } from "./userSafety";
import { lockParty } from "./liveParty";
import { assertStickerAccess, StickerError } from "./liveStickers";

/** Shared by DM unlocks and live sticker purchases. Delivery and payment commit together. */
export async function purchaseMediaPack(
  user: { uid: number; clerkId: string | null },
  packId: number,
  idempotencyKey: string,
  live?: { channelId: string; stickerId: string },
  expectedPrice?: number,
) {
  return db.transaction(async (tx) => {
    // Same ordering as normal gifts: party lock, request lock, session, wallets.
    await lockParty(tx);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${idempotencyKey}))`,
    );
    let session;
    if (live) {
      [session] = await tx
        .select()
        .from(liveStreamSessionsTable)
        .where(eq(liveStreamSessionsTable.channelId, live.channelId))
        .for("update");
      await assertStickerAccess(session, user);
      const sticker = session?.stickers.find(
        (s) =>
          s.id === live.stickerId && s.kind === "pack" && s.packId === packId,
      );
      if (!sticker) throw new StickerError(404, "Sticker unavailable");
    }
    // Serialize purchases of the same pack even when callers use different keys.
    const [pack] = await tx
      .select()
      .from(mediaPacksTable)
      .where(eq(mediaPacksTable.id, packId))
      .for("update");
    if (!pack) throw new StickerError(404, "Pack not found");
    if (session && pack.ownerUserId !== session.hostUserId)
      throw new StickerError(403, "Pack owner does not match this live");
    if (await contactBlocked(user.uid, pack.ownerUserId))
      throw new StickerError(403, "Contact with this account is unavailable");
    const balance = async () =>
      (
        await tx
          .select()
          .from(coinBalancesTable)
          .where(eq(coinBalancesTable.userId, user.uid))
          .limit(1)
      )[0]?.balance ?? 0;
    if (user.uid === pack.ownerUserId) {
      if (live) throw new StickerError(403, "You cannot buy your own pack");
      return { balance: await balance(), duplicate: true, channelId: null };
    }
    const [received] = await tx
      .select()
      .from(directMessagesTable)
      .where(
        and(
          eq(directMessagesTable.mediaPackId, packId),
          eq(directMessagesTable.fromUserId, pack.ownerUserId),
          eq(directMessagesTable.toUserId, user.uid),
        ),
      )
      .limit(1);
    if (!live && !received)
      throw new StickerError(403, "Pack was not sent to you");
    const [old] = await tx
      .select()
      .from(coinTransactionsTable)
      .where(eq(coinTransactionsTable.idempotencyKey, idempotencyKey))
      .limit(1);
    const [prior] = await tx
      .select()
      .from(mediaPackPurchasesTable)
      .where(
        and(
          eq(mediaPackPurchasesTable.packId, packId),
          eq(mediaPackPurchasesTable.buyerUserId, user.uid),
        ),
      )
      .limit(1);
    if (
      old &&
      (!prior ||
        prior.idempotencyKey !== idempotencyKey ||
        old.fromUserId !== user.uid ||
        old.channelId !== (live?.channelId ?? null))
    )
      throw new StickerError(
        409,
        "Idempotency key was used for another request",
      );
    if (prior)
      return { balance: await balance(), duplicate: true, channelId: null };
    if (expectedPrice !== undefined && expectedPrice !== pack.coinPrice)
      throw new StickerError(409, "Pack price changed. Please reopen the pack and try again.");
    for (const uid of [user.uid, pack.ownerUserId].sort((a, b) => a - b)) {
      await tx
        .insert(coinBalancesTable)
        .values({ userId: uid, balance: 0 })
        .onConflictDoNothing();
      await tx
        .select()
        .from(coinBalancesTable)
        .where(eq(coinBalancesTable.userId, uid))
        .for("update");
    }
    const [spent] = await tx
      .update(coinBalancesTable)
      .set({
        balance: sql`${coinBalancesTable.balance} - ${pack.coinPrice}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(coinBalancesTable.userId, user.uid),
          sql`${coinBalancesTable.balance} >= ${pack.coinPrice}`,
        ),
      )
      .returning();
    if (!spent) throw new StickerError(402, "Insufficient coins");
    await tx
      .update(coinBalancesTable)
      .set({
        balance: sql`${coinBalancesTable.balance} + ${pack.coinPrice}`,
        updatedAt: new Date(),
      })
      .where(eq(coinBalancesTable.userId, pack.ownerUserId));
    await tx
      .insert(coinTransactionsTable)
      .values({
        fromUserId: user.uid,
        toUserId: pack.ownerUserId,
        amount: pack.coinPrice,
        type: "gift",
        description: `Media pack ${packId}`,
        channelId: live?.channelId ?? null,
        idempotencyKey,
        balanceAfter: spent.balance,
      });
    await tx
      .insert(mediaPackPurchasesTable)
      .values({ packId, buyerUserId: user.uid, idempotencyKey });
    // A buyer-requested purchase receipt, not an unsolicited chat send. Blocking still applies.
    if (live && !received)
      await tx
        .insert(directMessagesTable)
        .values({
          fromUserId: pack.ownerUserId,
          toUserId: user.uid,
          text: "",
          kind: "media_pack",
          mediaPackId: packId,
          idempotencyKey: `pack-receipt:${packId}:${user.uid}`,
        });
    return {
      balance: spent.balance,
      duplicate: false,
      channelId: live?.channelId ?? null,
    };
  });
}
