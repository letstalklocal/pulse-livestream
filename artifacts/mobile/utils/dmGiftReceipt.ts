// Read existing persisted gift receipts without changing their payment/message format.
// Receipts store the paid total; show the historical price per gift alongside
// the separate count, so a combo never makes the gift appear more expensive.
export function parseDmGiftReceipt<T extends { emoji: string; name: string; id?: string }>(text: string, gifts: T[], savedGift?: T | null) {
  const match = /^🎁 (.+) gift • ([0-9]+) coins?(?: ×([0-9]+))?$/.exec(text);
  if (!match) return null;
  const coins = Number(match[2]);
  const count = match[3] ? Number(match[3]) : 1;
  const unitCoins = coins / count;
  // Older Luxury receipts used the same Rocket name/emoji as the Popular gift.
  // Resolve that legacy alias by its historical per-gift price, including combos.
  const gift = savedGift ?? (match[1] === "🚀 Rocket" && unitCoins === 4_999
    ? gifts.find(item => item.id === "luxury_rocket")
    : gifts.find(item => `${item.emoji} ${item.name}` === match[1]));
  return gift && Number.isSafeInteger(coins) && coins > 0 && Number.isSafeInteger(count) && count > 0 && Number.isSafeInteger(unitCoins) && unitCoins > 0 ? { gift, coins: unitCoins, count } : null;
}
