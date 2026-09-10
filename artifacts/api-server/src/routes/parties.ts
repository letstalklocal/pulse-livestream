import { canInviteParty } from "../lib/privacy";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db, livePartiesTable, liveBattlesTable, liveStreamSessionsTable } from "@workspace/db";
import { RtcTokenBuilder, RtcRole } from "agora-token";
import { authenticatedUser } from "../lib/streamModeration";
import { contactBlocked } from "../lib/userSafety";
import { activeViewerIds } from "./streams";
import { requireChannelAccess } from "../lib/privateChannelAccess";
import { lockParty, findParty, partyStreams, partyValid, partyMediaReady, partyViewerAllowed, latestBattle, settleBattle, endParty, PARTY_INVITE_MS, BATTLE_DURATION_MS } from "../lib/liveParty";
import { ActOnStreamPartyBody } from "@workspace/api-zod";

const router = Router();
const activeSession = async (channelId: string) => (await db.select().from(liveStreamSessionsTable).where(and(
  eq(liveStreamSessionsTable.channelId, channelId), isNull(liveStreamSessionsTable.endedAt),
)).limit(1))[0];

router.get("/streams/:channelId/party", async (req, res) => {
  const user = await authenticatedUser(req);
  if (!user) return void res.status(401).json({ error: "Sign in required" });
  if (!await requireChannelAccess(req, res, req.params.channelId)) return;
  const party = await findParty(req.params.channelId, db, true);
  if (!party) return void res.json({ party: null, serverTime: Date.now() });
  const [first, second] = await partyStreams(party);
  if (!first || !second) return void res.json({ party: null, serverTime: Date.now() });
  const isHost = [first.hostUserId, second.hostUserId].includes(user.uid);
  if (party.status === "pending" && !isHost) return void res.json({ party: null, serverTime: Date.now() });
  if (!(await partyViewerAllowed(party, user.uid)).allowed) return void res.status(403).json({ error: "Party access denied" });
  let battle: Awaited<ReturnType<typeof latestBattle>> | null = await latestBattle(party.id);
  const mustSettle = battle?.status === "active" && ((battle.endsAt?.getTime() ?? Infinity) <= Date.now() || !partyMediaReady(party))
    || battle?.status === "pending" && battle.expiresAt.getTime() <= Date.now();
  if (mustSettle) battle = await db.transaction(async tx => {
    await lockParty(tx);
    const current = (await tx.select().from(livePartiesTable).where(eq(livePartiesTable.id, party.id)))[0];
    return current?.status === "active" ? settleBattle(current, tx) : null;
  });
  const hosts = [first.hostUserId, second.hostUserId];
  const count = new Set([...activeViewerIds(first.channelId), ...activeViewerIds(second.channelId)].filter(uid => !hosts.includes(uid))).size;
  res.set("Cache-Control", "no-store");
  res.json({ serverTime: Date.now(), party: {
    id: party.id, status: party.status, expiresAt: party.expiresAt.getTime(),
    startedAt: party.startedAt?.getTime() ?? null, ready: partyMediaReady(party), viewerCount: count,
    participants: [first, second].map(s => ({ channelId: s.channelId, rtcChannelName: s.rtcChannelName ?? s.channelId, uid: s.hostUserId, name: s.hostName, avatarUrl: s.hostAvatarUrl })),
    battle: battle ? { id: battle.id, status: battle.status, requesterUid: battle.requesterUid, expiresAt: battle.expiresAt.getTime(),
      startsAt: battle.startsAt?.getTime() ?? null, endsAt: battle.endsAt?.getTime() ?? null,
      firstScore: battle.firstScore, secondScore: battle.secondScore,
      winnerUid: battle.status === "finished" && battle.firstScore !== battle.secondScore ? hosts[battle.firstScore > battle.secondScore ? 0 : 1] : null,
    } : null,
  } });
});

router.get("/streams/:channelId/party/candidates", async (req, res) => {
  const user = await authenticatedUser(req);
  if (!user) return void res.status(401).json({ error: "Sign in required" });
  const own = await activeSession(req.params.channelId);
  if (!own || own.hostUserId !== user.uid) return void res.status(403).json({ error: "Only the live host can invite" });
  const sessions = await db.select().from(liveStreamSessionsTable).where(and(isNull(liveStreamSessionsTable.endedAt), eq(liveStreamSessionsTable.isPrivate, false), isNull(liveStreamSessionsTable.requiredGiftId)));
  const candidates = [];
  for (const s of sessions) {
    if (s.hostUserId === user.uid || Date.now() - s.lastHeartbeatAt.getTime() >= 60000 || await findParty(s.channelId, db, true) || !await canInviteParty(s.hostUserId, user.uid)) continue;
    candidates.push({ channelId: s.channelId, rtcChannelName: s.rtcChannelName ?? s.channelId, uid: s.hostUserId, name: s.hostName, avatarUrl: s.hostAvatarUrl });
  }
  res.json({ users: candidates });
});

router.post("/streams/:channelId/party", async (req, res) => {
  const user = await authenticatedUser(req);
  if (!user) return void res.status(401).json({ error: "Sign in required" });
  const parsed = ActOnStreamPartyBody.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Invalid Party action" });
  const { action, targetChannelId, partyId, battleId } = parsed.data;
  const channelId = req.params.channelId;
  const result = await db.transaction(async tx => {
    await lockParty(tx);
    const own = (await tx.select().from(liveStreamSessionsTable).where(eq(liveStreamSessionsTable.channelId, channelId)).for("update"))[0];
    if (!own || own.endedAt || Date.now() - own.lastHeartbeatAt.getTime() >= 60000) return { status: 404, error: "Your live has ended" };
    if (own.hostUserId !== user.uid) return { status: 403, error: "Only the live host can manage Party" };
    if (own.isPrivate || own.requiredGiftId) return { status: 409, error: "Party is available on public, free lives" };
    const previous = await tx.select().from(livePartiesTable).where(and(
      or(eq(livePartiesTable.firstChannelId, channelId), eq(livePartiesTable.secondChannelId, channelId)),
      inArray(livePartiesTable.status, ["pending", "active"]),
    ));
    for (const p of previous) if (!await partyValid(p, tx)) await endParty(p, tx);
    if (action === "invite") {
      if (!targetChannelId || targetChannelId === channelId) return { status: 400, error: "Choose another live host" };
      const peer = (await tx.select().from(liveStreamSessionsTable).where(eq(liveStreamSessionsTable.channelId, targetChannelId)).for("update"))[0];
      if (!peer || peer.endedAt || peer.isPrivate || peer.requiredGiftId || Date.now() - peer.lastHeartbeatAt.getTime() >= 60000 || peer.hostUserId === user.uid) return { status: 409, error: "This host is not available for Party" };
      if (await contactBlocked(user.uid, peer.hostUserId)) return { status: 403, error: "This host is unavailable" };
      if (!await canInviteParty(peer.hostUserId, user.uid, tx)) return { status: 403, error: "This host only accepts Party invitations from friends." };
      const existing = await findParty(channelId, tx, true);
      if (existing?.status === "pending" && existing.firstChannelId === channelId && existing.secondChannelId === targetChannelId) return {};
      if (existing || await findParty(targetChannelId, tx, true)) return { status: 409, error: "One of these hosts already has a Party or invitation" };
      await tx.insert(livePartiesTable).values({ id: randomUUID(), firstChannelId: channelId, secondChannelId: targetChannelId, status: "pending", expiresAt: new Date(Date.now() + PARTY_INVITE_MS) });
      return {};
    }
    const p = await findParty(channelId, tx, true);
    if (!p || p.id !== partyId) return { status: 409, error: "This Party is no longer available" };
    const isInviter = p.firstChannelId === channelId;
    if (action === "accept") {
      if (isInviter) return { status: 403, error: "Only the invited host can accept" };
      if (p.status === "active") return {};
      if (!(await partyViewerAllowed(p, user.uid)).allowed) return { status: 403, error: "Party access denied" };
      await tx.update(livePartiesTable).set({ status: "active", startedAt: new Date() }).where(eq(livePartiesTable.id, p.id));
      return {};
    }
    if (action === "decline" || action === "cancel") {
      if (p.status !== "pending" || (action === "decline") === isInviter) return { status: 409, error: "Invitation is no longer pending" };
      await endParty(p, tx, "declined");
      return {};
    }
    if (action === "leave") { await endParty(p, tx); return {}; }
    if (p.status !== "active") return { status: 409, error: "Accept the Party first" };
    if (action === "ready") {
      await tx.update(livePartiesTable).set(isInviter ? { firstReadyAt: new Date() } : { secondReadyAt: new Date() }).where(eq(livePartiesTable.id, p.id));
      return {};
    }
    const battle = await settleBattle(p, tx);
    if (action === "battle_request") {
      if (!partyMediaReady(p)) return { status: 409, error: "Wait for both cameras to connect" };
      if (battle && ["pending", "active"].includes(battle.status)) return { status: 409, error: "A VS round is already pending or running" };
      await tx.insert(liveBattlesTable).values({ id: randomUUID(), partyId: p.id, requesterUid: user.uid, status: "pending", expiresAt: new Date(Date.now() + PARTY_INVITE_MS) });
      return {};
    }
    if (action === "battle_end") {
      if (!battle || battle.id !== battleId) return { status: 409, error: "This VS round is no longer available" };
      if (battle.status === "cancelled" || battle.status === "finished") return {};
      if (battle.status !== "active") return { status: 409, error: "This VS round has not started" };
      await tx.update(liveBattlesTable).set({ status: "cancelled", endsAt: new Date() }).where(eq(liveBattlesTable.id, battle.id));
      return {};
    }
    if (!battle || battle.id !== battleId || battle.status !== "pending") return { status: 409, error: "This VS request is no longer pending" };
    if (action === "battle_accept") {
      if (battle.requesterUid === user.uid) return { status: 403, error: "The other host must accept VS" };
      if (!partyMediaReady(p)) return { status: 409, error: "Wait for both cameras to connect" };
      const startsAt = new Date(Date.now() + 3000);
      await tx.update(liveBattlesTable).set({ status: "active", startsAt, endsAt: new Date(startsAt.getTime() + BATTLE_DURATION_MS) }).where(eq(liveBattlesTable.id, battle.id));
      return {};
    }
    if (action === "battle_decline") {
      await tx.update(liveBattlesTable).set({ status: "cancelled" }).where(eq(liveBattlesTable.id, battle.id));
      return {};
    }
    return { status: 400, error: "Unknown Party action" };
  });
  if (result.error) return void res.status(result.status!).json({ error: result.error });
  res.json({ success: true });
});

router.get("/streams/:channelId/party/media", async (req, res) => {
  const user = await authenticatedUser(req);
  if (!user) return void res.status(401).json({ error: "Sign in required" });
  if (!await requireChannelAccess(req, res, req.params.channelId)) return;
  const party = await findParty(req.params.channelId);
  if (!party || !(await partyViewerAllowed(party, user.uid)).allowed) return void res.status(403).json({ error: "Party access denied" });
  const sessions = await partyStreams(party);
  const peer = sessions.find(s => s?.channelId !== req.params.channelId);
  if (!peer) return void res.status(404).json({ error: "Partner is no longer live" });
  const appId = process.env.AGORA_APP_ID;
  const certificate = process.env.AGORA_APP_CERTIFICATE;
  if (!appId || !certificate) return void res.status(503).json({ error: "Live video is unavailable" });
  const channelName = peer.rtcChannelName ?? peer.channelId;
  const expiresAt = Math.floor(Date.now() / 1000) + 120;
  const token = RtcTokenBuilder.buildTokenWithUid(appId, certificate, channelName, user.uid, RtcRole.SUBSCRIBER, expiresAt, expiresAt);
  res.set("Cache-Control", "no-store");
  res.json({ token, appId, channelName, uid: user.uid, expiresAt });
});
export default router;
