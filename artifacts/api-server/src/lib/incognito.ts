import { and, eq, inArray, sql } from "drizzle-orm";
import { db, liveStreamSessionsTable, premiumIdentitiesTable, coinTransactionsTable, userBlocksTable } from "@workspace/db";
import { hasVipAccess } from "./vipAccess";
import { privacyPreferences } from "./privacy";

export class IncognitoError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function premiumIdentity(channelId: string, uid: number, executor: any = db) {
  const rows = await executor.select({ identity: premiumIdentitiesTable }).from(premiumIdentitiesTable)
    .innerJoin(liveStreamSessionsTable, eq(liveStreamSessionsTable.id, premiumIdentitiesTable.sessionId))
    .where(and(eq(liveStreamSessionsTable.channelId, channelId), eq(premiumIdentitiesTable.viewerUserId, uid))).limit(1);
  return rows[0]?.identity as typeof premiumIdentitiesTable.$inferSelect | undefined;
}
// Called inside the admission transaction: aliases and the payment commit together.
export async function choosePremiumIdentity(tx: any, sessionId: number, uid: number, requested: boolean) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`incognito:${sessionId}`}))`);
  const session = (await tx.select().from(liveStreamSessionsTable).where(eq(liveStreamSessionsTable.id, sessionId)).limit(1))[0];
  const existing = (await tx.select().from(premiumIdentitiesTable).where(and(eq(premiumIdentitiesTable.sessionId, sessionId), eq(premiumIdentitiesTable.viewerUserId, uid))).limit(1))[0];
  if (existing) return existing;
  if (requested && !session?.allowIncognito) throw new IncognitoError(403, "Incognito not available");
  const next = requested ? Number((await tx.select({ n: sql`coalesce(max(${premiumIdentitiesTable.aliasNumber}), 0) + 1` }).from(premiumIdentitiesTable).where(eq(premiumIdentitiesTable.sessionId, sessionId)))[0].n) : null;
  return (await tx.insert(premiumIdentitiesTable).values({ sessionId, viewerUserId: uid, incognito: requested, aliasNumber: next }).returning())[0];
}
export async function publicLiveIdentity(channelId: string, uid: number, name: string) {
  const identity = await premiumIdentity(channelId, uid);
  return identity?.incognito
    ? { uid: -identity.id, name: `Incognito ${identity.aliasNumber}`, isIncognito: true }
    : { uid, name, isIncognito: false };
}
export async function resolveLiveUid(channelId: string, uid: number) {
  if (uid > 0) return uid;
  const { partyChannels } = await import("./liveParty");
  const allowedChannels = await partyChannels(channelId);
  const row = (await db.select({ uid: premiumIdentitiesTable.viewerUserId }).from(premiumIdentitiesTable)
    .innerJoin(liveStreamSessionsTable, eq(liveStreamSessionsTable.id, premiumIdentitiesTable.sessionId))
    .where(and(inArray(liveStreamSessionsTable.channelId, allowedChannels), eq(premiumIdentitiesTable.id, -uid), eq(premiumIdentitiesTable.incognito, true))).limit(1))[0];
  if (row) return row.uid;
  // Restricted lists keep anonymous blocks opaque in later lives by the same host.
  const blocked = (await db.select({ uid: userBlocksTable.blockedUserId }).from(userBlocksTable)
    .innerJoin(liveStreamSessionsTable, eq(liveStreamSessionsTable.hostUserId, userBlocksTable.blockerUserId))
    .where(and(eq(liveStreamSessionsTable.channelId, channelId), eq(userBlocksTable.incognitoIdentityId, -uid))).limit(1))[0];
  return blocked?.uid ?? 0;
}
export async function visibleLiveViewer(channelId: string, uid: number) {
  if ((await publicLiveIdentity(channelId, uid, "Viewer")).isIncognito) return true;
  if (!await hasVipAccess(uid) || !(await privacyPreferences(uid)).invisibleViewing) return true;
  const gifts = await db.select({ id: coinTransactionsTable.id }).from(coinTransactionsTable)
    .where(and(eq(coinTransactionsTable.channelId, channelId), eq(coinTransactionsTable.fromUserId, uid), eq(coinTransactionsTable.type, "gift"))).limit(1);
  return !!gifts[0];
}

/** All live payment paths mask before reaching the synchronous websocket/chat hub. */
export async function pushPrivateGift(channelId: string, giftName: string, senderName: string, coins: number, details: import("./wsHub").GiftDetails, party = false) {
  const identity = await publicLiveIdentity(channelId, details.senderUid, senderName);
  const masked = { ...details, senderUid: identity.uid, isIncognito: identity.isIncognito };
  const hub = await import("./wsHub");
  if (party) hub.pushPartyGift(channelId, giftName, identity.name, masked);
  else hub.pushGift(channelId, giftName, identity.name, coins, masked);
}
