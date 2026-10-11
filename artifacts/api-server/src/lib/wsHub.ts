import { appendGiftChat } from "./liveChat";
import type { WebSocket } from "ws";
import { deliverLiveGift, stopLiveGiftDelivery } from "./liveGiftDeliveryBus";

const viewers = new Map<WebSocket, number>();
const channels = new Map<string, Set<WebSocket>>();

export function subscribe(channelId: string, ws: WebSocket, viewerUid?: number): void {
  let sockets = channels.get(channelId);
  if (!sockets) {
    sockets = new Set();
    channels.set(channelId, sockets);
  }
  sockets.add(ws);
  if (viewerUid != null) viewers.set(ws, viewerUid);
}

export function unsubscribe(channelId: string, ws: WebSocket): void {
  const sockets = channels.get(channelId);
  if (!sockets) return;
  sockets.delete(ws);
  viewers.delete(ws);
  if (sockets.size === 0) channels.delete(channelId);
}

function broadcast(channelId: string, payload: object): void {
  const sockets = channels.get(channelId);
  if (!sockets || sockets.size === 0) return;
  const message = JSON.stringify(payload);
  for (const ws of sockets) {
    if ((ws.readyState as number) === 1 /* OPEN */) {
      ws.send(message);
    }
  }
}

export function pushEarnings(channelId: string, coins: number): void {
  broadcast(channelId, { type: "earnings", channelId, coins });
}

export type GiftDetails = { giftId: string; amount: number; senderUid: number; recipientUid: number | null; isIncognito?: boolean; giftSnapshot?: Record<string, any> | null; combo?: { id: string; count: number; totalCoins: number } };

export function pushGift(channelId: string, giftName: string, senderName: string, coins: number, details?: GiftDetails): void {
  if (details) appendGiftChat(channelId, giftName, senderName, details);
  deliverLiveGift({ type: "gift", channelId, giftName, senderName, coins, ...details }, event => broadcast(channelId, event));
}

export function pushStreamEnded(channelId: string): void {
  stopLiveGiftDelivery(channelId);
  broadcast(channelId, { type: "stream_ended", channelId });
}

export function pushPartyGift(channelId: string, giftName: string, senderName: string, details?: GiftDetails): void {
  if (details) appendGiftChat(channelId, giftName, senderName, details);
  deliverLiveGift({ type: "gift", channelId, giftName, senderName, ...details }, event => broadcast(channelId, event));
}

export function pushStreamUpdated(channelId: string): void {
  // A pause/access/media-mode change must stop the public pilot immediately.
  stopLiveGiftDelivery(channelId);
  broadcast(channelId, { type: "stream_updated", channelId });
}

export function disconnectViewer(channelId: string, viewerUid: number) {
  // Retire output so an old token cannot retain access after removal.
  stopLiveGiftDelivery(channelId);
  for (const ws of channels.get(channelId) ?? []) {
    if (viewers.get(ws) === viewerUid && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "stream_restricted", channelId }));
      ws.close(1000, "Stream access changed");
    }
  }
}

export function pushGiftInVideo(channelId: string, giftId: string, inVideo = true): void {
  broadcast(channelId, { type: "gift_in_video", channelId, giftId, inVideo });
}
