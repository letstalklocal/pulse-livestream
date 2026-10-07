// One presentation per transaction, even when the payment response, socket
// event and native-render decision arrive in different orders.
export function createGiftPresentation() {
  const gifts = new Map<
    string,
    { shown: boolean; mode: "pending" | "video" | "ui" }
  >();
  const remember = (
    id: string,
    value: { shown: boolean; mode: "pending" | "video" | "ui" },
  ) => {
    gifts.set(id, value);
    if (gifts.size > 500) gifts.delete(gifts.keys().next().value!);
    return value;
  };
  return {
    claim(id: string, nativeExpected: boolean) {
      const value =
        gifts.get(id) ??
        remember(id, { shown: false, mode: nativeExpected ? "pending" : "ui" });
      if (value.shown) return false;
      value.shown = true;
      return true;
    },
    inVideo(id: string) {
      return gifts.get(id)?.mode !== "ui";
    },
    decide(id: string, inVideo: boolean) {
      const value =
        gifts.get(id) ?? remember(id, { shown: false, mode: "pending" });
      // A confirmed visible native frame wins over an out-of-order fallback.
      if (value.mode !== "video") value.mode = inVideo ? "video" : "ui";
      return value.mode !== "ui";
    },
  };
}
export function expectsNativeCrown(
  name: string | undefined,
  amount: number | undefined,
  snapshot?: { revisionId: string },
) {
  return (!snapshot || snapshot.revisionId === "crown_legacy_v1") && name === "Crown" && typeof amount === "number" && amount >= 500;
}

export function mergeGiftFloater<T extends { id: string; comboId?: string; comboCount?: number }>(previous: T[], gift: T): T[] {
  const combo = gift.comboId ? previous.find(item => item.comboId === gift.comboId) : undefined;
  if (combo && (combo.comboCount ?? 1) >= (gift.comboCount ?? 1)) return previous;
  if (!gift.comboId && previous.some(item => item.id === gift.id)) return previous;
  return [...previous.filter(item => item.id !== gift.id && (!gift.comboId || item.comboId !== gift.comboId)), gift];
}
