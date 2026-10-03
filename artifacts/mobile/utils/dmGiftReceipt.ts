// Read existing persisted gift receipts without changing their payment/message format.
// Receipts store the paid total; show the historical price per gift alongside
// the separate count, so a combo never makes the gift appear more expensive.
export function parseDmGiftReceipt<T extends { emoji: string; name: string }>(text: string, gifts: T[]) {
  const match = /^🎁 (.+) gift • ([0-9]+) coins?(?: ×([0-9]+))?$/.exec(text);
  if (!match) return null;
  const gift = gifts.find(item => `${item.emoji} ${item.name}` === match[1]);
  const coins = Number(match[2]);
  const count = match[3] ? Number(match[3]) : 1;
  const unitCoins = coins / count;
  return gift && Number.isSafeInteger(coins) && coins > 0 && Number.isSafeInteger(count) && count > 0 && Number.isSafeInteger(unitCoins) && unitCoins > 0 ? { gift, coins: unitCoins, count } : null;
}
