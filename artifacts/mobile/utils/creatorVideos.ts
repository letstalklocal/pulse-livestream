import { File, FileMode } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
export interface CreatorVideo {
  id: string;
  ownerUid: number;
  ownerName?: string;
  filename: string;
  status: "uploading" | "processing" | "ready" | "failed";
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  encodingProgress?: number | null;
  stickers?: { id: string; kind: "gift" | "pack"; giftId: string; packId?: number }[];
  createdAt: string;
  viewers?: number;
  coins?: number;
}
export interface VideoLibrary {
  videos: CreatorVideo[];
  selectedId: string | null;
  enabled: boolean;
  uploadsConfigured: boolean;
}
export interface VideoStats {
  viewers: number;
  sessions: number;
  averageWatchSeconds: number;
  coins: number;
  senders: {
    senderUid: number;
    senderName: string;
    coins: number;
    gifts: number;
  }[];
  gifts: {
    id: number;
    senderName: string;
    giftName: string;
    amount: number;
    createdAt: string;
  }[];
}
export async function videoRequest<T>(
  path: string,
  getToken: () => Promise<string | null>,
  method = "GET",
  body?: object,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", cancel);
  const timeout = setTimeout(cancel, 25000);
  try {
    const token = await getToken();
    if (!token || controller.signal.aborted)
      throw new Error("Sign in required.");
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    // Library reads and processing refreshes are safe to repeat. Never repeat
    // upload creation or payments when a response is lost or truncated.
    const retryable = method === "GET" || (method === "POST" && path.endsWith("/refresh"));
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(
        `${domain ? `https://${domain}` : ""}/api/creator-videos${path}`,
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
      let data: any;
      try {
        data = await response.json();
        if (!data || typeof data !== "object" || Array.isArray(data))
          throw new Error("Invalid video response");
      } catch {
        if (controller.signal.aborted) throw new Error("Upload cancelled.");
        // Only log response metadata; never log tokens or private response bodies.
        console.warn("Video API returned invalid JSON", { method, path, status: response.status });
        if (retryable && attempt === 0 && (response.ok || response.status >= 500)) continue;
        throw new Error("Video service unavailable. Try again.");
      }
      if (!response.ok)
        throw new Error(typeof data.error === "string" ? data.error : "Video service unavailable. Try again.");
      return data as T;
    }
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
export async function uploadCreatorVideo(
  asset: { uri: string; fileName?: string | null; mimeType?: string | null },
  getToken: () => Promise<string | null>,
  signal: AbortSignal,
  progress: (percent: number) => void,
) {
  const file = new File(asset.uri);
  if (!file.size || file.size > 256 * 1024 * 1024)
    throw new Error("Choose a video smaller than 256 MB.");
  const created = await videoRequest<{
    id: string;
    endpoint: string;
    headers: Record<string, string>;
  }>(
    "/uploads",
    getToken,
    "POST",
    {
      filename: asset.fileName || "video.mp4",
      bytes: file.size,
    },
    signal,
  );
  if (created.endpoint !== "https://video.bunnycdn.com/tusupload")
    throw new Error("Invalid upload destination.");
  const headers = { ...created.headers, "Tus-Resumable": "1.0.0" };
  const request = async (
    url: string,
    init: Parameters<typeof expoFetch>[1],
  ) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort);
    if (signal.aborted) abort();
    const timeout = setTimeout(abort, 90000);
    try {
      return await expoFetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
    }
  };
  const init = await request(created.endpoint, {
    method: "POST",
    headers: {
      ...headers,
      "Upload-Length": String(file.size),
      "Upload-Metadata": `filetype ${btoa(asset.mimeType || "video/mp4")},title ${btoa("video")}`,
    },
  });
  const location = init.headers.get("location");
  if (!init.ok || !location) throw new Error("Upload failed. Try again.");
  const uploadUrl = new URL(location, created.endpoint);
  if (uploadUrl.origin !== "https://video.bunnycdn.com")
    throw new Error("Invalid upload destination.");
  let offset = 0,
    failures = 0;
  while (offset < file.size) {
    if (signal.aborted) throw new Error("Upload cancelled.");
    const end = Math.min(file.size, offset + 5 * 1024 * 1024);
    // File.slice constructs a Blob from bytes, which React Native rejects.
    // Read only this chunk and pass the bytes directly to Expo's native fetch.
    const handle = file.open(FileMode.ReadOnly);
    let chunk: Uint8Array<ArrayBuffer>;
    try {
      handle.offset = offset;
      chunk = handle.readBytes(end - offset);
    } finally {
      handle.close();
    }
    if (chunk.byteLength !== end - offset)
      throw new Error("Could not read the selected video. Try again.");
    try {
      const response = await request(uploadUrl.href, {
        method: "PATCH",
        headers: {
          ...headers,
          "Upload-Offset": String(offset),
          "Content-Type": "application/offset+octet-stream",
        },
        body: chunk,
      });
      if (!response.ok || Number(response.headers.get("upload-offset")) !== end)
        throw new Error("Upload failed. Try again.");
      offset = end;
      failures = 0;
      progress(Math.round((offset / file.size) * 100));
    } catch (error) {
      if (signal.aborted || ++failures > 3) throw error;
      const head = await request(uploadUrl.href, { method: "HEAD", headers });
      const remote = Number(head.headers.get("upload-offset"));
      if (
        !head.ok ||
        !Number.isSafeInteger(remote) ||
        remote < 0 ||
        remote > file.size
      )
        throw error;
      offset = remote;
    }
  }
  await videoRequest(`/${created.id}/refresh`, getToken, "POST", {}, signal);
  return created.id;
}
