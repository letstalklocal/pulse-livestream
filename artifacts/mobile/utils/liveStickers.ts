export type StickerDraft = {
  kind: "gift" | "pack";
  giftId: string;
  packId?: number;
};
export type LiveSticker = StickerDraft & {
  id: string;
  price: number;
  name: string;
  videos: number;
  pictures: number;
  owned: boolean;
};
export type StickerStatus = { stickers: LiveSticker[]; hostUid: number };
export const stickerQueryKey = (channelId: string, uid?: number) =>
  ["live-stickers", channelId, uid] as const;
export async function stickerApi<T>(
  path: string,
  getToken: () => Promise<string | null>,
  method = "GET",
  body?: object,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 15_000);
  try {
    const token = await Promise.race([
      getToken(),
      new Promise<never>((_, reject) => {
        if (controller.signal.aborted)
          reject(new Error("Request timed out. Please try again."));
        else
          controller.signal.addEventListener(
            "abort",
            () => reject(new Error("Request timed out. Please try again.")),
            { once: true },
          );
      }),
    ]);
    if (!token) throw new Error("Sign in to continue");
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    const response = await fetch(
      `${domain ? `https://${domain}` : ""}/api${path}`,
      {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Please try again.");
    return data as T;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
