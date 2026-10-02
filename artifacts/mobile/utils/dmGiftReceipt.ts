// Read existing persisted gift receipts without changing their payment/message format.
// Keep the historical amount: catalog prices may change after a gift was sent.
export function parseDmGiftReceipt<T extends { emoji: string; name: string }>(text: string, gifts: T[]) {
  const match = /^🎁 (.+) gift • ([0-9]+) coins?$/.exec(text);
  if (!match) return null;
  const gift = gifts.find(item => `${item.emoji} ${item.name}` === match[1]);
  const coins = Number(match[2]);
  return gift && Number.isSafeInteger(coins) && coins > 0 ? { gift, coins } : null;
}
