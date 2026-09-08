import { Router } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  coinBalancesTable,
  coinTransactionsTable,
  db,
  liveStreamSessionsTable,
  premiumStreamAdmissionsTable,
  privateStreamInvitationsTable,
  streamHistoryTable,
  usersTable,
} from "@workspace/db";
import { AdmitToStreamBody, CreateStreamBody, UpdateViewerCountBody } from "@workspace/api-zod";
import * as wsHub from "../lib/wsHub";
import { clearChat } from "./chat";
import { createPrivateGetUrl } from "../lib/objectStorage";
import { PRIVATE_HEARTBEAT_TTL_MS } from "../lib/privateChannelAccess";

const router = Router();

export const PREMIUM_GIFT_CATALOG = {
  rose: { id: "rose", name: "Rose", emoji: "🌹", coinCost: 1 },
  heart: { id: "heart", name: "Heart", emoji: "❤️", coinCost: 5 },
  party: { id: "party", name: "Party", emoji: "🎉", coinCost: 10 },
  diamond: { id: "diamond", name: "Diamond", emoji: "💎", coinCost: 50 },
  rocket: { id: "rocket", name: "Rocket", emoji: "🚀", coinCost: 100 },
  crown: { id: "crown", name: "Crown", emoji: "👑", coinCost: 500 },
} as const;

export type PremiumGift = (typeof PREMIUM_GIFT_CATALOG)[keyof typeof PREMIUM_GIFT_CATALOG];

export interface StreamRecord {
  sessionId?: number;
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
  requiredGift: PremiumGift | null;
}

const streams = new Map<string, StreamRecord>();

/** Returns the live in-memory record used to authorize live-only operations. */
export function getRuntimeStream(channelId: string): StreamRecord | undefined {
  return streams.get(channelId);
}

function sessionToRuntime(session: typeof liveStreamSessionsTable.$inferSelect): StreamRecord {
  const requiredGift = session.requiredGiftId && session.requiredGiftName && session.requiredGiftEmoji
    && session.requiredGiftCoinCost != null
    ? {
        id: session.requiredGiftId,
        name: session.requiredGiftName,
        emoji: session.requiredGiftEmoji,
        coinCost: session.requiredGiftCoinCost,
      } as PremiumGift
    : null;
  return {
    sessionId: session.id,
    channelId: session.channelId,
    hostUid: session.hostUserId,
    hostName: session.hostName,
    hostAvatarUrl: session.hostAvatarUrl,
    hostBackgroundImagePath: session.hostBackgroundImagePath,
    title: session.title,
    viewerCount: 0,
    startedAt: session.startedAt.toISOString(),
    category: session.category,
    lastHeartbeat: session.lastHeartbeatAt.getTime(),
    peakViewers: 0,
    isPrivate: session.isPrivate,
    requiredGift,
  };
}

/** Finds an active durable stream and restores it to runtime after a restart. */
export async function getActiveRuntimeStream(channelId: string): Promise<StreamRecord | undefined> {
  const runtime = streams.get(channelId);
  if (runtime?.sessionId || runtime?.lastHeartbeat === Infinity) return runtime;
  const session = (await db.select().from(liveStreamSessionsTable).where(and(
    eq(liveStreamSessionsTable.channelId, channelId),
    isNull(liveStreamSessionsTable.endedAt),
  )).limit(1))[0];
  if (!session) return runtime;
  if (session.lastHeartbeatAt.getTime() <= Date.now() - HEARTBEAT_TTL_MS) {
    streams.set(channelId, sessionToRuntime(session));
    await endRuntimeStream(channelId);
    return undefined;
  }
  const restored = sessionToRuntime(session);
  streams.set(channelId, restored);
  return restored;
}

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
  let endedDurably = false;
  const endedAt = new Date();
  if (stream?.sessionId) {
    const ended = await db.update(liveStreamSessionsTable)
      .set({ endedAt })
      .where(and(eq(liveStreamSessionsTable.id, stream.sessionId), isNull(liveStreamSessionsTable.endedAt)))
      .returning({ id: liveStreamSessionsTable.id });
    endedDurably = !!ended[0];
  }
  if (stream) {
    streams.delete(channelId);
    clearChat(channelId);
    if (!stream.isPrivate && (!stream.sessionId || endedDurably)) await saveStreamHistory(stream, endedAt);
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
    requiredGift: null,
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
    requiredGift: null,
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
    requiredGift: null,
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
    requiredGift: null,
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
  const durable = await db.select().from(liveStreamSessionsTable).where(isNull(liveStreamSessionsTable.endedAt));
  for (const session of durable) {
    if (session.lastHeartbeatAt.getTime() <= Date.now() - HEARTBEAT_TTL_MS) {
      streams.set(session.channelId, sessionToRuntime(session));
      await endRuntimeStream(session.channelId);
    } else if (!streams.has(session.channelId)) {
      streams.set(session.channelId, sessionToRuntime(session));
    }
  }
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

  const { channelId, hostUid, hostName, hostAvatarUrl, title, category, requiredGiftId } = parsed.data;
  const privateInvitation = channelId.startsWith("private-")
    ? (await db.select().from(privateStreamInvitationsTable)
      .where(eq(privateStreamInvitationsTable.channelId, channelId)).limit(1))[0] ?? null
    : null;
  const requester = await currentUser(req);
  const privateInvitationIsFresh = (privateInvitation?.status === "active"
    && privateInvitation.updatedAt.getTime() > Date.now() - PRIVATE_HEARTBEAT_TTL_MS)
    || (privateInvitation?.status === "accepted"
      && (privateInvitation.requiredGiftAmount === 0 || privateInvitation.paymentStatus === "paid"));
  if (channelId.startsWith("private-") && (
    !privateInvitation ||
    !privateInvitationIsFresh ||
    privateInvitation.streamerUserId !== hostUid ||
    requester?.uid !== hostUid
  )) {
    res.status(403).json({ error: "Private stream access denied" });
    return;
  }
  if (!privateInvitation && requester?.uid !== hostUid) {
    res.status(403).json({ error: "Authenticated host identity is required" });
    return;
  }
  if (privateInvitation && requiredGiftId) {
    res.status(400).json({ error: "Private streams cannot be Premium" });
    return;
  }

  const requiredGift = requiredGiftId ? PREMIUM_GIFT_CATALOG[requiredGiftId] : null;
  if (requiredGiftId && !requiredGift) {
    res.status(400).json({ error: "Invalid Premium gift" });
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

  const now = new Date();
  const [session] = await db.insert(liveStreamSessionsTable).values({
    channelId,
    hostUserId: hostUid,
    hostName,
    hostAvatarUrl: hostAvatarUrl ?? null,
    hostBackgroundImagePath: host.streamBackgroundImagePath,
    title,
    category,
    requiredGiftId: requiredGift?.id ?? null,
    requiredGiftName: requiredGift?.name ?? null,
    requiredGiftEmoji: requiredGift?.emoji ?? null,
    requiredGiftCoinCost: requiredGift?.coinCost ?? null,
    isPrivate: !!privateInvitation,
    startedAt: now,
    lastHeartbeatAt: now,
  }).onConflictDoNothing().returning();
  if (!session) {
    res.status(400).json({ error: "Channel ID has already been used and cannot be reused" });
    return;
  }

  const stream: StreamRecord = {
    sessionId: session.id,
    channelId,
    hostUid,
    hostName,
    hostAvatarUrl: hostAvatarUrl ?? null,
    hostBackgroundImagePath: host.streamBackgroundImagePath,
    title,
    viewerCount: 0,
    startedAt: session.startedAt.toISOString(),
    category,
    lastHeartbeat: session.lastHeartbeatAt.getTime(),
    peakViewers: 0,
    isPrivate: !!privateInvitation,
    requiredGift,
  };

  streams.set(channelId, stream);
  res.status(201).json({ stream: await toStreamResponse(stream) });
});

class AdmissionIdempotencyConflictError extends Error {}

router.post("/streams/:channelId/admission", async (req, res) => {
  const parsed = AdmitToStreamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const channelId = req.params["channelId"] ?? "";
  const stream = await getActiveRuntimeStream(channelId);
  if (!stream) {
    res.status(404).json({ error: "Stream not found" });
    return;
  }
  if (!stream.requiredGift || stream.isPrivate) {
    res.status(400).json({ error: "Stream does not require Premium admission" });
    return;
  }

  const viewer = await currentUser(req);
  if (!viewer) {
    res.status(401).json({ error: "Authentication is required for Premium admission" });
    return;
  }
  if (viewer.uid === stream.hostUid) {
    res.status(403).json({ error: "Hosts cannot purchase admission to their own stream" });
    return;
  }

  const { idempotencyKey } = parsed.data;
  const gift = stream.requiredGift;
  let admission: { balance: number; charged: boolean } | null;
  try {
    admission = await db.transaction(async (tx) => {
      // Serialize every attempt for this admission, including retries using a
      // different key that would otherwise race the unique admission record.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${channelId}:${viewer.uid}`}))`);

      const existing = (await tx.select()
        .from(premiumStreamAdmissionsTable)
        .where(and(
          eq(premiumStreamAdmissionsTable.channelId, channelId),
          eq(premiumStreamAdmissionsTable.sessionId, stream.sessionId!),
          eq(premiumStreamAdmissionsTable.viewerUserId, viewer.uid),
        ))
        .limit(1))[0];
      if (existing) {
        const balance = (await tx.select({ balance: coinBalancesTable.balance })
          .from(coinBalancesTable)
          .where(eq(coinBalancesTable.userId, viewer.uid))
          .limit(1))[0]?.balance ?? 0;
        return { balance, charged: false };
      }

      // The coin ledger owns idempotency keys globally, so do not let a key
      // from another purchase type be silently reused here.
      const usedKey = (await tx.select({ id: coinTransactionsTable.id })
        .from(coinTransactionsTable)
        .where(eq(coinTransactionsTable.idempotencyKey, idempotencyKey))
        .limit(1))[0];
      if (usedKey) throw new AdmissionIdempotencyConflictError();

      await tx.insert(coinBalancesTable).values({ userId: viewer.uid, balance: 0 }).onConflictDoNothing();
      const debited = await tx.update(coinBalancesTable)
        .set({ balance: sql`${coinBalancesTable.balance} - ${gift.coinCost}`, updatedAt: new Date() })
        .where(and(
          eq(coinBalancesTable.userId, viewer.uid),
          sql`${coinBalancesTable.balance} >= ${gift.coinCost}`,
        ))
        .returning();
      if (!debited[0]) return null;

      await tx.insert(coinBalancesTable).values({ userId: stream.hostUid, balance: 0 }).onConflictDoNothing();
      await tx.update(coinBalancesTable)
        .set({ balance: sql`${coinBalancesTable.balance} + ${gift.coinCost}`, updatedAt: new Date() })
        .where(eq(coinBalancesTable.userId, stream.hostUid));

      const transaction = (await tx.insert(coinTransactionsTable).values({
        fromUserId: viewer.uid,
        toUserId: stream.hostUid,
        amount: gift.coinCost,
        type: "gift",
        giftName: gift.name,
        channelId,
        description: `Premium admission: ${gift.name}`,
        idempotencyKey,
        balanceAfter: debited[0].balance,
      }).returning({ id: coinTransactionsTable.id }))[0];
      if (!transaction) throw new Error("Premium admission ledger transaction was not created");

      await tx.insert(premiumStreamAdmissionsTable).values({
        sessionId: stream.sessionId!,
        channelId,
        viewerUserId: viewer.uid,
        hostUserId: stream.hostUid,
        giftId: gift.id,
        giftName: gift.name,
        giftEmoji: gift.emoji,
        amount: gift.coinCost,
        transactionId: transaction.id,
        idempotencyKey,
      });
      return { balance: debited[0].balance, charged: true };
    });
  } catch (error) {
    if (error instanceof AdmissionIdempotencyConflictError) {
      res.status(409).json({ error: "This idempotency key was already used for a different admission." });
      return;
    }
    req.log.error({ err: error }, "Premium admission transaction failed");
    res.status(500).json({ error: "Premium admission could not be completed. No balances were changed." });
    return;
  }

  if (!admission) {
    const balance = (await db.select({ balance: coinBalancesTable.balance })
      .from(coinBalancesTable)
      .where(eq(coinBalancesTable.userId, viewer.uid))
      .limit(1))[0]?.balance ?? 0;
    res.status(402).json({ error: "Insufficient coins", balance });
    return;
  }

  if (admission.charged) {
    try {
      const total = Number((await db.select({ total: sql<number>`coalesce(sum(${coinTransactionsTable.amount}), 0)` })
        .from(coinTransactionsTable)
        .where(and(eq(coinTransactionsTable.channelId, channelId), eq(coinTransactionsTable.type, "gift"))))[0]?.total ?? 0);
      wsHub.pushEarnings(channelId, total);
      wsHub.pushGift(channelId, gift.name, viewer.name, total);
    } catch (error) {
      req.log.warn({ err: error }, "Premium admission notification failed after commit");
    }
  }

  res.json({ admitted: true, charged: admission.charged, balance: admission.balance });
});

router.get("/streams/:channelId", async (req, res) => {
  const stream = await getActiveRuntimeStream(req.params["channelId"] ?? "");
  if (!stream) {
    res.status(404).json({ error: "Stream not found" });
    return;
  }
  if (!await authorizePrivateStream(req, res, stream)) return;
  res.json({ stream: await toStreamResponse(stream) });
});

router.delete("/streams/:channelId", async (req, res) => {
  const channelId = req.params["channelId"] ?? "";
  const stream = await getActiveRuntimeStream(channelId);
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
  const stream = await getActiveRuntimeStream(channelId);
  if (!stream) {
    res.status(404).json({ error: "Stream not found" });
    return;
  }
  if (!await authorizePrivateStream(req, res, stream, true)) return;
  stream.lastHeartbeat = Date.now();
  if (stream.sessionId) {
    await db.update(liveStreamSessionsTable)
      .set({ lastHeartbeatAt: new Date() })
      .where(and(eq(liveStreamSessionsTable.id, stream.sessionId), isNull(liveStreamSessionsTable.endedAt)));
  }
  res.json({ success: true });
});

router.post("/streams/:channelId/viewers", async (req, res) => {
  const channelId = req.params["channelId"] ?? "";
  const stream = await getActiveRuntimeStream(channelId);
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
  res.json({ stream: await toStreamResponse(stream) });
});

export default router;
