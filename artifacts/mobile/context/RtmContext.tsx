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
  conversations: Conversation[];
  getMessages: (peerId: string) => DmMessage[];
  sendDm: (peerId: string, peerName: string, text: string) => Promise<void>;
  markRead: (peerId: string) => void;
}

const RtmContext = createContext<RtmContextValue>({
  ready: false,
  conversations: [],
  getMessages: () => [],
  sendDm: async () => {},
  markRead: () => {},
});

// In-memory message store keyed by peerId — survives re-renders within session
const messageStore: Record<string, DmMessage[]> = {};

export function RtmProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  // tick forces re-render when new messages arrive
  const [, setTick] = useState(0);

  // Use unknown so we don't import RTMClient type at module level (native-only)
  const rtmClientRef = useRef<unknown>(null);

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

  useEffect(() => {
    if (!uidStr) {
      setReady(false);
      return;
    }

    let mounted = true;

    const init = async () => {
      try {
        // Dynamic import — agora-react-native-rtm is native only
        const rtmSdk = await import("agora-react-native-rtm");
        const { createAgoraRtmClient, RtmConfig } = rtmSdk;

        // Fetch RTM token
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

        const client = createAgoraRtmClient(config);
        rtmClientRef.current = client;

        // Listen for incoming DMs
        client.addEventListener("message", (event) => {
          if (!mounted) return;
          const senderId = event.publisher ?? "unknown";
          // Only handle user-channel (DM) messages
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
          if (!messageStore[senderId]) messageStore[senderId] = [];
          messageStore[senderId]!.push(msg);
          upsertConversation(senderId, senderId, text, msg.ts, 1);
          setTick((t) => t + 1);
        });

        await client.login({ token: tokenData.token });
        if (mounted) setReady(true);
      } catch {
        // RTM unavailable in web/simulator — silently degrade
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
  }, [uidStr, upsertConversation]);

  const sendDm = useCallback(async (peerId: string, peerName: string, text: string) => {
    const client = rtmClientRef.current as {
      publish: (channelName: string, message: string, options?: { channelType?: number }) => Promise<unknown>;
    } | null;
    if (!client || !uidStr || !text.trim()) return;

    // channelType 3 = user (RtmChannelType.user)
    await client.publish(peerId, text, { channelType: 3 });

    const msg: DmMessage = {
      messageId: `${uidStr}-${Date.now()}-${Math.random()}`,
      senderId: uidStr,
      senderName: user?.name ?? "Me",
      text,
      ts: Date.now(),
    };
    if (!messageStore[peerId]) messageStore[peerId] = [];
    messageStore[peerId]!.push(msg);
    upsertConversation(peerId, peerName, text, msg.ts, 0);
    setTick((t) => t + 1);
  }, [uidStr, user?.name, upsertConversation]);

  const getMessages = useCallback((peerId: string): DmMessage[] => {
    return messageStore[peerId] ?? [];
  }, []);

  const markRead = useCallback((peerId: string) => {
    setConversations((prev) =>
      prev.map((c) => c.peerId === peerId ? { ...c, unread: 0 } : c)
    );
  }, []);

  return (
    <RtmContext.Provider value={{ ready, conversations, getMessages, sendDm, markRead }}>
      {children}
    </RtmContext.Provider>
  );
}

export function useRtm() {
  return useContext(RtmContext);
}
