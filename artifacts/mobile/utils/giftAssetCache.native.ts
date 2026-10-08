import { Directory, File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { giftAssetUrl, type CatalogAsset } from "./giftCatalog";

const budget = 96 * 1024 * 1024;
const root = new Directory(Paths.cache, "gift-assets-v1");
type Entry = { file: File; size: number; used: number; leases: number; verifiedAt?: number | null };
const entries = new Map<string, Entry>();
const pending = new Map<string, Promise<Entry>>();
let initialized = false;
const lanes = {
  artwork: { active: 0, limit: 3, waiting: [] as Array<() => void> },
  media: { active: 0, limit: 1, waiting: [] as Array<() => void> },
};
async function scheduled<T>(asset: CatalogAsset, run: () => Promise<T>): Promise<T> {
  const lane = /^(png|jpeg|webp)$/.test(asset.format) ? lanes.artwork : lanes.media;
  if (lane.active >= lane.limit) await new Promise<void>(resolve => lane.waiting.push(resolve));
  else lane.active++;
  try { return await run(); } finally {
    const next = lane.waiting.shift();
    if (next) next(); else lane.active--;
  }
}
const assetKey = (asset: CatalogAsset) => `${asset.sha256.toLowerCase()}.${asset.format.replace(/[^a-z0-9]/gi, "")}`;
function reusable(entry: Entry | undefined, asset: CatalogAsset): entry is Entry {
  return !!entry && entry.verifiedAt !== undefined && entry.file.exists && entry.file.size === asset.byteSize && entry.file.modificationTime === entry.verifiedAt;
}
/** Only exposes files already checksum-verified this session; cold disk files still require verification. */
export function getCachedGiftAssetUri(asset: CatalogAsset | null | undefined): string | null {
  if (!asset) return null;
  const entry = entries.get(assetKey(asset));
  return reusable(entry, asset) ? entry.file.uri : null;
}
function initialize() {
  if (initialized) return;
  root.create({ intermediates: true, idempotent: true });
  for (const file of root.list()) if (file instanceof File) entries.set(file.name, { file, size: file.size, used: file.modificationTime ?? 0, leases: 0 });
  initialized = true;
}
async function verified(file: File, asset: CatalogAsset) {
  if (!file.exists || file.size !== asset.byteSize) throw new Error("Gift asset size mismatch");
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes());
  const checksum = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  if (checksum !== asset.sha256.toLowerCase()) throw new Error("Gift asset checksum mismatch");
}
function evict() {
  let total = [...entries.values()].reduce((sum, entry) => sum + entry.size, 0);
  for (const [key, entry] of [...entries].sort((a, b) => a[1].used - b[1].used)) {
    if (total <= budget) break;
    if (entry.leases || pending.has(key)) continue;
    entry.file.delete(); entries.delete(key); total -= entry.size;
  }
}
/** A lease protects mounted artwork/playback from LRU deletion. No payment occurs here. */
export async function acquireGiftAsset(asset: CatalogAsset): Promise<{ uri: string; release: () => void }> {
  if (!/^[a-f0-9]{64}$/i.test(asset.sha256) || !Number.isSafeInteger(asset.byteSize) || asset.byteSize <= 0 || asset.byteSize > 40 * 1024 * 1024) throw new Error("Invalid gift asset");
  const key = assetKey(asset);
  initialize();
  let operation = pending.get(key);
  if (!operation) {
    const cached = entries.get(key);
    operation = reusable(cached, asset) ? Promise.resolve(cached) : scheduled(asset, async () => {
      const file = new File(root, key);
      if (file.exists) {
        try { await verified(file, asset); } catch { if (entries.get(key)?.leases) throw new Error("Active asset corrupted"); file.delete(); entries.delete(key); }
      }
      if (!file.exists) {
        try { await File.downloadFileAsync(giftAssetUrl(asset.url), file, { idempotent: true }); await verified(file, asset); }
        catch (error) { if (file.exists) file.delete(); throw error; }
      }
      const entry = entries.get(key) ?? { file, size: asset.byteSize, used: Date.now(), leases: 0 };
      entry.verifiedAt = file.modificationTime;
      entries.set(key, entry);
      return entry;
    }).catch(error => { pending.delete(key); throw error; });
    pending.set(key, operation);
  }
  const entry = await operation;
  entry.leases++; entry.used = Date.now();
  if (pending.get(key) === operation) pending.delete(key);
  evict();
  let released = false;
  return { uri: entry.file.uri, release: () => { if (!released) { released = true; entry.leases--; entry.used = Date.now(); evict(); } } };
}
export async function prefetchGiftThumbnails(assets: Array<CatalogAsset | null | undefined>) {
  // First two drawer rows only. Separate media lane prevents large movies blocking artwork.
  const queue = assets.slice(0, 8).filter((asset): asset is CatalogAsset => !!asset);
  await Promise.all([0, 1, 2].map(async () => { while (queue.length) { const asset = queue.shift()!; try { const lease = await acquireGiftAsset(asset); lease.release(); } catch { /* Retry when the artwork is displayed. */ } } }));
}
