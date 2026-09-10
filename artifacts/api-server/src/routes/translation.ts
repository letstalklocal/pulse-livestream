import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, directMessagesTable, liveStreamSessionsTable, premiumStreamAdmissionsTable } from "@workspace/db";
import { authenticatedUser } from "../lib/streamModeration";
import { canAccessChannel } from "../lib/privateChannelAccess";
import { getChatMessage } from "./chat";
import { TRANSLATION_LANGUAGES, translationAvailable, translateMessageText } from "../lib/messageTranslation";
const router = Router();
const requests = new Map<number, { count: number; until: number }>();
setInterval(() => {
  for (const [uid, entry] of requests) if (entry.until <= Date.now()) requests.delete(uid);
}, 60000).unref();

router.get("/translation/status", async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!await authenticatedUser(req)) return void res.status(401).json({ error: "Sign in required" });
  res.json({ available: translationAvailable() });
});
router.post("/translation/messages", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const viewer = await authenticatedUser(req);
  if (!viewer) return void res.status(401).json({ error: "Sign in required" });
  const { kind, messageId, channelId, targetLanguage } = req.body ?? {};
  if (!["dm", "live"].includes(kind) || typeof messageId !== "string" || messageId.length > 120 || !TRANSLATION_LANGUAGES.has(targetLanguage)) return void res.status(400).json({ error: "Invalid translation request" });
  const now = Date.now();
  const prior = requests.get(viewer.uid);
  const usage = prior && prior.until > now ? prior : { count: 0, until: now + 60000 };
  if (++usage.count > 120) return void res.status(429).json({ error: "Please wait before translating more messages" });
  requests.set(viewer.uid, usage);
  let text: string | undefined;
  if (kind === "dm") {
    if (!/^[1-9]\d{0,9}$/.test(messageId) || Number(messageId) > 2147483647) return void res.status(404).json({ error: "Message not found" });
    const message = (await db.select().from(directMessagesTable).where(eq(directMessagesTable.id, Number(messageId))).limit(1))[0];
    if (!message || ![message.fromUserId, message.toUserId].includes(viewer.uid) || message.kind !== "text") return void res.status(404).json({ error: "Message not found" });
    text = message.text;
  } else {
    if (typeof channelId !== "string" || channelId.length > 200 || !await canAccessChannel(channelId, viewer.clerkId)) return void res.status(404).json({ error: "Message not found" });
    const session = (await db.select().from(liveStreamSessionsTable).where(eq(liveStreamSessionsTable.channelId, channelId)).limit(1))[0];
    if (!session || session.endedAt || session.lastHeartbeatAt.getTime() < now - 60000) return void res.status(404).json({ error: "Message not found" });
    if (session.requiredGiftId && viewer.uid !== session.hostUserId && !session.premiumFreeViewerIds.includes(viewer.uid)) {
      const admission = (await db.select().from(premiumStreamAdmissionsTable).where(and(eq(premiumStreamAdmissionsTable.sessionId, session.id), eq(premiumStreamAdmissionsTable.viewerUserId, viewer.uid))).limit(1))[0];
      if (!admission) return void res.status(403).json({ error: "Enter the stream before translating chat" });
    }
    text = getChatMessage(channelId, messageId)?.text;
  }
  if (!text || text.length > 4000) return void res.status(404).json({ error: "Message not found" });
  try { res.json(await translateMessageText(JSON.stringify([kind, kind === "live" ? channelId : "", messageId]), text, targetLanguage)); }
  catch { res.status(503).json({ error: "Translation is temporarily unavailable" }); }
});
export default router;
