import { and, eq, isNull } from "drizzle-orm";
import { db, liveStreamSessionsTable, premiumStreamAdmissionsTable } from "@workspace/db";
import { authenticatedUser, viewerModeration } from "../lib/streamModeration";
import { Router } from "express";
import { requireChannelAccess } from "../lib/privateChannelAccess";
import { findParty, partyChannels, partyViewerAllowed } from "../lib/liveParty";

const router = Router();

import { chatStore, deletedMessages, MAX_MESSAGES, getChatMessage, type ChatMessage } from "../lib/liveChat";
export { getChatMessage, clearChat } from "../lib/liveChat";

router.get("/streams/:channelId/chat", async (req, res) => {
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];
  const channelId = req.params["channelId"] ?? "";
  if (!await requireChannelAccess(req, res, channelId)) return;
  const since = parseInt(req.query["since"] as string ?? "0", 10) || 0;
  const all = chatStore.get(channelId) ?? [];
  const messages = since > 0 ? all.filter((m) => m.ts > since) : all;
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.json({ messages, deletedIds: deletedMessages.get(channelId) ?? [] });
});

router.post("/streams/:channelId/chat", async (req, res) => {
  const channelId = req.params["channelId"] ?? "";
  if (!await requireChannelAccess(req, res, channelId)) return;
  const viewer = await authenticatedUser(req);
  if (!viewer) return void res.status(401).json({ error: "Sign in to chat" });
  const session = (await db.select().from(liveStreamSessionsTable).where(and(eq(liveStreamSessionsTable.channelId, channelId), isNull(liveStreamSessionsTable.endedAt))).limit(1))[0];
  if (!session || session.lastHeartbeatAt.getTime() < Date.now() - 60000) return void res.status(404).json({ error: "Active stream not found" });
  const moderation = await viewerModeration(session.id, session.hostUserId, viewer.uid);
  if (moderation.blocked || moderation.removed) return void res.status(403).json({ error: "Stream access denied" });
  if (moderation.muted) return void res.status(403).json({ error: "The host has muted your chat for this stream" });
  const party = await findParty(channelId);
  if (party) {
    const access = await partyViewerAllowed(party, viewer.uid);
    if (!access.allowed || access.muted) return void res.status(403).json({ error: "You cannot chat in this Party" });
  }
  if (session.requiredGiftId && viewer.uid !== session.hostUserId && !session.premiumFreeViewerIds.includes(viewer.uid)) {
    const admission = (await db.select().from(premiumStreamAdmissionsTable).where(and(eq(premiumStreamAdmissionsTable.sessionId, session.id), eq(premiumStreamAdmissionsTable.viewerUserId, viewer.uid))).limit(1))[0];
    if (!admission) return void res.status(403).json({ error: "Enter the Premium stream before chatting" });
  }
  const { text, color } = req.body ?? {};
  if (typeof text !== "string" || !text.trim() || text.length > 2000) return void res.status(400).json({ error: "Enter a message under 2,000 characters" });

  const message: ChatMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    senderName: viewer.name,
    senderUid: viewer.uid,
    text: text.trim(),
    color: typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color : "#FF1966",
    ts: Date.now(),
  };

  const destinations = party ? [party.firstChannelId, party.secondChannelId] : [channelId];
  for (const destination of destinations) {
    const existing = chatStore.get(destination) ?? [];
    chatStore.set(destination, [...existing, message].slice(-MAX_MESSAGES));
  }

  res.json({ message });
});

router.delete("/streams/:channelId/chat/:messageId", async (req, res) => {
  const host = await authenticatedUser(req);
  if (!host) return void res.status(401).json({ error: "Sign in required" });
  const session = (await db.select().from(liveStreamSessionsTable).where(and(eq(liveStreamSessionsTable.channelId, req.params.channelId), isNull(liveStreamSessionsTable.endedAt))).limit(1))[0];
  if (!session || session.hostUserId !== host.uid) return void res.status(403).json({ error: "Only the live host can remove messages" });
  const destinations = await partyChannels(req.params.channelId);
  if (!destinations.some(channel => getChatMessage(channel, req.params.messageId))) return void res.status(404).json({ error: "Message not found" });
  for (const channel of destinations) {
    chatStore.set(channel, (chatStore.get(channel) ?? []).filter(message => message.id !== req.params.messageId));
    deletedMessages.set(channel, [...(deletedMessages.get(channel) ?? []), req.params.messageId].slice(-MAX_MESSAGES));
  }
  res.json({ success: true });
});

export default router;
