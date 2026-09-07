import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, privateStreamInvitationsTable, streamHistoryTable, usersTable } from "@workspace/db";
import { CreateStreamBody, UpdateViewerCountBody } from "@workspace/api-zod";
import * as wsHub from "../lib/wsHub";
import { clearChat } from "./chat";
import { createPrivateGetUrl } from "../lib/objectStorage";
import { PRIVATE_HEARTBEAT_TTL_MS } from "../lib/privateChannelAccess";

const router = Router();

interface StreamRecord {
  channelId: string;
  hostUid: number;
  hostName: string;
  hostAvatarUrl?: string | null;
  hostBackgroundImagePath?: string | null;
  title: string;
  viewerCount: number;
  startedAt: string;
  category: string;
  lastHeartbeat: number;
  peakViewers: number;
  isPrivate?: boolean;
}

const streams = new Map<string, StreamRecord>();

async function toStreamResponse(stream: StreamRecord) {
  const { hostBackgroundImagePath, isPrivate: _isPrivate, ...response } = stream;
  return {
    ...response,
    hostBackgroundImageUrl: hostBackgroundImagePath
      ? await createPrivateGetUrl(hostBackgroundImagePath)
      : null,
  };
}

// How long without a heartbeat before a real stream is considered dead (60 s)
const HEARTBEAT_TTL_MS = 60_000;

async function currentUser(req: any) {
  const clerkId = req.auth?.()?.userId;
  if (!clerkId) return null;
  return (await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1))[0] ?? null;
}

async function authorizePrivateStream(req: any, res: any, stream: StreamRecord, hostOnly = false) {
  if (!stream.isPrivate) return true;
  const invitation = (await db.select().from(privateStreamInvitationsTable)
    .where(eq(privateStreamInvitationsTable.channelId, stream.channelId)).limit(1))[0] ?? null;
  const user = await currentUser(req);
  const invitationIsActive = invitation?.status === "active"
    && invitation.updatedAt.getTime() > Date.now() - PRIVATE_HEARTBEAT_TTL_MS;
  const allowed = invitationIsActive && user && invitation && (
    user.uid === invitation.streamerUserId ||
    (!hostOnly && user.uid === invitation.invitedUserId)
  );
  if (!allowed) {
    if (!invitationIsActive) {
      if (invitation?.status === "active") {
        const now = new Date();
        await db.update(privateStreamInvitationsTable)
          .set({ status: "ended", endedAt: now, updatedAt: now })
          .where(and(
            eq(privateStreamInvitationsTable.id, invitation.id),
            eq(privateStreamInvitationsTable.status, "active"),
          ));
      }
      await endRuntimeStream(stream.channelId);
    }
    res.status(404).json({ error: "Stream not found" });
    return false;
  }
  return true;
}

export async function endRuntimeStream(channelId: string) {
  const stream = streams.get(channelId);
  if (stream) {
    streams.delete(channelId);
    clearChat(channelId);
    if (!stream.isPrivate) await saveStreamHistory(stream, new Date());
  }
  wsHub.pushStreamEnded(channelId);
  return !!stream;
}

// Seed data — Infinity heartbeat so they never expire
const seedStreams: StreamRecord[] = [
  {
    channelId: "pulse-gaming-demo",
    hostUid: 9001,
    hostName: "ProGamer_X",
    title: "Late night ranked grind – Road to Diamond",
    viewerCount: 342,
    startedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    category: "Gaming",
    lastHeartbeat: Infinity,
    peakViewers: 342,
  },
  {
    channelId: "pulse-music-demo",
    hostUid: 9002,
    hostName: "LoFiSoul",
    title: "Chillwave beats and live production session",
    viewerCount: 189,
    startedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    category: "Music",
    lastHeartbeat: Infinity,
    peakViewers: 189,
  },
  {
    channelId: "pulse-talk-demo",
    hostUid: 9003,
    hostName: "TechTalks",
    title: "AI and the Future of Work – open discussion",
    viewerCount: 512,
    startedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    category: "Talk",
    lastHeartbeat: Infinity,
    peakViewers: 512,
  },
  {
    channelId: "pulse-art-demo",
    hostUid: 9004,
    hostName: "SketchWitch",
    title: "Digital portrait painting from scratch",
    viewerCount: 97,
    startedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    category: "Art",
    lastHeartbeat: Infinity,
    peakViewers: 97,
  },
];

for (const s of seedStreams) {
  streams.set(s.channelId, s);
}

// Purge stale real streams every 5 s; write ended streams to DB history
setInterval(async () => {
  const now = Date.now();
  for (const [id, stream] of streams) {
    if (stream.lastHeartbeat !== Infinity && now - stream.lastHeartbeat > HEARTBEAT_TTL_MS) {
      await endRuntimeStream(id);
    }
  }
}, 5_000);

async function saveStreamHistory(stream: StreamRecord, endedAt: Date) {
  try {
    await db
      .insert(streamHistoryTable)
      .values({
        channelId: stream.channelId,
        hostUid: stream.hostUid,
        hostName: stream.hostName,
        title: stream.title,
        category: stream.category,
        startedAt: new Date(stream.startedAt),
        endedAt,
        peakViewers: stream.peakViewers,
      })
      .onConflictDoNothing();
  } catch (_e) {
    // best effort
  }
}

router.get("/streams", async (_req, res) => {
  const list = Array.from(streams.values()).filter((stream) => !stream.isPrivate).sort(
    (a, b) => b.viewerCount - a.viewerCount,
  );
  res.json({ streams: await Promise.all(list.map(toStreamResponse)) });
});

router.post("/streams", async (req, res) => {
  const parsed = CreateStreamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { channelId, hostUid, hostName, hostAvatarUrl, title, category } = parsed.data;
  const privateInvitation = channelId.startsWith("private-")
    ? (await db.select().from(privateStreamInvitationsTable)
      .where(eq(privateStreamInvitationsTable.channelId, channelId)).limit(1))[0] ?? null
    : null;
  const requester = privateInvitation ? await currentUser(req) : null;
  const privateInvitationIsFresh = privateInvitation?.status === "active"
    && privateInvitation.updatedAt.getTime() > Date.now() - PRIVATE_HEARTBEAT_TTL_MS;
  if (channelId.startsWith("private-") && (
    !privateInvitation ||
    !privateInvitationIsFresh ||
    privateInvitation.streamerUserId !== hostUid ||
    requester?.uid !== hostUid
  )) {
    res.status(403).json({ error: "Private stream access denied" });
    return;
  }

  const [host] = await db
    .select({ streamBackgroundImagePath: usersTable.streamBackgroundImagePath })
    .from(usersTable)
    .where(eq(usersTable.uid, hostUid))
    .limit(1);
  if (!host?.streamBackgroundImagePath) {
    res.status(400).json({ error: "A stream background image is required before going live" });
    return;
  }

  if (streams.has(channelId)) {
    res.status(400).json({ error: "Stream already exists" });
    return;
  }

  for (const [existingChannelId, existingStream] of streams) {
    if (existingStream.lastHeartbeat !== Infinity && existingStream.hostUid === hostUid) {
      await endRuntimeStream(existingChannelId);
    }
  }

  const stream: StreamRecord = {
    channelId,
    hostUid,
    hostName,
    hostAvatarUrl: hostAvatarUrl ?? null,
    hostBackgroundImagePath: host.streamBackgroundImagePath,
    title,
    viewerCount: 0,
    startedAt: new Date().toISOString(),
    category,
    lastHeartbeat: Date.now(),
    peakViewers: 0,
    isPrivate: !!privateInvitation,
  };

  streams.set(channelId, stream);
  res.status(201).json({ stream: await toStreamResponse(stream) });
});

router.get("/streams/:channelId", async (req, res) => {
  const stream = streams.get(req.params["channelId"] ?? "");
  if (!stream) {
    res.status(404).json({ error: "Stream not found" });
    return;
  }
  if (!await authorizePrivateStream(req, res, stream)) return;
  res.json({ stream: await toStreamResponse(stream) });
});

router.delete("/streams/:channelId", async (req, res) => {
  const channelId = req.params["channelId"] ?? "";
  const stream = streams.get(channelId);
  if (!stream) {
    res.status(404).json({ error: "Stream not found" });
    return;
  }
  if (!await authorizePrivateStream(req, res, stream, true)) return;
  await endRuntimeStream(channelId);
  res.json({ success: true });
});

// Heartbeat — broadcaster pings every ~30 s to prove they're still live
router.post("/streams/:channelId/heartbeat", async (req, res) => {
  const channelId = req.params["channelId"] ?? "";
  const stream = streams.get(channelId);
  if (!stream) {
    res.status(404).json({ error: "Stream not found" });
    return;
  }
  if (!await authorizePrivateStream(req, res, stream, true)) return;
  stream.lastHeartbeat = Date.now();
  res.json({ success: true });
});

router.post("/streams/:channelId/viewers", async (req, res) => {
  const channelId = req.params["channelId"] ?? "";
  const stream = streams.get(channelId);
  if (!stream) {
    res.status(404).json({ error: "Stream not found" });
    return;
  }
  if (!await authorizePrivateStream(req, res, stream)) return;

  const parsed = UpdateViewerCountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { action } = parsed.data;
  if (action === "join") {
    stream.viewerCount += 1;
    stream.peakViewers = Math.max(stream.peakViewers, stream.viewerCount);
  } else if (action === "leave" && stream.viewerCount > 0) {
    stream.viewerCount -= 1;
  }

  streams.set(channelId, stream);
  res.json({ stream });
});

export default router;
