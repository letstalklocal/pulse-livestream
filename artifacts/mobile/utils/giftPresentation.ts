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
) {
  return name === "Crown" && typeof amount === "number" && amount >= 500;
}
