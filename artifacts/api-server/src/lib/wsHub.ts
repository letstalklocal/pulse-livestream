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

export function pushEarnings(channelId: string, coins: number): void {
  const sockets = channels.get(channelId);
  if (!sockets || sockets.size === 0) return;
  const message = JSON.stringify({ type: "earnings", channelId, coins });
  for (const ws of sockets) {
    if ((ws.readyState as number) === 1 /* OPEN */) {
      ws.send(message);
    }
  }
}
