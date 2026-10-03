export interface ChatMessage {
  id: string;
  senderName: string;
  senderUid?: number;
  isIncognito?: boolean;
  text: string;
  color: string;
  ts: number;
  giftComboCount?: number;
}

export const chatStore = new Map<string, ChatMessage[]>();
export const deletedMessages = new Map<string, string[]>();
export const MAX_MESSAGES = 200;
export function getChatMessage(channelId: string, messageId: string) {
  return chatStore.get(channelId)?.find((message) => message.id === messageId);
}

export function clearChat(channelId: string) {
  chatStore.delete(channelId);
  deletedMessages.delete(channelId);
}

export function appendGiftChat(
  channelId: string,
  giftName: string,
  senderName: string,
  gift: { giftId: string; amount: number; senderUid: number; isIncognito?: boolean; combo?: { id: string; count: number; totalCoins: number } },
) {
  const messages = chatStore.get(channelId) ?? [];
  const id = `gift:${gift.combo?.id ?? gift.giftId}`;
  const previous = messages.find(message => message.id === id);
  if (
    (previous && (!gift.combo || (previous.giftComboCount ?? 1) >= gift.combo.count)) ||
    (deletedMessages.get(channelId) ?? []).includes(id)
  )
    return;
  const message: ChatMessage = {
    id,
    senderName,
    senderUid: gift.senderUid,
    isIncognito: gift.isIncognito,
    text: `sent 🪙 ${gift.amount.toLocaleString("en-US")} coins · ${giftName}${gift.combo && gift.combo.count > 1 ? ` ×${gift.combo.count}` : ""}`,
    color: "#FFD76A",
    ts: Date.now(),
    giftComboCount: gift.combo?.count,
  };
  chatStore.set(channelId, [...messages.filter(item => item.id !== id), message].slice(-MAX_MESSAGES));
}
