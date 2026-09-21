import { pushPrivateGift } from "./incognito";
import { removeAgoraViewers } from "./agoraViewerRemoval";
import { viewerModeration } from "./streamModeration";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  db,
  coinBalancesTable as balances,
  coinTransactionsTable as ledger,
  liveStreamSessionsTable as sessions,
  premiumStreamAdmissionsTable as admissions,
  premiumGiftRequestsTable as requests,
  premiumGiftViewersTable as viewers,
} from "@workspace/db";
import * as wsHub from "./wsHub";

export class PremiumGiftError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
type Gift = { id: string; name: string; emoji: string; coinCost: number };
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const activeSession = async (tx: Transaction, channelId: string) => {
  const session = (
    await tx
      .select()
      .from(sessions)
      .where(and(eq(sessions.channelId, channelId), isNull(sessions.endedAt)))
      .for("update")
  )[0];
  if (!session || session.lastHeartbeatAt.getTime() <= Date.now() - 60_000)
    throw new PremiumGiftError(404, "Active stream not found");
  return session;
};

/** Called by the timer and request paths; the session lock serializes expiry with payments. */
export async function settlePremiumGiftRequests(channelId?: string) {
  const due = await db
    .select({ id: requests.id, channelId: sessions.channelId })
    .from(requests)
    .innerJoin(sessions, eq(sessions.id, requests.sessionId))
    .where(
      and(
        isNull(requests.settledAt),
        lte(requests.deadline, new Date()),
        channelId ? eq(sessions.channelId, channelId) : undefined,
      ),
    );
  const results = [];
  for (const item of due) {
    const result = await db.transaction(async (tx) => {
      const session = (
        await tx
          .select()
          .from(sessions)
          .where(eq(sessions.channelId, item.channelId))
          .for("update")
      )[0];
      const request = (
        await tx.select().from(requests).where(eq(requests.id, item.id))
      )[0];
      if (
        !session ||
        !request ||
        request.settledAt ||
        request.deadline.getTime() > Date.now()
      )
        return null;
      const unpaid = await tx
        .select({ uid: viewers.viewerUserId })
        .from(viewers)
        .where(
          and(
            eq(viewers.requestId, request.id),
            isNull(viewers.transactionId),
            isNull(viewers.waivedAt),
          ),
        );
      await tx
        .update(requests)
        .set({ settledAt: new Date() })
        .where(eq(requests.id, request.id));
      if (
        unpaid.length &&
        !session.endedAt &&
        (await removeAgoraViewers(
          tx,
          session,
          unpaid.map((row) => row.uid),
        ))
      ) {
        // Fallback preserves access enforcement if native removal is unavailable.
        await tx
          .update(sessions)
          .set({ rtcChannelName: `premium-${randomUUID()}` })
          .where(eq(sessions.id, session.id));
      }
      return {
        channelId: session.channelId,
        unpaid: unpaid.map((row) => row.uid),
      };
    });
    if (result) {
      for (const uid of result.unpaid)
        wsHub.disconnectViewer(result.channelId, uid);
      wsHub.pushStreamUpdated(result.channelId);
      results.push(result);
    }
  }
  return results;
}

export async function createPremiumGiftRequest(
  channelId: string,
  hostUid: number,
  gift: Gift,
  durationSeconds: 30 | 60,
  id: string,
  candidateIds: number[],
) {
  await settlePremiumGiftRequests(channelId);
  const request = await db.transaction(async (tx) => {
    const session = await activeSession(tx, channelId);
    if (session.hostUserId !== hostUid)
      throw new PremiumGiftError(403, "Only the host can request a gift");
    if (!session.requiredGiftId || session.isPrivate)
      throw new PremiumGiftError(400, "Gift requests require a Premium live");
    const retry = (
      await tx.select().from(requests).where(eq(requests.id, id))
    )[0];
    if (retry) {
      if (
        retry.sessionId !== session.id ||
        retry.giftId !== gift.id ||
        retry.durationSeconds !== durationSeconds
      )
        throw new PremiumGiftError(409, "This request key was already used");
      return retry;
    }
    if (
      (
        await tx
          .select({ id: requests.id })
          .from(requests)
          .where(
            and(eq(requests.sessionId, session.id), isNull(requests.settledAt)),
          )
          .limit(1)
      )[0]
    )
      throw new PremiumGiftError(409, "A gift request is already running");
    const admitted = candidateIds.length
      ? await tx
          .select({ uid: admissions.viewerUserId })
          .from(admissions)
          .where(
            and(
              eq(admissions.sessionId, session.id),
              inArray(admissions.viewerUserId, candidateIds),
            ),
          )
      : [];
    const allowed = new Set([
      ...session.premiumFreeViewerIds,
      ...admitted.map((row) => row.uid),
    ]);
    const targets: number[] = [];
    for (const uid of new Set(candidateIds)) {
      if (uid === hostUid || !allowed.has(uid)) continue;
      const moderation = await viewerModeration(session.id, hostUid, uid);
      if (!moderation.removed && !moderation.blocked) targets.push(uid);
    }
    if (!targets.length)
      throw new PremiumGiftError(409, "No viewers are currently watching");
    const now = new Date();
    const [created] = await tx
      .insert(requests)
      .values({
        id,
        sessionId: session.id,
        giftId: gift.id,
        giftName: gift.name,
        giftEmoji: gift.emoji,
        coinCost: gift.coinCost,
        durationSeconds,
        createdAt: now,
        deadline: new Date(now.getTime() + durationSeconds * 1000),
      })
      .returning();
    await tx
      .insert(viewers)
      .values(targets.map((viewerUserId) => ({ requestId: id, viewerUserId })));
    return created!;
  });
  wsHub.pushStreamUpdated(channelId);
  return request;
}

export async function premiumGiftStatus(
  sessionId: number,
  viewerUid: number,
  hostUid: number,
) {
  const request = (
    await db
      .select()
      .from(requests)
      .where(eq(requests.sessionId, sessionId))
      .orderBy(desc(requests.createdAt))
      .limit(1)
  )[0];
  if (!request) return null;
  const participants = await db
    .select()
    .from(viewers)
    .where(eq(viewers.requestId, request.id));
  const participant = participants.find(
    (row) => row.viewerUserId === viewerUid,
  );
  if (viewerUid !== hostUid && !participant) return null;
  return {
    id: request.id,
    gift: {
      id: request.giftId,
      name: request.giftName,
      emoji: request.giftEmoji,
      coinCost: request.coinCost,
    },
    deadline: request.deadline.toISOString(),
    durationSeconds: request.durationSeconds,
    paid: !!participant?.transactionId,
    required:
      !!participant && !participant.transactionId && !participant.waivedAt,
    ...(viewerUid === hostUid
      ? {
          viewers: participants.length,
          paidViewers: participants.filter((row) => row.transactionId).length,
        }
      : {}),
  };
}

export async function payPremiumGiftRequest(
  channelId: string,
  viewerUid: number,
  viewerName: string,
  requestId: string,
  idempotencyKey: string,
) {
  const payment = await db.transaction(async (tx) => {
    const session = await activeSession(tx, channelId);
    const moderation = await viewerModeration(
      session.id,
      session.hostUserId,
      viewerUid,
    );
    if (moderation.removed || moderation.blocked)
      throw new PremiumGiftError(403, "Stream access denied");
    const request = (
      await tx
        .select()
        .from(requests)
        .where(
          and(eq(requests.id, requestId), eq(requests.sessionId, session.id)),
        )
    )[0];
    const participant = (
      await tx
        .select()
        .from(viewers)
        .where(
          and(
            eq(viewers.requestId, requestId),
            eq(viewers.viewerUserId, viewerUid),
          ),
        )
    )[0];
    if (!request || !participant || viewerUid === session.hostUserId)
      throw new PremiumGiftError(403, "This gift request is not for you");
    if (participant.transactionId) {
      const balance =
        (
          await tx.select().from(balances).where(eq(balances.userId, viewerUid))
        )[0]?.balance ?? 0;
      return { balance, charged: false, request, hostUid: session.hostUserId };
    }
    if (request.settledAt || request.deadline.getTime() <= Date.now())
      throw new PremiumGiftError(410, "The gift deadline has passed");
    // The ledger key is global. Serialize with other payment endpoints too via
    // its unique constraint; a conflict rolls the entire debit/credit back.
    if (
      (
        await tx
          .select({ id: ledger.id })
          .from(ledger)
          .where(eq(ledger.idempotencyKey, idempotencyKey))
      )[0]
    )
      throw new PremiumGiftError(409, "This payment key was already used");
    // Lock wallets in UID order to avoid reciprocal transfers deadlocking.
    const walletIds = [viewerUid, session.hostUserId].sort((a, b) => a - b);
    for (const userId of walletIds)
      await tx
        .insert(balances)
        .values({ userId, balance: 0 })
        .onConflictDoNothing();
    await tx
      .select()
      .from(balances)
      .where(inArray(balances.userId, walletIds))
      .orderBy(balances.userId)
      .for("update");
    if (request.deadline.getTime() <= Date.now())
      throw new PremiumGiftError(410, "The gift deadline has passed");
    const [debited] = await tx
      .update(balances)
      .set({
        balance: sql`${balances.balance} - ${request.coinCost}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(balances.userId, viewerUid),
          sql`${balances.balance} >= ${request.coinCost}`,
        ),
      )
      .returning();
    if (!debited) throw new PremiumGiftError(402, "Insufficient coins");
    await tx
      .update(balances)
      .set({
        balance: sql`${balances.balance} + ${request.coinCost}`,
        updatedAt: new Date(),
      })
      .where(eq(balances.userId, session.hostUserId));
    const [transaction] = await tx
      .insert(ledger)
      .values({
        fromUserId: viewerUid,
        toUserId: session.hostUserId,
        amount: request.coinCost,
        type: "gift",
        giftName: request.giftName,
        channelId,
        description: `Premium gift request: ${request.giftName}`,
        idempotencyKey,
        balanceAfter: debited.balance,
      })
      .returning();
    await tx
      .update(viewers)
      .set({ transactionId: transaction!.id, paidAt: new Date() })
      .where(
        and(
          eq(viewers.requestId, requestId),
          eq(viewers.viewerUserId, viewerUid),
        ),
      );
    return {
      balance: debited.balance,
      charged: true,
      request,
      hostUid: session.hostUserId,
    };
  });
  if (payment.charged) {
    // Payment is committed. Notification failures must never turn it into a retryable charge error.
    try {
      const total = Number(
        (
          await db
            .select({ total: sql<number>`coalesce(sum(${ledger.amount}), 0)` })
            .from(ledger)
            .where(
              and(eq(ledger.channelId, channelId), eq(ledger.type, "gift")),
            )
        )[0]?.total ?? 0,
      );
      wsHub.pushEarnings(channelId, total);
      await pushPrivateGift(channelId, payment.request.giftName, viewerName, total, {
        giftId: idempotencyKey,
        amount: payment.request.coinCost,
        senderUid: viewerUid,
        recipientUid: payment.hostUid,
      });
      wsHub.pushStreamUpdated(channelId);
    } catch (error) {
      console.warn(
        "Premium gift notification failed after payment",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }
  return { paid: true, balance: payment.balance, charged: payment.charged };
}
