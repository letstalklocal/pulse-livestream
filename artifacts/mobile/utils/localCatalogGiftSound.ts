import { Platform } from "react-native";
import type { CatalogAsset } from "./giftCatalog";
import { acquireGiftAsset } from "./giftAssetCache";

const voices = new Set<() => void>();
/** Local sender/DM audio only. Live viewers hear the recipient host's published effect. */
export async function prepareLocalCatalogGiftSound(asset: CatalogAsset): Promise<{ play: () => void; stop: () => void }> {
  if (Platform.OS === "web") return { play() {}, stop() {} };
  let usedFallback = false;
  const defaultUri = () => {
    usedFallback = true;
    const path = require("./momentGiftAssets.native").prepareMomentGiftSound() as string;
    return `file://${path}`;
  };
  const lease = await acquireGiftAsset(asset).catch(() => {
    return { uri: defaultUri(), release() {} };
  });
  let player: ReturnType<typeof import("expo-video").createVideoPlayer>;
  try {
    player = require("expo-video").createVideoPlayer({ uri: lease.uri });
    player.loop = false;
    player.muted = false;
    player.audioMixingMode = "mixWithOthers";
  } catch (error) { lease.release(); throw error; }
  let stopped = false;
  let started = false;
  const subscriptions: Array<{ remove: () => void }> = [];
  const stop = () => {
    if (stopped) return;
    stopped = true; voices.delete(stop);
    subscriptions.forEach(subscription => subscription.remove());
    try { player.pause(); } catch {}
    try { player.release(); } catch {}
    lease.release();
  };
  subscriptions.push(player.addListener("playToEnd", stop));
  subscriptions.push(player.addListener("statusChange", event => {
    if (event.status !== "error") return;
    if (!usedFallback && !stopped) {
      try { player.replace({ uri: defaultUri() }); if (started) player.play(); return; } catch {}
    }
    stop();
  }));
  return { stop, play: () => {
    if (stopped || started) return;
    started = true;
    while (voices.size >= 3) voices.values().next().value?.();
    voices.add(stop);
    try { player.play(); } catch { stop(); }
  } };
}
