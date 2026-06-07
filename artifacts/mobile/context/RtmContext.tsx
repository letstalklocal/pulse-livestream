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
  loadConversation: (peerId: string) => Promise<void>;
  sendDm: (peerId: string, peerName: string, text: string) => Promise<{ ok: boolean; error?: string }>;
  markRead: (peerId: string) => void;
}

const RtmContext = createContext<RtmContextValue>({
  ready: false,
  rtmError: null,
  conversations: [],
  getMessages: () => [],
  loadConversation: async () => {},
  sendDm: async () => ({ ok: false, error: "Not connected" }),
  markRead: () => {},
});

const messageStore: Record<string, DmMessage[]> = {};

function mergeMessages(peerId: string, incoming: DmMessage[]) {
  const existing = messageStore[peerId] ?? [];
  const seen = new Set(existing.map((m) => m.messageId));
  const toAdd = incoming.filter((m) => !seen.has(m.messageId));
  if (toAdd.length === 0) return false;
  messageStore[peerId] = [...existing, ...toAdd].sort((a, b) => a.ts - b.ts);
  return true;
}

export function RtmProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [rtmError, setRtmError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [, setTick] = useState(0);

  const rtmClientRef = useRef<unknown>(null);
  const uidRef = useRef<string | null>(null);

  const uid = user?.uid;
  const uidStr = uid != null ? String(uid) : null;
  uidRef.current = uidStr;

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
        (config as any).token = tokenData.token;

        const client = createAgoraRtmClient(config);
        rtmClientRef.current = client;

        client.addEventListener("message", (event) => {
          if (!mounted) return;
          const senderId = event.publisher ?? "unknown";
          const text = typeof event.message === "string"
            ? event.message
            : String(event.message);
          const msg: DmMessage = {
            messageId: `${senderId}-${Date.now()}-${Math.random()}`,
            senderId,
            senderName: senderId,
            text,
            ts: Date.now(),
          };
          mergeMessages(senderId, [msg]);
          upsertConversation(senderId, senderId, text, msg.ts, 1);
          setTick((t) => t + 1);
        });

        try {
          await client.login({ token: tokenData.token });
          if (mounted) {
            setReady(true);
            setRtmError(null);
          }
        } catch (loginErr: unknown) {
          const code = (loginErr as { errorCode?: number })?.errorCode;
          const msg = code
            ? `RTM login failed (code ${code}). Check Agora console → Signaling.`
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
      if (client?.logout) void client.logout().catch(() => {});
      rtmClientRef.current = null;
      setReady(false);
    };
  }, [uidStr, upsertConversation]);

  // Load conversation history from DB for a given peer
  const loadConversation = useCallback(async (peerId: string) => {
    const myUid = uidRef.current;
    if (!myUid || !peerId) return;
    try {
      const url = `${BASE_URL}/api/dm/conversation?fromUid=${myUid}&toUid=${peerId}&limit=100`;
      const resp = await fetch(url);
      if (!resp.ok) return;
      const data = await resp.json() as {
        messages: Array<{
          id: number;
          fromUserId: number;
          toUserId: number;
          text: string;
          createdAt: string;
        }>;
      };
      const dbMessages: DmMessage[] = data.messages.map((m) => ({
        messageId: `db-${m.id}`,
        senderId: String(m.fromUserId),
        senderName: String(m.fromUserId),
        text: m.text,
        ts: new Date(m.createdAt).getTime(),
      }));
      const changed = mergeMessages(peerId, dbMessages);
      if (changed) setTick((t) => t + 1);
      // Update conversation list with most recent DB message
      const last = dbMessages[dbMessages.length - 1];
      if (last) {
        upsertConversation(peerId, peerId, last.text, last.ts, 0);
      }
    } catch {
      // Network error — silently ignore, in-memory messages still shown
    }
  }, [upsertConversation]);

  const sendDm = useCallback(async (
    peerId: string,
    peerName: string,
    text: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    const myUid = uidRef.current;
    if (!myUid || !text.trim()) return { ok: false, error: "Nothing to send" };

    // Optimistic insert — show immediately
    const tempId = `${myUid}-${Date.now()}-${Math.random()}`;
    const optimistic: DmMessage = {
      messageId: tempId,
      senderId: myUid,
      senderName: user?.name ?? "Me",
      text,
      ts: Date.now(),
    };
    mergeMessages(peerId, [optimistic]);
    upsertConversation(peerId, peerName, text, optimistic.ts, 0);
    setTick((t) => t + 1);

    // Persist to DB
    try {
      const resp = await fetch(`${BASE_URL}/api/dm/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromUid: parseInt(myUid), toUid: parseInt(peerId), text }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { error?: string };
        return { ok: false, error: err.error ?? "Failed to send" };
      }
      // Replace temp message with DB-backed one
      const { message: saved } = await resp.json() as {
        message: { id: number; fromUserId: number; toUserId: number; text: string; createdAt: string };
      };
      const store = messageStore[peerId];
      if (store) {
        const idx = store.findIndex((m) => m.messageId === tempId);
        if (idx >= 0) {
          store[idx] = { ...store[idx]!, messageId: `db-${saved.id}` };
        }
      }
    } catch {
      return { ok: false, error: "Network error. Message not saved." };
    }

    // Try RTM for real-time delivery — treat receiver-offline as soft success
    const client = rtmClientRef.current as {
      publish: (channelName: string, message: string, options?: { channelType?: number }) => Promise<unknown>;
    } | null;

    if (client) {
      try {
        // channelType 3 = RtmChannelType.user (peer-to-peer DM)
        await client.publish(peerId, text, { channelType: 3 });
      } catch (err: unknown) {
        const code = (err as { errorCode?: number })?.errorCode;
        // -11033 = receiver offline — message is stored in DB, not an error
        if (code !== -11033) {
          console.warn("[RTM] publish error:", err);
        }
      }
    }

    return { ok: true };
  }, [user?.name, upsertConversation]);

  const getMessages = useCallback((peerId: string): DmMessage[] => {
    return messageStore[peerId] ?? [];
  }, []);

  const markRead = useCallback((peerId: string) => {
    setConversations((prev) =>
      prev.map((c) => c.peerId === peerId ? { ...c, unread: 0 } : c)
    );
  }, []);

  return (
    <RtmContext.Provider value={{ ready, rtmError, conversations, getMessages, loadConversation, sendDm, markRead }}>
      {children}
    </RtmContext.Provider>
  );
}

export function useRtm() {
  return useContext(RtmContext);
}
