import { publicLiveIdentity, visibleLiveViewer, resolveLiveUid } from "../lib/incognito";
import { removeAgoraViewers, allowAgoraViewer } from "../lib/agoraViewerRemoval";
import { Router } from "express";
import { partyChannels, findParty, partyStreams } from "../lib/liveParty";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { db, premiumGiftRequestsTable, premiumGiftViewersTable, usersTable, liveStreamSessionsTable, streamModerationTable, creatorBlocksTable, streamReportsTable, premiumIdentitiesTable, userBlocksTable } from "@workspace/db";
import { authenticatedUser } from "../lib/streamModeration";
import { activeViewerIds, forgetViewer, getActiveRuntimeStream, getRuntimeStream } from "./streams";
import { createPrivateGetUrl } from "../lib/objectStorage";
import { disconnectViewer, pushStreamUpdated } from "../lib/wsHub";
const router = Router();

router.get("/streams/:channelId/moderation", async (req, res) => {
  const host = await authenticatedUser(req);
  if (!host) return void res.status(401).json({ error: "Sign in required" });
  const stream = await getActiveRuntimeStream(req.params.channelId);
  if (!stream?.sessionId) return void res.status(404).json({ error: "Stream not found" });
  if (stream.hostUid !== host.uid) return void res.status(403).json({ error: "Only the host can manage viewers" });
  const [restrictions, blocks, expiredGifts] = await Promise.all([
    db.select().from(streamModerationTable).where(eq(streamModerationTable.sessionId, stream.sessionId)),
    db.select().from(creatorBlocksTable).where(eq(creatorBlocksTable.hostUserId, host.uid)),
    db.select({ uid: premiumGiftViewersTable.viewerUserId }).from(premiumGiftViewersTable)
      .innerJoin(premiumGiftRequestsTable, eq(premiumGiftRequestsTable.id, premiumGiftViewersTable.requestId))
      .where(and(eq(premiumGiftRequestsTable.sessionId, stream.sessionId), lte(premiumGiftRequestsTable.deadline, new Date()), isNull(premiumGiftViewersTable.transactionId), isNull(premiumGiftViewersTable.waivedAt))),
  ]);
  const present = new Set((await partyChannels(stream.channelId)).flatMap(activeViewerIds));
  const ids = [...new Set([...present, ...expiredGifts.map(row => row.uid), ...restrictions.filter(item => item.muted || item.removed).map(item => item.viewerUserId), ...blocks.map(item => item.viewerUserId)])];
  const people = ids.length ? await db.select().from(usersTable).where(inArray(usersTable.uid, ids)).orderBy(usersTable.name) : [];
  const anonymousBlocks = await db.select().from(userBlocksTable).where(eq(userBlocksTable.blockerUserId, host.uid));
  const users = await Promise.all(people.map(async person => {
    const blockedIdentity = anonymousBlocks.find(block => block.blockedUserId === person.uid && block.incognitoIdentityId);
    if (!blockedIdentity && !await visibleLiveViewer(stream.channelId, person.uid)) return null;
    const identity = blockedIdentity
      ? { uid: -blockedIdentity.incognitoIdentityId!, name: blockedIdentity.incognitoAlias ?? "Incognito", isIncognito: true }
      : await publicLiveIdentity(stream.channelId, person.uid, person.name);
    const restriction = restrictions.find(item => item.viewerUserId === person.uid);
    return { ...identity,
      avatarImageUrl: !identity.isIncognito && person.avatarImagePath ? await createPrivateGetUrl(person.avatarImagePath) : null,
      present: present.has(person.uid), muted: restriction?.muted ?? false, removed: expiredGifts.some(row => row.uid === person.uid) || (restriction?.removed ?? false),
      blocked: blocks.some(item => item.viewerUserId === person.uid),
    };
  }));
  res.json({ users: users.filter(Boolean) });
});

router.post("/streams/:channelId/moderation", async (req, res) => {
  const host = await authenticatedUser(req);
  if (!host) return void res.status(401).json({ error: "Sign in required" });
  const { viewerUid: requestedUid, action } = req.body ?? {};
  if (!Number.isInteger(requestedUid) || requestedUid === 0) return void res.status(400).json({ error: "Invalid viewer" });
  const viewerUid = await resolveLiveUid(req.params.channelId, requestedUid);
  if (!Number.isInteger(viewerUid) || viewerUid <= 0 || !["mute", "unmute", "remove", "allow", "block", "unblock"].includes(action)) return void res.status(400).json({ error: "Invalid moderation action" });
  if (viewerUid === host.uid) return void res.status(400).json({ error: "You cannot moderate yourself" });
  const channelId = req.params.channelId;
  const party = await findParty(channelId);
  if (party && (await partyStreams(party)).some(s => s?.hostUserId === viewerUid)) return void res.status(400).json({ error: "Leave Party to disconnect the other host" });
  const result = await db.transaction(async tx => {
    const session = (await tx.select().from(liveStreamSessionsTable).where(and(eq(liveStreamSessionsTable.channelId, channelId), isNull(liveStreamSessionsTable.endedAt))).for("update"))[0];
    if (!session || session.lastHeartbeatAt.getTime() < Date.now() - 60000) return { status: 404, error: "Active stream not found" };
    if (session.hostUserId !== host.uid) return { status: 403, error: "Only the host can manage viewers" };
    if (session.isPrivate) return { status: 400, error: "These controls are for public live rooms" };
    if (!(await tx.select({ uid: usersTable.uid }).from(usersTable).where(eq(usersTable.uid, viewerUid)).limit(1))[0]) return { status: 404, error: "Viewer not found" };
    const condition = and(eq(streamModerationTable.sessionId, session.id), eq(streamModerationTable.viewerUserId, viewerUid));
    const prior = (await tx.select().from(streamModerationTable).where(condition).limit(1))[0];
    const blockCondition = and(eq(creatorBlocksTable.hostUserId, host.uid), eq(creatorBlocksTable.viewerUserId, viewerUid));
    const blocked = (await tx.select().from(creatorBlocksTable).where(blockCondition).limit(1))[0];
    let rotate = false;
    if (action === "block") {
      await tx.insert(creatorBlocksTable).values({ hostUserId: host.uid, viewerUserId: viewerUid }).onConflictDoNothing();
      if (requestedUid < 0) {
        const identity = (await tx.select().from(premiumIdentitiesTable).where(eq(premiumIdentitiesTable.id, -requestedUid)).limit(1))[0];
        if (identity?.incognito) await tx.update(userBlocksTable).set({ incognitoIdentityId: identity.id, incognitoAlias: `Incognito ${identity.aliasNumber}` })
          .where(and(eq(userBlocksTable.blockerUserId, host.uid), eq(userBlocksTable.blockedUserId, viewerUid)));
      }
      rotate = !blocked;
    } else if (action === "unblock") {
      await tx.delete(creatorBlocksTable).where(blockCondition);
    } else {
      const values = { sessionId: session.id, viewerUserId: viewerUid, muted: prior?.muted ?? false, removed: prior?.removed ?? false, updatedAt: new Date() };
      if (action === "mute" || action === "unmute") values.muted = action === "mute";
      if (action === "remove" || action === "allow") values.removed = action === "remove";
      rotate = action === "remove" && !prior?.removed && !blocked;
      await tx.insert(streamModerationTable).values(values).onConflictDoUpdate({ target: [streamModerationTable.sessionId, streamModerationTable.viewerUserId], set: { muted: values.muted, removed: values.removed, updatedAt: values.updatedAt } });
    }
    if ((action === "allow" && !blocked) || (action === "unblock" && !prior?.removed)) {
      const unpaid = action === "unblock" ? await tx.select({ id: premiumGiftRequestsTable.id }).from(premiumGiftRequestsTable)
        .innerJoin(premiumGiftViewersTable, eq(premiumGiftViewersTable.requestId, premiumGiftRequestsTable.id))
        .where(and(eq(premiumGiftRequestsTable.sessionId, session.id), eq(premiumGiftViewersTable.viewerUserId, viewerUid), lte(premiumGiftRequestsTable.deadline, new Date()), isNull(premiumGiftViewersTable.transactionId), isNull(premiumGiftViewersTable.waivedAt))).limit(1) : [];
      // Removing one restriction must not lift a different outstanding restriction.
      if (!unpaid.length) {
        try { await allowAgoraViewer(tx, session, viewerUid); }
        catch { throw new Error("Could not restore Agora access. Please retry allowing this viewer back."); }
      }
    }
    if (action === "allow") {
      const expired = await tx.select({ id: premiumGiftRequestsTable.id }).from(premiumGiftRequestsTable)
        .where(and(eq(premiumGiftRequestsTable.sessionId, session.id), lte(premiumGiftRequestsTable.deadline, new Date())));
      if (expired.length) await tx.update(premiumGiftViewersTable).set({ waivedAt: new Date() })
        .where(and(eq(premiumGiftViewersTable.viewerUserId, viewerUid), inArray(premiumGiftViewersTable.requestId, expired.map(row => row.id)), isNull(premiumGiftViewersTable.transactionId)));
    }
    if (rotate) rotate = await removeAgoraViewers(tx, session, [viewerUid]);
    // Rotate only when individual Agora removal could not enforce access.
    const rtcChannelName = rotate ? `live-${randomUUID()}` : session.rtcChannelName;
    if (rotate) await tx.update(liveStreamSessionsTable).set({ rtcChannelName }).where(eq(liveStreamSessionsTable.id, session.id));
    return { rtcChannelName, rotate };
  });
  if ("error" in result) return void res.status(result.status!).json({ error: result.error });
  const runtime = getRuntimeStream(channelId);
  if (runtime && result.rtcChannelName) runtime.rtcChannelName = result.rtcChannelName;
  if (action === "remove" || action === "block") {
    forgetViewer(channelId, viewerUid);
    disconnectViewer(channelId, viewerUid);
  }
  pushStreamUpdated(channelId);
  res.json({ success: true });
});

router.post("/streams/:channelId/reports", async (req, res) => {
  const reporter = await authenticatedUser(req);
  if (!reporter) return void res.status(401).json({ error: "Sign in to report a stream" });
  const { reason, details = "" } = req.body ?? {};
  if (!["harassment", "spam", "sexual_content", "violence", "child_safety", "other"].includes(reason) || typeof details !== "string" || details.length > 2000) return void res.status(400).json({ error: "Choose a reason and keep details under 2,000 characters" });
  const session = (await db.select().from(liveStreamSessionsTable).where(eq(liveStreamSessionsTable.channelId, req.params.channelId)).limit(1))[0];
  if (!session) return void res.status(404).json({ error: "Stream not found" });
  if (session.hostUserId === reporter.uid) return void res.status(400).json({ error: "You cannot report your own stream" });
  await db.insert(streamReportsTable).values({ sessionId: session.id, reporterUserId: reporter.uid, reason, details: details.trim() }).onConflictDoNothing();
  res.status(201).json({ success: true });
});
export default router;
