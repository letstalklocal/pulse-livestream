import { and, eq, isNull } from "drizzle-orm";
import { db, liveStreamSessionsTable, premiumStreamAdmissionsTable } from "@workspace/db";
import { authenticatedUser, viewerModeration } from "../lib/streamModeration";
import { Router } from "express";
import { requireChannelAccess } from "../lib/privateChannelAccess";

const router = Router();

interface ChatMessage {
  id: string;
  senderName: string;
  senderUid?: number;
  text: string;
  color: string;
  ts: number;
}

const chatStore = new Map<string, ChatMessage[]>();
const MAX_MESSAGES = 200;

export function clearChat(channelId: string) {
  chatStore.delete(channelId);
}

router.get("/streams/:channelId/chat", async (req, res) => {
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];
  const channelId = req.params["channelId"] ?? "";
  if (!await requireChannelAccess(req, res, channelId)) return;
  const since = parseInt(req.query["since"] as string ?? "0", 10) || 0;
  const all = chatStore.get(channelId) ?? [];
  const messages = since > 0 ? all.filter((m) => m.ts > since) : all;
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.json({ messages });
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

  const existing = chatStore.get(channelId) ?? [];
  const updated = [...existing, message].slice(-MAX_MESSAGES);
  chatStore.set(channelId, updated);

  res.json({ message });
});

export default router;
