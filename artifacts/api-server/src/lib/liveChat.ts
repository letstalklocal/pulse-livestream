export interface ChatMessage {
  id: string;
  senderName: string;
  senderUid?: number;
  text: string;
  color: string;
  ts: number;
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
  gift: { giftId: string; amount: number; senderUid: number },
) {
  const messages = chatStore.get(channelId) ?? [];
  const id = `gift:${gift.giftId}`;
  if (
    messages.some((message) => message.id === id) ||
    (deletedMessages.get(channelId) ?? []).includes(id)
  )
    return;
  const message: ChatMessage = {
    id,
    senderName,
    senderUid: gift.senderUid,
    text: `sent 🪙 ${gift.amount.toLocaleString("en-US")} coins · ${giftName}`,
    color: "#FFD76A",
    ts: Date.now(),
  };
  chatStore.set(channelId, [...messages, message].slice(-MAX_MESSAGES));
}
