import { canAccessChannel } from "../lib/privateChannelAccess";
import { viewerModeration } from "../lib/streamModeration";
import { Router } from "express";
import { RtcTokenBuilder, RtcRole } from "agora-token";
import { GenerateAgoraTokenBody } from "@workspace/api-zod";
import { and, eq, isNull } from "drizzle-orm";
import { db, liveStreamSessionsTable, premiumStreamAdmissionsTable, usersTable } from "@workspace/db";
import { privateInvitationForChannel } from "./private-stream-invitations";

const router = Router();

const APP_ID = process.env["AGORA_APP_ID"] ?? "";
const APP_CERTIFICATE = process.env["AGORA_APP_CERTIFICATE"] ?? "";

router.post("/agora/token", async (req: any, res): Promise<any> => {
  const parsed = GenerateAgoraTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { channelName, role } = parsed.data;
  let tokenUid = parsed.data.uid;
  let rtcChannelName = channelName;
  // A private channel is never authorized from client supplied uid/role. Its
  // durable invitation is the ACL and Clerk determines the Agora UID.
  const invitation = await privateInvitationForChannel(channelName);
  if (invitation) {
    const clerkId = req.auth?.()?.userId;
    const user = clerkId ? (await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1))[0] : null;
    if (!user || (user.uid !== invitation.streamerUserId && user.uid !== invitation.invitedUserId)) {
      return res.status(403).json({ error: "Private stream access denied" });
    }
    if (invitation.status !== "active") return res.status(409).json({ error: "Private stream is not active" });
    if ((user.uid === invitation.streamerUserId && role !== "broadcaster") || (user.uid === invitation.invitedUserId && role !== "audience")) {
      return res.status(403).json({ error: "Private stream role denied" });
    }
    if (!await canAccessChannel(channelName, clerkId)) return res.status(403).json({ error: "Private stream access denied" });
    tokenUid = user.uid;
  }

  if (!invitation) {
    // Public Agora tokens are only minted for a currently active durable live
    // session. This prevents a historical channel name from being reused.
    const session = (await db.select().from(liveStreamSessionsTable).where(and(
      eq(liveStreamSessionsTable.channelId, channelName),
      isNull(liveStreamSessionsTable.endedAt),
    )).limit(1))[0];
    if (!session || session.isPrivate) {
      res.status(404).json({ error: "Active stream not found" });
      return;
    }
    if (session.lastHeartbeatAt.getTime() <= Date.now() - 60_000) {
      await db.update(liveStreamSessionsTable)
        .set({ endedAt: new Date() })
        .where(and(eq(liveStreamSessionsTable.id, session.id), isNull(liveStreamSessionsTable.endedAt)));
      res.status(404).json({ error: "Active stream not found" });
      return;
    }
    const clerkId = req.auth?.()?.userId;
    const user = clerkId
      ? (await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1))[0]
      : null;
    if (!user) {
      res.status(401).json({ error: "Authentication is required for live streams" });
      return;
    }
    const moderation = await viewerModeration(session.id, session.hostUserId, user.uid);
    if (moderation.removed || moderation.blocked) return res.status(403).json({ error: "You no longer have access to this stream" });
    if (role === "broadcaster") {
      if (user.uid !== session.hostUserId) {
        res.status(403).json({ error: "Only the host may broadcast this stream" });
        return;
      }
    } else if (session.requiredGiftId && !(session.premiumFreeViewerIds ?? []).includes(user.uid)) {
      const admission = (await db.select({ id: premiumStreamAdmissionsTable.id })
        .from(premiumStreamAdmissionsTable)
        .where(and(
          eq(premiumStreamAdmissionsTable.sessionId, session.id),
          eq(premiumStreamAdmissionsTable.viewerUserId, user.uid),
        ))
        .limit(1))[0];
      if (!admission) {
        res.status(403).json({ error: "Premium stream admission is required" });
        return;
      }
    }
    tokenUid = user.uid;
    rtcChannelName = session.rtcChannelName ?? channelName;
  }

  if (!APP_ID || !APP_CERTIFICATE) {
    res.status(500).json({ error: "Agora credentials not configured" });
    return;
  }

  const expiresInSeconds = 3600;
  const currentTs = Math.floor(Date.now() / 1000);
  const privilegeExpireTs = currentTs + expiresInSeconds;

  const rtcRole = role === "broadcaster" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

  const token = RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERTIFICATE,
    rtcChannelName,
    tokenUid,
    rtcRole,
    privilegeExpireTs,
    privilegeExpireTs,
  );

  res.json({
    token,
    appId: APP_ID,
    channelName: rtcChannelName,
    uid: tokenUid,
    expiresAt: privilegeExpireTs,
  });
});

router.post("/agora/rtm-token", (req, res) => {
  const { uid } = req.body as { uid?: string | number };
  if (!uid) {
    res.status(400).json({ error: "uid is required" });
    return;
  }
  if (!APP_ID || !APP_CERTIFICATE) {
    res.status(500).json({ error: "Agora credentials not configured" });
    return;
  }
  const expiresInSeconds = 3600;
  const currentTs = Math.floor(Date.now() / 1000);
  const privilegeExpireTs = currentTs + expiresInSeconds;
  // RTM SDK 2.x requires AccessToken2 with RTM privileges — use buildTokenWithRtm
  const token = RtcTokenBuilder.buildTokenWithRtm(
    APP_ID,
    APP_CERTIFICATE,
    "",           // channelName — empty string for RTM-only (no specific RTC channel)
    String(uid),  // account (must match RtmConfig.userId on the client)
    RtcRole.PUBLISHER,
    privilegeExpireTs,
    privilegeExpireTs,
  );
  res.json({ token, appId: APP_ID, uid: String(uid), expiresAt: privilegeExpireTs });
});

export default router;
