import type { WebSocket } from "ws";

const channels = new Map<string, Set<WebSocket>>();

export function subscribe(channelId: string, ws: WebSocket): void {
  let sockets = channels.get(channelId);
  if (!sockets) {
    sockets = new Set();
    channels.set(channelId, sockets);
  }
  sockets.add(ws);
}

export function unsubscribe(channelId: string, ws: WebSocket): void {
  const sockets = channels.get(channelId);
  if (!sockets) return;
  sockets.delete(ws);
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

export function pushGift(channelId: string, giftName: string, senderName: string, coins: number): void {
  broadcast(channelId, { type: "gift", channelId, giftName, senderName, coins });
}

export function pushStreamEnded(channelId: string): void {
  broadcast(channelId, { type: "stream_ended", channelId });
}
