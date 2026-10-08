import { giftAssetUrl, type CatalogAsset } from "./giftCatalog";

// Expo's File/Directory API is native-only. Browsers keep verified bytes in
// blob URLs instead, with leases protecting mounted artwork from eviction.
const budget = 96 * 1024 * 1024;
type Entry = { uri: string; size: number; used: number; leases: number };
const entries = new Map<string, Entry>();
const pending = new Map<string, Promise<Entry>>();
const assetKey = (asset: CatalogAsset) => `${asset.sha256.toLowerCase()}.${asset.format}`;

function evict() {
  let total = [...entries.values()].reduce((sum, entry) => sum + entry.size, 0);
  for (const [key, entry] of [...entries].sort((a, b) => a[1].used - b[1].used)) {
    if (total <= budget) break;
    if (entry.leases || pending.has(key)) continue;
    URL.revokeObjectURL(entry.uri);
    entries.delete(key);
    total -= entry.size;
  }
}

export function getCachedGiftAssetUri(asset: CatalogAsset | null | undefined): string | null {
  if (!asset) return null;
  const entry = entries.get(assetKey(asset));
  return entry?.size === asset.byteSize ? entry.uri : null;
}

export async function acquireGiftAsset(asset: CatalogAsset): Promise<{ uri: string; release: () => void }> {
  if (!/^[a-f0-9]{64}$/i.test(asset.sha256) || !Number.isSafeInteger(asset.byteSize) || asset.byteSize <= 0 || asset.byteSize > 40 * 1024 * 1024) throw new Error("Invalid gift asset");
  const key = assetKey(asset);
  let operation = pending.get(key);
  if (!operation) {
    const cached = entries.get(key);
    if (cached && cached.size !== asset.byteSize) throw new Error("Gift asset size mismatch");
    operation = cached ? Promise.resolve(cached) : (async () => {
      const response = await fetch(giftAssetUrl(asset.url));
      if (!response.ok) throw new Error("Gift asset download failed");
      const blob = await response.blob();
      if (blob.size !== asset.byteSize) throw new Error("Gift asset size mismatch");
      const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
      const checksum = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      if (checksum !== asset.sha256.toLowerCase()) throw new Error("Gift asset checksum mismatch");
      const entry = { uri: URL.createObjectURL(blob), size: blob.size, used: Date.now(), leases: 0 };
      entries.set(key, entry);
      return entry;
    })().catch(error => { pending.delete(key); throw error; });
    pending.set(key, operation);
  }
  const entry = await operation;
  // Concurrent callers must agree with the verified asset metadata.
  if (entry.size !== asset.byteSize) throw new Error("Gift asset size mismatch");
  entry.leases++;
  entry.used = Date.now();
  if (pending.get(key) === operation) pending.delete(key);
  evict();
  let released = false;
  return { uri: entry.uri, release: () => {
    if (!released) { released = true; entry.leases--; entry.used = Date.now(); evict(); }
  } };
}

export async function prefetchGiftThumbnails(assets: Array<CatalogAsset | null | undefined>) {
  const queue = assets.slice(0, 8).filter((asset): asset is CatalogAsset => !!asset);
  await Promise.all([0, 1, 2].map(async () => {
    while (queue.length) {
      try { const lease = await acquireGiftAsset(queue.shift()!); lease.release(); }
      catch { /* Retry when the artwork is displayed. */ }
    }
  }));
}
