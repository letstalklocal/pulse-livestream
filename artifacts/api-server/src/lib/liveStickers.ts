import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  db,
  liveStreamSessionsTable,
  mediaPacksTable,
  premiumStreamAdmissionsTable,
} from "@workspace/db";
import { canAccessChannel } from "./privateChannelAccess";
import { PREMIUM_GIFT_CATALOG } from "./giftCatalog";

export type LiveSticker = {
  id: string;
  kind: "gift" | "pack";
  giftId: string;
  packId?: number;
};
export class StickerError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function validateStickers(
  value: unknown,
  owner: number,
): Promise<LiveSticker[]> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 2)
    throw new StickerError(400, "Choose up to two stickers");
  const stickers: LiveSticker[] = [];
  for (const item of value) {
    if (
      !item ||
      !["gift", "pack"].includes(item.kind) ||
      typeof item.giftId !== "string" ||
      !Object.hasOwn(PREMIUM_GIFT_CATALOG, item.giftId)
    )
      throw new StickerError(400, "Choose a valid sticker gift");
    let giftId = item.giftId;
    if (item.kind === "pack") {
      if (!Number.isSafeInteger(item.packId) || item.packId <= 0)
        throw new StickerError(400, "Choose a valid media pack");
      const [pack] = await db
        .select()
        .from(mediaPacksTable)
        .where(
          and(
            eq(mediaPacksTable.id, item.packId),
            eq(mediaPacksTable.ownerUserId, owner),
          ),
        )
        .limit(1);
      if (!pack) throw new StickerError(400, "Media pack unavailable");
      giftId = pack.giftId;
      if (stickers.some((s) => s.packId === item.packId))
        throw new StickerError(400, "This pack is already on a sticker");
    }
    stickers.push({
      id: randomUUID(),
      kind: item.kind,
      giftId,
      ...(item.kind === "pack" ? { packId: item.packId } : {}),
    });
  }
  return stickers;
}
// Use the durable session, not client-supplied owner/price or an in-memory demo.
export async function assertStickerAccess(
  session: typeof liveStreamSessionsTable.$inferSelect | undefined,
  user: { uid: number; clerkId: string | null },
) {
  if (
    !session ||
    session.endedAt ||
    session.lastHeartbeatAt.getTime() <= Date.now() - 60_000
  )
    throw new StickerError(404, "Active stream not found");
  if (!(await canAccessChannel(session.channelId, user.clerkId)))
    throw new StickerError(403, "Stream access denied");
  if (
    session.hostUserId === user.uid ||
    !session.requiredGiftId ||
    session.premiumFreeViewerIds.includes(user.uid)
  )
    return;
  const [admission] = await db
    .select()
    .from(premiumStreamAdmissionsTable)
    .where(
      and(
        eq(premiumStreamAdmissionsTable.sessionId, session.id),
        eq(premiumStreamAdmissionsTable.viewerUserId, user.uid),
      ),
    )
    .limit(1);
  if (!admission)
    throw new StickerError(403, "Premium stream admission is required");
}
