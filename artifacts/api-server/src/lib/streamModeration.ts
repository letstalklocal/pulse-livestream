import { contactBlocked } from "./userSafety";
import { and, eq, isNull, lte } from "drizzle-orm";
import { db, premiumGiftRequestsTable, premiumGiftViewersTable, creatorBlocksTable, streamModerationTable, usersTable } from "@workspace/db";
export async function authenticatedUser(req: any) {
  const clerkId = req.auth?.()?.userId;
  if (!clerkId) return null;
  return (await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1))[0] ?? null;
}
export async function viewerModeration(sessionId: number, hostUserId: number, viewerUserId: number) {
  if (viewerUserId === hostUserId) return { muted: false, removed: false, blocked: false };
  const [restrictions, blocks, accountBlocked, expiredGift] = await Promise.all([
    db.select().from(streamModerationTable).where(and(eq(streamModerationTable.sessionId, sessionId), eq(streamModerationTable.viewerUserId, viewerUserId))).limit(1),
    db.select().from(creatorBlocksTable).where(and(eq(creatorBlocksTable.hostUserId, hostUserId), eq(creatorBlocksTable.viewerUserId, viewerUserId))).limit(1),
    contactBlocked(hostUserId, viewerUserId),
    db.select({ id: premiumGiftRequestsTable.id }).from(premiumGiftRequestsTable)
      .innerJoin(premiumGiftViewersTable, eq(premiumGiftViewersTable.requestId, premiumGiftRequestsTable.id))
      .where(and(eq(premiumGiftRequestsTable.sessionId, sessionId), eq(premiumGiftViewersTable.viewerUserId, viewerUserId),
        isNull(premiumGiftViewersTable.transactionId), isNull(premiumGiftViewersTable.waivedAt), lte(premiumGiftRequestsTable.deadline, new Date()))).limit(1),
  ]);
  return { muted: restrictions[0]?.muted ?? false, removed: !!expiredGift[0] || (restrictions[0]?.removed ?? false), blocked: accountBlocked || !!blocks[0] };
}
