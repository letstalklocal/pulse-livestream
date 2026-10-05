import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, coinBalancesTable, coinTransactionsTable, directMessagesTable, dmGiftCombosTable, dmGiftComboPaymentsTable, dmGiftComboMilestonesTable } from "@workspace/db";
import { lockParty } from "./liveParty";
import { GIFT_CATALOG } from "./giftCatalog";

export async function purchaseDmGift(senderId: number, recipientId: number, giftId: keyof typeof GIFT_CATALOG, idempotencyKey: string, requestedAt = new Date()) {
  const gift = GIFT_CATALOG[giftId];
  return db.transaction(async tx => {
    // Match the wallet's existing lock order, then serialize this conversation.
    await lockParty(tx);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${idempotencyKey}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`dm-combo:${senderId}:${recipientId}`}))`);
    const [existing] = await tx.select().from(coinTransactionsTable).where(eq(coinTransactionsTable.idempotencyKey, idempotencyKey)).limit(1);
    if (existing) {
      const [payment] = await tx.select().from(dmGiftComboPaymentsTable).where(eq(dmGiftComboPaymentsTable.idempotencyKey, idempotencyKey)).limit(1);
      const [combo] = payment ? await tx.select().from(dmGiftCombosTable).where(eq(dmGiftCombosTable.id, payment.comboId)) : [];
      if (!combo || existing.fromUserId !== senderId || existing.toUserId !== recipientId || combo.giftId !== giftId || existing.amount !== gift.coinCost) return { error: "conflict" as const };
      const [message] = await tx.select().from(directMessagesTable).where(eq(directMessagesTable.id, combo.messageId));
      const [wallet] = await tx.select().from(coinBalancesTable).where(eq(coinBalancesTable.userId, senderId));
      return { balance: wallet?.balance ?? 0, combo, message: message!, duplicate: true };
    }
    const [previous] = await tx.select().from(dmGiftCombosTable).where(and(eq(dmGiftCombosTable.senderId, senderId), eq(dmGiftCombosTable.recipientId, recipientId))).orderBy(desc(dmGiftCombosTable.lastPaidAt)).limit(1);
    await tx.insert(coinBalancesTable).values({ userId: senderId, balance: 0 }).onConflictDoNothing();
    const [wallet] = await tx.update(coinBalancesTable).set({ balance: sql`${coinBalancesTable.balance} - ${gift.coinCost}`, updatedAt: new Date() }).where(and(eq(coinBalancesTable.userId, senderId), sql`${coinBalancesTable.balance} >= ${gift.coinCost}`)).returning();
    const now = new Date();
    if (!wallet) {
      if (previous) await tx.update(dmGiftCombosTable).set({ closedAt: now }).where(eq(dmGiftCombosTable.id, previous.id));
      return { error: "insufficient" as const };
    }
    const elapsed = previous ? Math.max(0, requestedAt.getTime() - previous.lastPaidAt.getTime()) : Infinity;
    const continues = previous && !previous.closedAt && previous.giftId === giftId && elapsed <= 2000 && previous.totalCoins <= 2147483647 - gift.coinCost;
    const count = continues ? previous.count + 1 : 1;
    const totalCoins = continues ? previous.totalCoins + gift.coinCost : gift.coinCost;
    const text = `🎁 ${gift.emoji} ${gift.name} gift • ${totalCoins} coins${count > 1 ? ` ×${count}` : ""}`;
    const [message] = continues
      ? await tx.update(directMessagesTable).set({ text, createdAt: now, editedAt: now, readAt: null }).where(eq(directMessagesTable.id, previous.messageId)).returning()
      : await tx.insert(directMessagesTable).values({ fromUserId: senderId, toUserId: recipientId, text, kind: "text", createdAt: now }).returning();
    const [combo] = continues
      ? await tx.update(dmGiftCombosTable).set({ count, totalCoins, lastPaidAt: now }).where(eq(dmGiftCombosTable.id, previous.id)).returning()
      : await tx.insert(dmGiftCombosTable).values({ id: randomUUID(), senderId, recipientId, giftId, count, totalCoins, lastPaidAt: now, messageId: message!.id }).returning();
    await tx.insert(coinBalancesTable).values({ userId: recipientId, balance: 0 }).onConflictDoNothing();
    await tx.update(coinBalancesTable).set({ balance: sql`${coinBalancesTable.balance} + ${gift.coinCost}`, updatedAt: now }).where(eq(coinBalancesTable.userId, recipientId));
    const [ledger] = await tx.insert(coinTransactionsTable).values({ fromUserId: senderId, toUserId: recipientId, amount: gift.coinCost, type: "gift", giftName: gift.name, description: `${gift.emoji} ${gift.name}`, idempotencyKey, balanceAfter: wallet.balance }).returning();
    await tx.insert(dmGiftComboPaymentsTable).values({ idempotencyKey, comboId: combo!.id, transactionId: ledger!.id, count });
    if (count === 5 || count === 10) await tx.insert(dmGiftComboMilestonesTable).values({ comboId: combo!.id, count }).onConflictDoNothing();
    return { balance: wallet.balance, combo: combo!, message: message!, duplicate: false };
  });
}
