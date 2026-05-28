import { Router } from "express";
import { RtcTokenBuilder, RtcRole } from "agora-token";
import { GenerateAgoraTokenBody } from "@workspace/api-zod";

const router = Router();

const APP_ID = process.env["AGORA_APP_ID"] ?? "";
const APP_CERTIFICATE = process.env["AGORA_APP_CERTIFICATE"] ?? "";

router.post("/agora/token", (req, res) => {
  const parsed = GenerateAgoraTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { channelName, uid, role } = parsed.data;

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
    channelName,
    uid,
    rtcRole,
    privilegeExpireTs,
    privilegeExpireTs,
  );

  res.json({
    token,
    appId: APP_ID,
    channelName,
    uid,
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
