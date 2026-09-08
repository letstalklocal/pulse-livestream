import { Router } from "express";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { coinBalancesTable, coinTransactionsTable, db, directMessagesTable, liveStreamSessionsTable, privateStreamInvitationsTable, usersTable } from "@workspace/db";
import { createPrivateGetUrl } from "../lib/objectStorage";
import { endRuntimeStream } from "./streams";

const router = Router();
const INVITE_TTL_MS = 10 * 60 * 1000;
const ACTIVE_SESSION_TTL_MS = 75 * 1000;
const PAID_START_TTL_MS = 5 * 60 * 1000;
const GIFTS = [
  { id: "rose", name: "Rose", coins: 1 }, { id: "heart", name: "Heart", coins: 5 },
  { id: "party", name: "Party", coins: 10 }, { id: "diamond", name: "Diamond", coins: 50 },
  { id: "rocket", name: "Rocket", coins: 100 }, { id: "crown", name: "Crown", coins: 500 },
] as const;

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
    requiredGiftId: invitation.requiredGiftId, requiredGiftName: invitation.requiredGiftName,
    requiredGiftAmount: invitation.requiredGiftAmount, paidAt: invitation.paidAt?.getTime() ?? null,
    refundedAt: invitation.refundedAt?.getTime() ?? null, paymentStatus: invitation.paymentStatus,
    backgroundImageUrl: await createPrivateGetUrl(invitation.backgroundObjectPath),
  };
}
async function getInvite(id: number) {
  return (await db.select().from(privateStreamInvitationsTable).where(eq(privateStreamInvitationsTable.id, id)).limit(1))[0] ?? null;
}
export async function expirePrivateInvitation(id: number, cancellation = false) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${id})`);
    const invitation = (await tx.select().from(privateStreamInvitationsTable).where(eq(privateStreamInvitationsTable.id, id)).limit(1))[0];
    if (!invitation) return null;
    const now = new Date();
    const paidUnstarted = invitation.status === "accepted" && invitation.requiredGiftAmount > 0 && invitation.paidAt &&
      invitation.paidAt.getTime() <= now.getTime() - PAID_START_TTL_MS;
    const pendingExpired = invitation.status === "pending" && invitation.expiresAt <= now;
    if (!cancellation && !paidUnstarted && !pendingExpired) return invitation;
    if (cancellation && !["pending", "accepted"].includes(invitation.status)) return invitation;
    const status = cancellation ? "cancelled" : "expired";
    if (invitation.status === "accepted" && invitation.requiredGiftAmount > 0 && invitation.paidAt && !invitation.refundedAt) {
      const amount = invitation.requiredGiftAmount;
      // Funds were held in invitation escrow; refund never depends on the streamer balance.
      await tx.insert(coinBalancesTable).values({ userId: invitation.invitedUserId, balance: 0 }).onConflictDoNothing();
      const [recipient] = await tx.update(coinBalancesTable).set({ balance: sql`${coinBalancesTable.balance} + ${amount}`, updatedAt: now })
        .where(eq(coinBalancesTable.userId, invitation.invitedUserId)).returning();
      await tx.insert(coinTransactionsTable).values({
        fromUserId: null, toUserId: invitation.invitedUserId, amount, type: "private_invitation_refund",
        giftName: invitation.requiredGiftName, channelId: invitation.channelId, description: "Private invitation refund",
        idempotencyKey: `private-invitation:${invitation.id}:refund`, balanceAfter: recipient!.balance,
      }).onConflictDoNothing();
      const [updated] = await tx.update(privateStreamInvitationsTable).set({ status, paymentStatus: "refunded", refundedAt: now, cancelledAt: cancellation ? now : undefined, updatedAt: now })
        .where(and(eq(privateStreamInvitationsTable.id, id), eq(privateStreamInvitationsTable.status, "accepted"), sql`${privateStreamInvitationsTable.refundedAt} is null`)).returning();
      return updated ?? invitation;
    }
    const [updated] = await tx.update(privateStreamInvitationsTable).set({
      status, cancelledAt: cancellation ? now : undefined, updatedAt: now,
    }).where(and(eq(privateStreamInvitationsTable.id, id), eq(privateStreamInvitationsTable.status, invitation.status))).returning();
    return updated ?? invitation;
  });
}
async function expireIfNeeded(invitation: typeof privateStreamInvitationsTable.$inferSelect) {
  if ((invitation.status === "pending" && invitation.expiresAt <= new Date()) ||
      (invitation.status === "accepted" && invitation.requiredGiftAmount > 0 && invitation.paidAt && invitation.paidAt.getTime() <= Date.now() - PAID_START_TTL_MS)) {
    return (await expirePrivateInvitation(invitation.id)) ?? invitation;
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
  const requestedGiftId = req.body?.requiredGiftId;
  const gift = requestedGiftId == null || requestedGiftId === "" ? null : GIFTS.find((candidate) => candidate.id === requestedGiftId);
  if (requestedGiftId != null && requestedGiftId !== "" && !gift) return res.status(400).json({ error: "Choose a valid gift from the invitation catalog" });
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
       requiredGiftId: gift?.id ?? null, requiredGiftName: gift?.name ?? null, requiredGiftAmount: gift?.coins ?? 0, paymentStatus: gift ? "pending" : "free",
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
  if (action === "cancel") {
    const updated = await expirePrivateInvitation(id, true);
    if (!updated || updated.status !== "cancelled") return res.status(409).json({ error: "Invitation cannot be cancelled" });
    return res.json({ invitation: await response(updated) });
  }
  if (action === "accept" && invitation.requiredGiftAmount > 0) {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${id})`);
      const current = (await tx.select().from(privateStreamInvitationsTable).where(eq(privateStreamInvitationsTable.id, id)).limit(1))[0];
      if (!current || current.status !== "pending" || current.expiresAt <= new Date()) return null;
      const now = new Date(), amount = current.requiredGiftAmount;
      await tx.insert(coinBalancesTable).values({ userId: user.uid, balance: 0 }).onConflictDoNothing();
      const [debited] = await tx.update(coinBalancesTable).set({ balance: sql`${coinBalancesTable.balance} - ${amount}`, updatedAt: now })
        .where(and(eq(coinBalancesTable.userId, user.uid), sql`${coinBalancesTable.balance} >= ${amount}`)).returning();
      if (!debited) return "insufficient" as const;
      await tx.insert(coinTransactionsTable).values({ fromUserId: user.uid, toUserId: null, amount, type: "private_invitation_hold", giftName: current.requiredGiftName, channelId: current.channelId, description: "Private invitation escrow hold", idempotencyKey: `private-invitation:${current.id}:hold`, balanceAfter: debited.balance });
      const [updated] = await tx.update(privateStreamInvitationsTable).set({ status: "accepted", paymentStatus: "paid", acceptedAt: now, paidAt: now, updatedAt: now }).where(and(eq(privateStreamInvitationsTable.id, id), eq(privateStreamInvitationsTable.status, "pending"))).returning();
      return updated ?? null;
    });
    if (result === "insufficient") return res.status(402).json({ error: "Insufficient coins" });
    if (!result) return res.status(409).json({ error: "Invitation changed, please retry" });
    return res.json({ invitation: await response(result) });
  }
  if (action === "start") {
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${id})`);
      const current = (await tx.select().from(privateStreamInvitationsTable).where(eq(privateStreamInvitationsTable.id, id)).limit(1))[0];
      if (!current || current.status !== "accepted" || (current.requiredGiftAmount > 0 && (!current.paidAt || current.paymentStatus !== "paid"))) return null;
      const now = new Date();
      if (current.requiredGiftAmount > 0 && current.paidAt!.getTime() <= now.getTime() - PAID_START_TTL_MS) return "expired" as const;
      const liveSession = (await tx.select({ id: liveStreamSessionsTable.id }).from(liveStreamSessionsTable).where(and(
        eq(liveStreamSessionsTable.channelId, current.channelId), eq(liveStreamSessionsTable.hostUserId, current.streamerUserId),
        eq(liveStreamSessionsTable.isPrivate, true), isNull(liveStreamSessionsTable.endedAt),
      )).limit(1))[0];
      if (!liveSession) return "no-session" as const;
      if (current.requiredGiftAmount > 0) {
        await tx.insert(coinBalancesTable).values({ userId: current.streamerUserId, balance: 0 }).onConflictDoNothing();
        await tx.update(coinBalancesTable).set({ balance: sql`${coinBalancesTable.balance} + ${current.requiredGiftAmount}`, updatedAt: now })
          .where(eq(coinBalancesTable.userId, current.streamerUserId));
        await tx.insert(coinTransactionsTable).values({ fromUserId: null, toUserId: current.streamerUserId, amount: current.requiredGiftAmount, type: "private_invitation_settlement", giftName: current.requiredGiftName, channelId: current.channelId, description: "Private invitation escrow settlement", idempotencyKey: `private-invitation:${current.id}:settlement`, balanceAfter: null });
      }
      return (await tx.update(privateStreamInvitationsTable).set({ status: "active", paymentStatus: current.requiredGiftAmount > 0 ? "settled" : "free", startedAt: now, updatedAt: now })
        .where(and(eq(privateStreamInvitationsTable.id, id), eq(privateStreamInvitationsTable.status, "accepted"))).returning())[0] ?? null;
    });
    if (updated === "expired") {
      await expirePrivateInvitation(id);
      return res.status(409).json({ error: "This paid invitation expired and was refunded" });
    }
    if (updated === "no-session") return res.status(409).json({ error: "Create the private live session before starting this invitation" });
    if (!updated) return res.status(409).json({ error: "Payment must be confirmed before starting this invitation" });
    return res.json({ invitation: await response(updated) });
  }
  const transitions: Record<string, { from: string[]; to: string; field?: "acceptedAt" | "declinedAt" | "startedAt" | "endedAt" }> = {
    accept: { from: ["pending"], to: "accepted", field: "acceptedAt" },
    decline: { from: ["pending"], to: "declined", field: "declinedAt" },
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

setInterval(() => {
  void (async () => {
    const stale = await db.select({ id: privateStreamInvitationsTable.id }).from(privateStreamInvitationsTable)
      .where(and(eq(privateStreamInvitationsTable.status, "accepted"), sql`${privateStreamInvitationsTable.requiredGiftAmount} > 0`, sql`${privateStreamInvitationsTable.paidAt} <= now() - interval '5 minutes'`));
    await Promise.all(stale.map(({ id }) => expirePrivateInvitation(id)));
  })();
}, 30_000).unref();