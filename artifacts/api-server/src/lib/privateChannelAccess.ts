import { viewerModeration } from "./streamModeration";
import { and, eq } from "drizzle-orm";
import { db, creatorBlocksTable, liveStreamSessionsTable, privateStreamInvitationsTable, usersTable } from "@workspace/db";

export const PRIVATE_HEARTBEAT_TTL_MS = 75_000;

export async function canAccessChannel(channelId: string, clerkId: string | null | undefined) {
  if (!channelId.startsWith("private-")) {
    const session = (await db.select().from(liveStreamSessionsTable).where(eq(liveStreamSessionsTable.channelId, channelId)).limit(1))[0];
    if (!session) return true; // demo channels have no durable record
    if (!clerkId) return false;
    const user = (await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1))[0];
    if (!user) return false;
    const moderation = await viewerModeration(session.id, session.hostUserId, user.uid);
    return !moderation.removed && !moderation.blocked;
  }
  if (!clerkId) return false;

  const invitation = (await db.select().from(privateStreamInvitationsTable)
    .where(eq(privateStreamInvitationsTable.channelId, channelId)).limit(1))[0] ?? null;
  if (
    !invitation ||
    invitation.status !== "active" ||
    invitation.updatedAt.getTime() <= Date.now() - PRIVATE_HEARTBEAT_TTL_MS
  ) {
    return false;
  }

  const user = (await db.select({ uid: usersTable.uid }).from(usersTable)
    .where(eq(usersTable.clerkId, clerkId)).limit(1))[0] ?? null;
  if (!user || (user.uid !== invitation.streamerUserId && user.uid !== invitation.invitedUserId)) return false;
  if (user.uid === invitation.streamerUserId) return true;
  const blocked = (await db.select().from(creatorBlocksTable).where(and(
    eq(creatorBlocksTable.hostUserId, invitation.streamerUserId), eq(creatorBlocksTable.viewerUserId, user.uid),
  )).limit(1))[0];
  return !blocked;
}

export async function requireChannelAccess(req: any, res: any, channelId: string) {
  const clerkId = req.auth?.()?.userId as string | null | undefined;
  if (await canAccessChannel(channelId, clerkId)) return true;
  res.status(404).json({ error: "Stream not found" });
  return false;
}