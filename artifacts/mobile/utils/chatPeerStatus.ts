export interface ChatPeerStatus {
  online: boolean;
  lastSeen: number | null;
  needsGift: boolean;
}

// Bound token acquisition, the request and reading its body together. A hung
// native request must not leave the composer behind a spinner indefinitely.
export async function loadChatPeerStatus({ baseUrl, peerId, getToken, signal, timeoutMs = 12_000 }: {
  baseUrl: string;
  peerId: string;
  getToken: () => Promise<string | null>;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<ChatPeerStatus> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  const stopped = new Promise<never>((_, reject) => {
    cancel = () => {
      controller.abort();
      reject(new Error("Chat status request cancelled."));
    };
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Couldn’t load chat status."));
    }, timeoutMs);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
  });
  const request = async () => {
    if (controller.signal.aborted) throw new Error("Chat status request cancelled.");
    const token = await getToken();
    if (controller.signal.aborted) throw new Error("Chat status request cancelled.");
    if (!token) throw new Error("Please sign in again.");
    const response = await fetch(`${baseUrl}/api/messages/peers/${encodeURIComponent(peerId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Couldn’t load chat status.");
    return await response.json() as ChatPeerStatus;
  };
  try {
    return await Promise.race([stopped, request()]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
