import { Router } from "express";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, usersTable, liveStreamSessionsTable, streamModerationTable, creatorBlocksTable, streamReportsTable } from "@workspace/db";
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
  const [restrictions, blocks] = await Promise.all([
    db.select().from(streamModerationTable).where(eq(streamModerationTable.sessionId, stream.sessionId)),
    db.select().from(creatorBlocksTable).where(eq(creatorBlocksTable.hostUserId, host.uid)),
  ]);
  const present = new Set(activeViewerIds(stream.channelId));
  const ids = [...new Set([...present, ...restrictions.filter(item => item.muted || item.removed).map(item => item.viewerUserId), ...blocks.map(item => item.viewerUserId)])];
  const people = ids.length ? await db.select().from(usersTable).where(inArray(usersTable.uid, ids)).orderBy(usersTable.name) : [];
  res.json({ users: await Promise.all(people.map(async person => {
    const restriction = restrictions.find(item => item.viewerUserId === person.uid);
    return { uid: person.uid, name: person.name,
      avatarImageUrl: person.avatarImagePath ? await createPrivateGetUrl(person.avatarImagePath) : null,
      present: present.has(person.uid), muted: restriction?.muted ?? false, removed: restriction?.removed ?? false,
      blocked: blocks.some(item => item.viewerUserId === person.uid),
    };
  })) });
});

router.post("/streams/:channelId/moderation", async (req, res) => {
  const host = await authenticatedUser(req);
  if (!host) return void res.status(401).json({ error: "Sign in required" });
  const { viewerUid, action } = req.body ?? {};
  if (!Number.isInteger(viewerUid) || viewerUid <= 0 || !["mute", "unmute", "remove", "allow", "block", "unblock"].includes(action)) return void res.status(400).json({ error: "Invalid moderation action" });
  if (viewerUid === host.uid) return void res.status(400).json({ error: "You cannot moderate yourself" });
  const channelId = req.params.channelId;
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
    // Old audience tokens cannot receive the broadcaster after the media channel changes.
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
