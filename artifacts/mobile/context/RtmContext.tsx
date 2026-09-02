import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/context/AuthContext";

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

export interface DmMessage {
  messageId: string;
  senderId: string;
  senderName: string;
  text: string;
  ts: number;
}

interface PersistedDm extends DmMessage {
  id: string;
  recipientId: string;
  recipientName: string;
}

export interface Conversation {
  peerId: string;
  peerName: string;
  lastMessage: string;
  lastTs: number;
  unread: number;
}

interface RtmContextValue {
  ready: boolean;
  rtmError: string | null;
  conversations: Conversation[];
  getMessages: (peerId: string) => DmMessage[];
  sendDm: (peerId: string, peerName: string, text: string) => Promise<{ ok: boolean; error?: string }>;
  markRead: (peerId: string) => void;
}

const RtmContext = createContext<RtmContextValue>({
  ready: false,
  rtmError: null,
  conversations: [],
  getMessages: () => [],
  sendDm: async () => ({ ok: false, error: "Not connected" }),
  markRead: () => {},
});

const messageStore: Record<string, DmMessage[]> = {};

export function RtmProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [rtmError, setRtmError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [, setTick] = useState(0);

  const rtmClientRef = useRef<unknown>(null);
  const syncedMessageIdsRef = useRef(new Set<string>());
  const initialSyncCompleteRef = useRef(false);

  const uid = user?.uid;
  const uidStr = uid != null ? String(uid) : null;

  const upsertConversation = useCallback((
    peerId: string,
    peerName: string,
    text: string,
    ts: number,
    unreadDelta: number,
  ) => {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.peerId === peerId);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx]!,
          peerName: peerName || updated[idx]!.peerName,
          lastMessage: text,
          lastTs: ts,
          unread: updated[idx]!.unread + unreadDelta,
        };
        return updated.sort((a, b) => b.lastTs - a.lastTs);
      }
      return [
        { peerId, peerName, lastMessage: text, lastTs: ts, unread: unreadDelta },
        ...prev,
      ].sort((a, b) => b.lastTs - a.lastTs);
    });
  }, []);

  const storePersistedMessage = useCallback((message: PersistedDm, unread: boolean) => {
    if (!uidStr || syncedMessageIdsRef.current.has(message.id)) return;
    syncedMessageIdsRef.current.add(message.id);

    const isIncoming = message.senderId !== uidStr;
    const peerId = isIncoming ? message.senderId : message.recipientId;
    const peerName = isIncoming ? message.senderName : message.recipientName;
    const stored: DmMessage = {
      messageId: message.id,
      senderId: message.senderId,
      senderName: message.senderName,
      text: message.text,
      ts: message.ts,
    };

    if (!messageStore[peerId]) messageStore[peerId] = [];
    messageStore[peerId]!.push(stored);
    messageStore[peerId]!.sort((a, b) => a.ts - b.ts);
    upsertConversation(peerId, peerName, message.text, message.ts, isIncoming && unread ? 1 : 0);
    setTick((tick) => tick + 1);
  }, [uidStr, upsertConversation]);

  useEffect(() => {
    syncedMessageIdsRef.current.clear();
    initialSyncCompleteRef.current = false;
    for (const peerId of Object.keys(messageStore)) delete messageStore[peerId];
    setConversations([]);

    if (!uidStr) return;
    let active = true;

    const syncMessages = async () => {
      try {
        const response = await fetch(`${BASE_URL}/api/dms/${encodeURIComponent(uidStr)}`);
        if (!response.ok || !active) return;
        const data = await response.json() as { messages?: PersistedDm[] };
        for (const message of data.messages ?? []) {
          storePersistedMessage(message, initialSyncCompleteRef.current);
        }
        initialSyncCompleteRef.current = true;
      } catch (error) {
        console.warn("[DM] sync error:", error);
      }
    };

    void syncMessages();
    const interval = setInterval(() => void syncMessages(), 2_500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [uidStr, storePersistedMessage]);

  useEffect(() => {
    if (!uidStr) {
      setReady(false);
      setRtmError(null);
      return;
    }

    let mounted = true;

    const init = async () => {
      try {
        const rtmSdk = await import("agora-react-native-rtm");
        const { createAgoraRtmClient, RtmConfig } = rtmSdk;

        const resp = await fetch(`${BASE_URL}/api/agora/rtm-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: uidStr }),
        });
        if (!resp.ok || !mounted) return;
        const tokenData = await resp.json() as { token: string; appId: string };

        const config = new RtmConfig();
        config.appId = tokenData.appId;
        config.userId = uidStr;
        // Embed token in config — RTM v2 prefers this over passing in login()
        (config as any).token = tokenData.token;

        const client = createAgoraRtmClient(config);
        rtmClientRef.current = client;

        client.addEventListener("message", (event) => {
          if (!mounted) return;
          try {
            const payload = JSON.parse(String(event.message)) as PersistedDm;
            if (payload.id && payload.senderId && payload.recipientId) {
              storePersistedMessage(payload, true);
            }
          } catch {
            // Ignore messages from older clients; persisted history is authoritative.
          }
        });

        // Try login with token embedded in config (empty options)
        try {
          await client.login({ token: tokenData.token });
          if (mounted) {
            setReady(true);
            setRtmError(null);
          }
        } catch (loginErr: unknown) {
          const code = (loginErr as { errorCode?: number })?.errorCode;
          // -10015 = token/app issue; -10007 = not initialized
          const msg = code
            ? `RTM login failed (code ${code}). Check Agora console RTM service.`
            : "RTM login failed.";
          if (mounted) setRtmError(msg);
          console.warn("[RTM] login error:", loginErr);
        }
      } catch {
        // RTM native module not linked (web/simulator) — silent degrade
      }
    };

    void init();

    return () => {
      mounted = false;
      const client = rtmClientRef.current as { logout?: () => Promise<void> } | null;
      if (client?.logout) {
        void client.logout().catch(() => {});
      }
      rtmClientRef.current = null;
      setReady(false);
    };
  }, [uidStr, storePersistedMessage]);

  const sendDm = useCallback(async (
    peerId: string,
    peerName: string,
    text: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!uidStr || !text.trim()) return { ok: false, error: "Nothing to send" };

    const client = rtmClientRef.current as {
      publish: (channelName: string, message: string, options?: { channelType?: number }) => Promise<unknown>;
    } | null;

    try {
      const response = await fetch(`${BASE_URL}/api/dms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: Number(uidStr),
          recipientId: Number(peerId),
          text: text.trim(),
        }),
      });
      const data = await response.json() as { message?: PersistedDm; error?: string };
      if (!response.ok || !data.message) {
        return { ok: false, error: data.error ?? "Message could not be sent." };
      }

      storePersistedMessage(data.message, false);

      // RTM is a best-effort live notification. The database is authoritative,
      // so offline recipients still receive the message on their next sync.
      if (client) {
        void client
          .publish(peerId, JSON.stringify(data.message), { channelType: 3 })
          .catch((err: unknown) => {
            const code = (err as { errorCode?: number })?.errorCode;
            if (code !== -11033) console.warn("[RTM] publish error:", err);
          });
      }
      return { ok: true };
    } catch (err: unknown) {
      console.warn("[DM] send error:", err);
      return { ok: false, error: "Message could not be sent. Check your connection and try again." };
    }
  }, [uidStr, storePersistedMessage]);

  const getMessages = useCallback((peerId: string): DmMessage[] => {
    return messageStore[peerId] ?? [];
  }, []);

  const markRead = useCallback((peerId: string) => {
    setConversations((prev) =>
      prev.map((c) => c.peerId === peerId ? { ...c, unread: 0 } : c)
    );
  }, []);

  return (
    <RtmContext.Provider value={{ ready, rtmError, conversations, getMessages, sendDm, markRead }}>
      {children}
    </RtmContext.Provider>
  );
}

export function useRtm() {
  return useContext(RtmContext);
}
