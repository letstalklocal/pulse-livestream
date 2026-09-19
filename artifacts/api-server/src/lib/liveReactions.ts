import type { WebSocket } from "ws";
import { verifyToken } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { db, liveStreamSessionsTable, premiumStreamAdmissionsTable, usersTable } from "@workspace/db";
import { canAccessChannel } from "./privateChannelAccess";
import { partyChannels } from "./liveParty";

import { isReactionEmoji } from "./reactionEmoji";
import { availableCreatorVideo } from "./creatorVideoAccess";
const demos = new Set(["pulse-gaming-demo", "pulse-music-demo", "pulse-talk-demo", "pulse-art-demo"]);
type Member = { channelId: string; clerkId: string | null; uid: number | null };
const members = new Map<WebSocket, Member>();

export function validReaction(value: any): boolean {
  return isReactionEmoji(value?.emoji) && Number.isInteger(value?.count) && value.count >= 1 && value.count <= 8;
}

async function allowed(member: Member) {
  if (member.channelId.startsWith("creator-video:")) {
    const id = member.channelId.slice("creator-video:".length);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return false;
    return !!member.clerkId && member.uid != null && !!await availableCreatorVideo(id, member.uid);
  }
  if (demos.has(member.channelId)) return true;
  if (!member.clerkId || member.uid == null || !await canAccessChannel(member.channelId, member.clerkId)) return false;
  if (member.channelId.startsWith("private-")) return true;
  const session = (await db.select().from(liveStreamSessionsTable).where(eq(liveStreamSessionsTable.channelId, member.channelId)).limit(1))[0];
  if (!session || session.endedAt || session.isPrivate || session.lastHeartbeatAt.getTime() <= Date.now() - 60_000) return false;
  if (member.uid === session.hostUserId || !session.requiredGiftId || (session.premiumFreeViewerIds ?? []).includes(member.uid)) return true;
  return !!(await db.select({ id: premiumStreamAdmissionsTable.id }).from(premiumStreamAdmissionsTable).where(and(
    eq(premiumStreamAdmissionsTable.sessionId, session.id), eq(premiumStreamAdmissionsTable.viewerUserId, member.uid),
  )).limit(1))[0];
}

/** Ephemeral reactions never enter chat, gifts, or the coin ledger. */
export function attachReactionSocket(ws: WebSocket) {
  let busy = false;
  let nextSend = 0;
  let nextSubscribe = 0;
  ws.on("close", () => members.delete(ws));
  ws.on("message", async raw => {
    if (busy || raw.toString().length > 8192) return;
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type !== "subscribe_reactions" && msg.type !== "reaction") return;
    busy = true;
    try {
      if (msg.type === "subscribe_reactions") {
        if (Date.now() < nextSubscribe) return;
        nextSubscribe = Date.now() + 1000;
        members.delete(ws);
        if (typeof msg.channelId !== "string" || msg.channelId.length > 200) return;
        const clerkId = msg.token ? (await verifyToken(msg.token, { secretKey: process.env.CLERK_SECRET_KEY })).sub : null;
        const user = clerkId ? (await db.select({ uid: usersTable.uid }).from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1))[0] : null;
        const member = { channelId: msg.channelId, clerkId, uid: user?.uid ?? null };
        if (!await allowed(member)) { if (ws.readyState === 1) ws.send(JSON.stringify({ type: "subscription_denied" })); return; }
        if (ws.readyState !== 1) return;
        members.set(ws, member);
        ws.send(JSON.stringify({ type: "reactions_ready" }));
        return;
      }
      const member = members.get(ws);
      if (!member || !validReaction(msg) || Date.now() < nextSend) return;
      if (member.channelId.startsWith("creator-video:") && msg.emoji !== "❤️") return;
      nextSend = Date.now() + 180;
      if (!await allowed(member)) { members.delete(ws); ws.close(1000, "Stream access changed"); return; }
      if (ws.readyState !== 1 || members.get(ws) !== member) return;
      const channels = member.channelId.startsWith("creator-video:") ? [member.channelId] : await partyChannels(member.channelId);
      const payload = JSON.stringify({ type: "reaction", emoji: msg.emoji, count: msg.count });
      await Promise.all([...members].map(async ([target, recipient]) => {
        if (target === ws || target.readyState !== 1 || !channels.includes(recipient.channelId)) return;
        if (!await allowed(recipient)) { members.delete(target); target.close(1000, "Stream access changed"); return; }
        if (target.readyState === 1 && target.bufferedAmount < 65536 && members.get(target) === recipient) target.send(payload);
      }));
    } catch { /* Invalid credentials or unavailable access checks fail closed. */ }
    finally { busy = false; }
  });
}
