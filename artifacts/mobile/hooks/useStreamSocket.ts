import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useAuth } from "@clerk/expo";

/** Reconnect channel events after network changes and refresh durable data on connect. */
export function useStreamSocket({ channelId, enabled, onMessage, onConnect, onDisconnect, subscriptionType = "subscribe" }: {
  subscriptionType?: "subscribe" | "subscribe_reactions";
  channelId: string;
  enabled: boolean;
  onMessage: (event: { data: unknown }) => void;
  onConnect: () => void;
  onDisconnect?: () => void;
}) {
  const liveSocket = useRef<WebSocket | null>(null);
  const send = useCallback((payload: object) => {
    const ws = liveSocket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try { ws.send(JSON.stringify(payload)); return true; } catch { return false; }
  }, []);
  const { getToken } = useAuth();
  const callbacks = useRef({ getToken, onMessage, onConnect, onDisconnect });
  callbacks.current = { getToken, onMessage, onConnect, onDisconnect };
  useEffect(() => {
    const domain = process.env["EXPO_PUBLIC_DOMAIN"];
    if (!enabled || !channelId || !domain) return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let generation = 0;
    const schedule = () => {
      if (disposed || retry) return;
      retry = setTimeout(() => { retry = undefined; void connect(); }, Math.min(1000 * 2 ** attempts++, 15000));
    };
    const connect = async () => {
      const current = ++generation;
      clearTimeout(watchdog);
      socket?.close();
      socket = null;
      liveSocket.current = null;
      callbacks.current.onDisconnect?.();
      try {
        const token = await callbacks.current.getToken();
        if (disposed || current !== generation) return;
        const ws = new WebSocket(`wss://${domain}/api/ws`);
        socket = ws;
        const active = () => !disposed && current === generation;
        // Reopen a connection that never completes its handshake.
        watchdog = setTimeout(() => {
          if (active() && ws.readyState !== WebSocket.OPEN) { ws.close(); schedule(); }
        }, 10000);
        ws.onopen = () => {
          if (!active()) { ws.close(); return; }
          clearTimeout(watchdog);
          attempts = 0;
          liveSocket.current = ws;
          ws.send(JSON.stringify({ type: subscriptionType, channelId, token }));
          callbacks.current.onConnect();
        };
        ws.onmessage = event => { if (active()) callbacks.current.onMessage(event); };
        ws.onerror = () => { if (active()) { ws.close(); schedule(); } };
        ws.onclose = () => { if (active()) { liveSocket.current = null; callbacks.current.onDisconnect?.(); clearTimeout(watchdog); schedule(); } };
      } catch {
        if (!disposed && current === generation) schedule();
      }
    };
    void connect();
    const appState = AppState.addEventListener("change", state => {
      if (state === "active") {
        clearTimeout(retry); retry = undefined;
        void connect();
      }
    });
    return () => {
      disposed = true;
      generation++;
      clearTimeout(retry);
      clearTimeout(watchdog);
      appState.remove();
      socket?.close();
      liveSocket.current = null;
    };
  }, [channelId, enabled, subscriptionType]);
  return send;
}
