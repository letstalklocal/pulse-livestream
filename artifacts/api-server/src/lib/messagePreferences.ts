import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db, messagePreferencesTable, directMessagesTable, coinTransactionsTable, followsTable } from "@workspace/db";
export const messageDefaults = { lastSeenOnline: true, readReceipts: true, giftToOpenChat: true, requiredGiftId: "rose" };
export async function messagePreferences(uid: number) {
 const [row] = await db.select().from(messagePreferencesTable).where(eq(messagePreferencesTable.userId,uid));
 return row ? { lastSeenOnline: row.lastSeenOnline, readReceipts: row.readReceipts, giftToOpenChat: row.giftToOpenChat, requiredGiftId: row.requiredGiftId } : {...messageDefaults};
}
export async function chatNeedsGift(sender: number, recipient: number) {
 if (!(await messagePreferences(recipient)).giftToOpenChat) return false;
 const [follow] = await db.select({id:followsTable.followerId}).from(followsTable).where(and(eq(followsTable.followerId,recipient),eq(followsTable.followedId,sender))).limit(1);
 if (follow) return false;
 const [history] = await db.select({id:directMessagesTable.id}).from(directMessagesTable).where(or(and(eq(directMessagesTable.fromUserId,sender),eq(directMessagesTable.toUserId,recipient)),and(eq(directMessagesTable.fromUserId,recipient),eq(directMessagesTable.toUserId,sender)))).limit(1);
 if (history) return false;
 const [gift] = await db.select({id:coinTransactionsTable.id}).from(coinTransactionsTable).where(and(eq(coinTransactionsTable.fromUserId,sender),eq(coinTransactionsTable.toUserId,recipient),eq(coinTransactionsTable.type,"gift"),eq(coinTransactionsTable.giftName,"Rose"),sql`${coinTransactionsTable.amount} >= 1`,isNull(coinTransactionsTable.channelId))).limit(1);
 return !gift;
}
export async function requireChatAllowed(res: any, sender: number, recipient: number) {
 if (!await chatNeedsGift(sender,recipient)) return true;
 res.status(403).json({error:"Send a Rose (1 coin) to open this chat.",code:"CHAT_GIFT_REQUIRED",requiredGiftId:"rose"});return false;
}
