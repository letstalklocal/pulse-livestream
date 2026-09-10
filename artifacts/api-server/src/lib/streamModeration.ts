import { contactBlocked } from "./userSafety";
import { and, eq } from "drizzle-orm";
import { db, creatorBlocksTable, streamModerationTable, usersTable } from "@workspace/db";
export async function authenticatedUser(req: any) {
  const clerkId = req.auth?.()?.userId;
  if (!clerkId) return null;
  return (await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1))[0] ?? null;
}
export async function viewerModeration(sessionId: number, hostUserId: number, viewerUserId: number) {
  if (viewerUserId === hostUserId) return { muted: false, removed: false, blocked: false };
  const [restrictions, blocks, accountBlocked] = await Promise.all([
    db.select().from(streamModerationTable).where(and(eq(streamModerationTable.sessionId, sessionId), eq(streamModerationTable.viewerUserId, viewerUserId))).limit(1),
    db.select().from(creatorBlocksTable).where(and(eq(creatorBlocksTable.hostUserId, hostUserId), eq(creatorBlocksTable.viewerUserId, viewerUserId))).limit(1),
    contactBlocked(hostUserId, viewerUserId),
  ]);
  return { muted: restrictions[0]?.muted ?? false, removed: restrictions[0]?.removed ?? false, blocked: accountBlocked || !!blocks[0] };
}
