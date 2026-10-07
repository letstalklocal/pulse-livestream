import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { getGiftCatalog, refreshGiftCatalog, subscribeGiftCatalog } from "@/utils/giftCatalog";
import { POPULAR_GIFTS, LUXURY_GIFTS } from "@/components/GiftPicker";
import { prefetchGiftThumbnails } from "@/utils/giftAssetCache";

const fallback = () => ({ version: "bundled", collections: [
  { id: "popular", name: "Popular", sortOrder: 0, locked: true, gifts: POPULAR_GIFTS },
  { id: "luxury", name: "Luxury", sortOrder: 1, locked: false, gifts: LUXURY_GIFTS },
] });
export function useGiftCatalog(enabled = true) {
  const [catalog, setCatalog] = useState(() => getGiftCatalog() ?? fallback());
  useEffect(() => subscribeGiftCatalog(() => setCatalog(getGiftCatalog() ?? fallback())), []);
  // A mounted, closed drawer can prepare Popular artwork before the user opens it.
  useEffect(() => { void refreshGiftCatalog().catch(() => {}); }, []);
  useEffect(() => {
    const popular = catalog.collections.find(collection => collection.id === "popular");
    if (popular) void prefetchGiftThumbnails(popular.gifts.map(gift => gift.snapshot?.thumbnail));
  }, [catalog]);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { void refreshGiftCatalog().catch(() => {}); };
    refresh();
    const timer = setInterval(refresh, 60_000);
    const foreground = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    return () => { clearInterval(timer); foreground.remove(); };
  }, [enabled]);
  return { ...catalog, gifts: catalog.collections.flatMap(collection => collection.gifts), refresh: refreshGiftCatalog };
}
