import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export type CatalogAsset = { id: string; url: string; sha256: string; byteSize: number; format: string; durationMs?: number; width?: number; height?: number };
export type GiftSnapshot = {
  id: string; revisionId: string; name: string; emoji: string; coinCost: number;
  type?: "image" | "animation";
  thumbnail: CatalogAsset | null; animation?: CatalogAsset | null;
  androidAnimation?: CatalogAsset | null; iosAnimation?: CatalogAsset | null;
  sound: CatalogAsset | null; legacy: boolean;
  framing: { preset: "contained" | "fullscreen"; scale: number; x: number; y: number };
};
export type CatalogGift = { id: string; name: string; emoji: string; coins: number; size: number; revisionId?: string; snapshot?: GiftSnapshot };
export type GiftCollection = { id: string; name: string; sortOrder: number; locked: boolean; gifts: CatalogGift[] };
export type GiftCatalog = { version: string; collections: GiftCollection[] };
const cacheKey = `pulse-gift-catalog-v1-${Platform.OS}`;
const listeners = new Set<() => void>();
let catalog: GiftCatalog | null = null;
let pending: Promise<void> | null = null;
let etag: string | null = null;
export const giftAssetUrl = (url: string) => url.startsWith("/api/gift-catalog/assets/")
  ? `${process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : ""}${url}` : url;
export function validateGiftSnapshot(value: unknown): value is GiftSnapshot {
  if (!value || typeof value !== "object") return false;
  const gift = value as GiftSnapshot;
  const validAsset = (asset: CatalogAsset | null | undefined) => asset == null ||
    (typeof asset.id === "string" && typeof asset.format === "string" && /^\/[a-z0-9/_-]+$/i.test(asset.url) && asset.url.startsWith("/api/gift-catalog/assets/") && /^[a-f0-9]{64}$/i.test(asset.sha256) && Number.isSafeInteger(asset.byteSize) && asset.byteSize > 0 && asset.byteSize <= 40 * 1024 * 1024);
  return typeof gift.id === "string" && typeof gift.revisionId === "string" && typeof gift.name === "string" &&
    (gift.type === undefined || gift.type === "image" || gift.type === "animation") &&
    typeof gift.emoji === "string" && Number.isSafeInteger(gift.coinCost) && gift.coinCost > 0 &&
    !!gift.framing && ["contained", "fullscreen"].includes(gift.framing.preset) &&
    [gift.framing.scale, gift.framing.x, gift.framing.y].every(Number.isFinite) && gift.framing.scale > 0 && gift.framing.scale <= 3 &&
    [gift.thumbnail, gift.animation, gift.androidAnimation, gift.iosAnimation, gift.sound].every(validAsset);
}
export function parseGiftCatalog(value: unknown): GiftCatalog {
  const data = value as { version: string; collections: Array<Omit<GiftCollection, "gifts"> & { gifts: GiftSnapshot[] }> };
  if (!data || typeof data.version !== "string" || !Array.isArray(data.collections)) throw new Error("Invalid gift catalog");
  const ids = new Set<string>();
  const collections = data.collections.map(collection => {
    if (!collection || typeof collection.id !== "string" || typeof collection.name !== "string" || !Array.isArray(collection.gifts)) throw new Error("Invalid gift collection");
    if (ids.has(collection.id)) throw new Error("Duplicate gift collection");
    ids.add(collection.id);
    return { ...collection, gifts: collection.gifts.map(snapshot => {
      if (!validateGiftSnapshot(snapshot)) throw new Error("Invalid gift revision");
      return giftFromSnapshot(snapshot)!;
    }).sort((a, b) => a.coins - b.coins || a.id.localeCompare(b.id)) };
  }).sort((a, b) => a.id === "popular" ? -1 : b.id === "popular" ? 1 : a.sortOrder - b.sortOrder);
  if (!collections.some(collection => collection.id === "popular" && collection.locked)) throw new Error("Missing Popular collection");
  return { version: data.version, collections };
}
export function giftFromSnapshot(value: unknown): CatalogGift | null {
  if (!validateGiftSnapshot(value)) return null;
  const sizes: Record<string, number> = { rose: 36, heart: 36, party: 36, strawberry: 36, diamond: 36, lips: 36, rocket: 40, crown: 36 };
  return { id: value.id, name: value.name, emoji: value.emoji, coins: value.coinCost, size: sizes[value.id] ?? 44, revisionId: value.revisionId, snapshot: value };
}
export function getGiftCatalog() { return catalog; }
export function giftPlayerCapabilities(): string {
  if (Platform.OS === "android") return "svga,webm-alpha";
  if (Platform.OS !== "ios") return "";
  try {
    const module = require("expo").requireOptionalNativeModule("PulseAlphaPlayer") as { supportsMutedPlayback?: boolean } | null;
    return module?.supportsMutedPlayback === true ? "svga,packed-alpha-mp4" : "svga";
  } catch { return "svga"; }
}
export function subscribeGiftCatalog(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish(next: GiftCatalog) { catalog = next; listeners.forEach(listener => listener()); }
export async function refreshGiftCatalog(): Promise<void> {
  if (pending) return pending;
  pending = (async () => {
    if (!catalog) {
      try { const saved = await AsyncStorage.getItem(cacheKey); if (saved) { const data = JSON.parse(saved); publish(parseGiftCatalog(data.catalog ?? data)); etag = typeof data.etag === "string" ? data.etag : null; } } catch { /* Bundled catalog remains available. */ }
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const capabilities = giftPlayerCapabilities();
      const response = await fetch(`${process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : ""}/api/gift-catalog?platform=${Platform.OS}&capabilities=${capabilities}`, { signal: controller.signal, headers: etag ? { "If-None-Match": etag } : {} });
      if (response.status === 304) return;
      if (!response.ok) throw new Error("Gift catalog unavailable");
      const raw = await response.json();
      publish(parseGiftCatalog(raw));
      etag = response.headers.get("ETag");
      await AsyncStorage.setItem(cacheKey, JSON.stringify({ catalog: raw, etag }));
    } finally { clearTimeout(timeout); }
  })().finally(() => { pending = null; });
  return pending;
}
