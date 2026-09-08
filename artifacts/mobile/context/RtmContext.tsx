import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth as useClerkAuth } from "@clerk/expo";
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
  kind?: "text" | "media_pack" | "media" | "private_stream_invitation";
  mediaPackId?: string;
  mediaUrl?: string;
  previewUrl?: string;
  price?: number;
  unlocked?: boolean;
  mediaType?: "image" | "video";
  invitation?: {
    id: string; streamerUserId: string; invitedUserId: string; channelId: string;
    title: string; status: "pending" | "accepted" | "declined" | "cancelled" | "expired" | "active" | "ended";
    expiresAt: number; startedAt: number | null; endedAt: number | null; backgroundImageUrl: string;
    requiredGiftId: string | null; requiredGiftName: string | null; requiredGiftAmount: number;
    paidAt: number | null; refundedAt: number | null; paymentStatus: "free" | "pending" | "paid" | "settled" | "refunded";
  };
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
  const { getToken } = useClerkAuth();
  const [ready, setReady] = useState(false);
  const [rtmError, setRtmError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [, setTick] = useState(0);

  const getTokenRef = useRef(getToken);
  const syncedMessageIdsRef = useRef(new Set<string>());
  const initialSyncCompleteRef = useRef(false);

  const uid = user?.uid;
  const uidStr = uid != null ? String(uid) : null;

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

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
    if (!uidStr) return;
    // Invitation rows are deliberately refreshed by the DM poll so both
    // parties see accept/start/end transitions without reopening the thread.
    const wasAlreadySynced = syncedMessageIdsRef.current.has(message.id);
    if (wasAlreadySynced && message.kind !== "private_stream_invitation") return;
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
      kind: message.kind,
      mediaPackId: message.mediaPackId,
      mediaUrl: message.mediaUrl,
      previewUrl: message.previewUrl,
      price: message.price,
      unlocked: message.unlocked,
      mediaType: message.mediaType,
      invitation: message.invitation,
    };

    const peerMessages = [...(messageStore[peerId] ?? [])];
    const priorIndex = peerMessages.findIndex((item) => item.messageId === stored.messageId);
    if (priorIndex >= 0) peerMessages[priorIndex] = stored;
    else peerMessages.push(stored);
    peerMessages.sort((a, b) => a.ts - b.ts);
    messageStore[peerId] = peerMessages;
    upsertConversation(
      peerId,
      peerName,
      message.kind === "private_stream_invitation" ? "Private live invitation" : message.kind === "media_pack" ? "Media pack" : message.kind === "media" ? "Media" : message.text,
      message.ts,
      isIncoming && unread && !wasAlreadySynced ? 1 : 0,
    );
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
        const token = await getTokenRef.current();
        const response = await fetch(`${BASE_URL}/api/dms/${encodeURIComponent(uidStr)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
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

  const sendDm = useCallback(async (
    peerId: string,
    peerName: string,
    text: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!uidStr || !text.trim()) return { ok: false, error: "Nothing to send" };

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
