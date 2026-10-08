import { Platform } from "react-native";

// Keep an explicit platform dispatch for Metro graphs that still resolve this
// original path after a platform-specific file is added during development.
// Native File/Directory constructors must never execute in the web preview.
const cache: typeof import("./giftAssetCache.native") = Platform.OS === "web"
  ? require("./giftAssetCache.web")
  : require("./giftAssetCache.native");

export const getCachedGiftAssetUri = cache.getCachedGiftAssetUri;
export const acquireGiftAsset = cache.acquireGiftAsset;
export const prefetchGiftThumbnails = cache.prefetchGiftThumbnails;
