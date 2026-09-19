import { createHash } from "node:crypto";
export function bunnyConfig() {
  const library = process.env.BUNNY_STREAM_LIBRARY_ID;
  const key = process.env.BUNNY_STREAM_API_KEY;
  const hostname = process.env.BUNNY_STREAM_HOSTNAME;
  if (
    !library ||
    !/^\d+$/.test(library) ||
    !key ||
    !hostname ||
    !/^[a-zA-Z0-9.-]+$/.test(hostname)
  )
    return null;
  return { library, key, hostname };
}
export async function bunnyRequest(
  path: string,
  method = "GET",
  body?: object,
) {
  const config = bunnyConfig();
  if (!config) throw new Error("Video uploads are not configured yet.");
  const response = await fetch(
    `https://video.bunnycdn.com/library/${config.library}/videos${path}`,
    {
      method,
      headers: { AccessKey: config.key, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    },
  );
  // Deletion is safe to retry if the provider already removed the asset.
  if (method === "DELETE" && (response.ok || response.status === 404))
    return { guid: "", status: 0, width: 0, height: 0 };
  if (!response.ok) throw new Error("Video service unavailable. Try again.");
  return (await response.json()) as {
    guid: string;
    status: number;
    encodeProgress?: number;
    width: number;
    height: number;
    rotation?: number;
    hasMP4Fallback?: boolean;
    availableResolutions?: string;
    thumbnailFileName?: string;
    length?: number;
  };
}
export function signedVideoUpload(videoId: string) {
  const config = bunnyConfig();
  if (!config) throw new Error("Video uploads are not configured yet.");
  const expires = String(Math.floor(Date.now() / 1000) + 7200);
  return {
    endpoint: "https://video.bunnycdn.com/tusupload",
    headers: {
      AuthorizationSignature: createHash("sha256")
        .update(config.library + config.key + expires + videoId)
        .digest("hex"),
      AuthorizationExpire: expires,
      LibraryId: config.library,
      VideoId: videoId,
    },
  };
}
