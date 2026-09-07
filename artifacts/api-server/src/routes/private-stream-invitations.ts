import { Router } from "express";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, directMessagesTable, privateStreamInvitationsTable, usersTable } from "@workspace/db";
import { createPrivateGetUrl } from "../lib/objectStorage";
import { endRuntimeStream } from "./streams";

const router = Router();
const INVITE_TTL_MS = 10 * 60 * 1000;
const ACTIVE_SESSION_TTL_MS = 75 * 1000;

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
async function response(invitation: typeof privateStreamInvitationsTable.$inferSelect) {
  return {
    id: String(invitation.id), streamerUserId: String(invitation.streamerUserId),
    invitedUserId: String(invitation.invitedUserId), channelId: invitation.channelId,
    title: invitation.title, status: invitation.status, expiresAt: invitation.expiresAt.getTime(),
    startedAt: invitation.startedAt?.getTime() ?? null, endedAt: invitation.endedAt?.getTime() ?? null,
    backgroundImageUrl: await createPrivateGetUrl(invitation.backgroundObjectPath),
  };
}
async function getInvite(id: number) {
  return (await db.select().from(privateStreamInvitationsTable).where(eq(privateStreamInvitationsTable.id, id)).limit(1))[0] ?? null;
}
async function expireIfNeeded(invitation: typeof privateStreamInvitationsTable.$inferSelect) {
  if (invitation.status === "pending" && invitation.expiresAt <= new Date()) {
    const [expired] = await db.update(privateStreamInvitationsTable).set({ status: "expired", updatedAt: new Date() }).where(eq(privateStreamInvitationsTable.id, invitation.id)).returning();
    return expired ?? invitation;
  }
  if (invitation.status === "active" && invitation.updatedAt.getTime() <= Date.now() - ACTIVE_SESSION_TTL_MS) {
    const now = new Date();
    const [ended] = await db.update(privateStreamInvitationsTable)
      .set({ status: "ended", endedAt: now, updatedAt: now })
      .where(and(eq(privateStreamInvitationsTable.id, invitation.id), eq(privateStreamInvitationsTable.status, "active")))
      .returning();
    if (ended) await endRuntimeStream(ended.channelId);
    return ended ?? invitation;
  }
  return invitation;
}

router.post("/private-stream-invitations", async (req, res): Promise<any> => {
  const streamer = await requireUser(req, res); if (!streamer) return;
  const invitedUserId = Number(req.body?.invitedUserId);
  const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 120) : "Private live";
  if (!Number.isInteger(invitedUserId) || invitedUserId === streamer.uid) return res.status(400).json({ error: "Choose a valid DM recipient" });
  const invited = (await db.select({ uid: usersTable.uid }).from(usersTable).where(eq(usersTable.uid, invitedUserId)).limit(1))[0];
  if (!invited) return res.status(404).json({ error: "Recipient not found" });
  const threadMessage = (await db.select({ id: directMessagesTable.id }).from(directMessagesTable).where(or(
    and(eq(directMessagesTable.fromUserId, streamer.uid), eq(directMessagesTable.toUserId, invitedUserId)),
    and(eq(directMessagesTable.fromUserId, invitedUserId), eq(directMessagesTable.toUserId, streamer.uid)),
  )).limit(1))[0];
  if (!threadMessage) return res.status(409).json({ error: "Start a DM conversation before sending a private live invitation" });
  if (!streamer.streamBackgroundImagePath) return res.status(400).json({ error: "A stream background image is required before inviting" });
  const now = new Date();
  const channelId = `private-${streamer.uid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${streamer.uid})`);
    await tx.update(privateStreamInvitationsTable)
      .set({ status: "expired", updatedAt: now })
      .where(and(
        eq(privateStreamInvitationsTable.streamerUserId, streamer.uid),
        eq(privateStreamInvitationsTable.status, "pending"),
        sql`${privateStreamInvitationsTable.expiresAt} <= ${now}`,
      ));
    const openInvitation = (await tx.select({ id: privateStreamInvitationsTable.id })
      .from(privateStreamInvitationsTable)
      .where(and(
        eq(privateStreamInvitationsTable.streamerUserId, streamer.uid),
        inArray(privateStreamInvitationsTable.status, ["pending", "accepted", "active"]),
      ))
      .limit(1))[0];
    if (openInvitation) return { conflict: true as const };
    const [created] = await tx.insert(privateStreamInvitationsTable).values({
      streamerUserId: streamer.uid, invitedUserId, channelId, title: title || "Private live",
      backgroundObjectPath: streamer.streamBackgroundImagePath!, expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    }).returning();
    await tx.insert(directMessagesTable).values({
      fromUserId: streamer.uid, toUserId: invitedUserId, text: "", kind: "private_stream_invitation",
      privateStreamInvitationId: created!.id,
    });
    return { invitation: created! };
  });
  if ("conflict" in result) return res.status(409).json({ error: "Finish or cancel your current private invitation before sending another" });
  res.status(201).json({ invitation: await response(result.invitation) });
});

router.get("/private-stream-invitations/:id", async (req, res): Promise<any> => {
  const user = await requireUser(req, res); if (!user) return;
  const invitation = await getInvite(Number(req.params["id"]));
  if (!invitation || (invitation.streamerUserId !== user.uid && invitation.invitedUserId !== user.uid)) return res.status(404).json({ error: "Invitation not found" });
  res.json({ invitation: await response(await expireIfNeeded(invitation)) });
});

router.post("/private-stream-invitations/:id/:action", async (req, res): Promise<any> => {
  const user = await requireUser(req, res); if (!user) return;
  const id = Number(req.params["id"]); const action = req.params["action"];
  let invitation = await getInvite(id);
  if (!invitation || (invitation.streamerUserId !== user.uid && invitation.invitedUserId !== user.uid)) return res.status(404).json({ error: "Invitation not found" });
  invitation = await expireIfNeeded(invitation);
  const isStreamer = invitation.streamerUserId === user.uid;
  const allowed = (action === "accept" || action === "decline") ? !isStreamer : action === "cancel" || action === "end" || action === "start" || action === "heartbeat" ? isStreamer : false;
  if (!allowed) return res.status(403).json({ error: "This action is not allowed" });
  const transitions: Record<string, { from: string[]; to: string; field?: "acceptedAt" | "declinedAt" | "cancelledAt" | "startedAt" | "endedAt" }> = {
    accept: { from: ["pending"], to: "accepted", field: "acceptedAt" },
    decline: { from: ["pending"], to: "declined", field: "declinedAt" },
    cancel: { from: ["pending", "accepted"], to: "cancelled", field: "cancelledAt" },
    start: { from: ["accepted"], to: "active", field: "startedAt" },
    heartbeat: { from: ["active"], to: "active" },
    end: { from: ["active"], to: "ended", field: "endedAt" },
  };
  const transition = transitions[action ?? ""];
  if (!transition || !transition.from.includes(invitation.status)) return res.status(409).json({ error: `Invitation cannot be ${action}ed` });
  const now = new Date();
  const values: any = { status: transition.to, updatedAt: now }; if (transition.field) values[transition.field] = now;
  const [updated] = await db.update(privateStreamInvitationsTable).set(values).where(and(eq(privateStreamInvitationsTable.id, id), eq(privateStreamInvitationsTable.status, invitation.status))).returning();
  if (!updated) return res.status(409).json({ error: "Invitation changed, please retry" });
  if (updated.status === "ended") await endRuntimeStream(updated.channelId);
  res.json({ invitation: await response(updated) });
});

export async function privateInvitationForChannel(channelId: string) {
  const invitation = (await db.select().from(privateStreamInvitationsTable).where(eq(privateStreamInvitationsTable.channelId, channelId)).limit(1))[0];
  return invitation ? expireIfNeeded(invitation) : null;
}
export default router;