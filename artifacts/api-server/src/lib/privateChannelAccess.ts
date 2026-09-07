import { eq } from "drizzle-orm";
import { db, privateStreamInvitationsTable, usersTable } from "@workspace/db";

export const PRIVATE_HEARTBEAT_TTL_MS = 75_000;

export async function canAccessChannel(channelId: string, clerkId: string | null | undefined) {
  if (!channelId.startsWith("private-")) return true;
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
  return !!user && (
    user.uid === invitation.streamerUserId ||
    user.uid === invitation.invitedUserId
  );
}

export async function requireChannelAccess(req: any, res: any, channelId: string) {
  const clerkId = req.auth?.()?.userId as string | null | undefined;
  if (await canAccessChannel(channelId, clerkId)) return true;
  res.status(404).json({ error: "Stream not found" });
  return false;
}