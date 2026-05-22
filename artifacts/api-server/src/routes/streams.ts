import { Router } from "express";
import { CreateStreamBody, UpdateViewerCountBody } from "@workspace/api-zod";

const router = Router();

interface StreamRecord {
  channelId: string;
  hostUid: number;
  hostName: string;
  title: string;
  viewerCount: number;
  startedAt: string;
  category: string;
  lastHeartbeat: number; // ms timestamp — seed streams use a far-future value
}

const streams = new Map<string, StreamRecord>();

// How long without a heartbeat before a real stream is considered dead (15 s)
const HEARTBEAT_TTL_MS = 15_000;

// Seed data so discovery is never empty — use Infinity so they're never expired
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
  },
];

for (const s of seedStreams) {
  streams.set(s.channelId, s);
}

// Purge stale real streams every 5 seconds
setInterval(() => {
  const now = Date.now();
  for (const [id, stream] of streams) {
    if (stream.lastHeartbeat !== Infinity && now - stream.lastHeartbeat > HEARTBEAT_TTL_MS) {
      streams.delete(id);
    }
  }
}, 5_000);

router.get("/streams", (_req, res) => {
  const list = Array.from(streams.values()).sort(
    (a, b) => b.viewerCount - a.viewerCount,
  );
  res.json({ streams: list });
});

router.post("/streams", (req, res) => {
  const parsed = CreateStreamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { channelId, hostUid, hostName, title, category } = parsed.data;

  if (streams.has(channelId)) {
    res.status(400).json({ error: "Stream already exists" });
    return;
  }

  const stream: StreamRecord = {
    channelId,
    hostUid,
    hostName,
    title,
    viewerCount: 0,
    startedAt: new Date().toISOString(),
    category,
    lastHeartbeat: Date.now(),
  };

  streams.set(channelId, stream);
  res.status(201).json({ stream });
});

router.get("/streams/:channelId", (req, res) => {
  const stream = streams.get(req.params["channelId"] ?? "");
  if (!stream) {
    res.status(404).json({ error: "Stream not found" });
    return;
  }
  res.json({ stream });
});

router.delete("/streams/:channelId", (req, res) => {
  const channelId = req.params["channelId"] ?? "";
  if (!streams.has(channelId)) {
    res.status(404).json({ error: "Stream not found" });
    return;
  }
  streams.delete(channelId);
  res.json({ success: true });
});

// Heartbeat — broadcaster calls this every ~8 s to prove they're still live
router.post("/streams/:channelId/heartbeat", (req, res) => {
  const channelId = req.params["channelId"] ?? "";
  const stream = streams.get(channelId);
  if (!stream) {
    res.status(404).json({ error: "Stream not found" });
    return;
  }
  stream.lastHeartbeat = Date.now();
  res.json({ success: true });
});

router.post("/streams/:channelId/viewers", (req, res) => {
  const channelId = req.params["channelId"] ?? "";
  const stream = streams.get(channelId);
  if (!stream) {
    res.status(404).json({ error: "Stream not found" });
    return;
  }

  const parsed = UpdateViewerCountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { action } = parsed.data;
  if (action === "join") {
    stream.viewerCount += 1;
  } else if (action === "leave" && stream.viewerCount > 0) {
    stream.viewerCount -= 1;
  }

  streams.set(channelId, stream);
  res.json({ stream });
});

export default router;
