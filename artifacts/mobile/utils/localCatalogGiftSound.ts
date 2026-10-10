import { Platform } from "react-native";
import type { CatalogAsset } from "./giftCatalog";
import { acquireGiftAsset } from "./giftAssetCache";
import { giftEndGain } from "./giftPlaybackFade";

const voices = new Set<() => void>();
/** Local sender/DM audio only. Live viewers hear the recipient host's published effect. */
export async function prepareLocalCatalogGiftSound(asset: CatalogAsset, fadeOut = false): Promise<{ play: () => void; stop: () => void; setVolume: (gain: number) => void }> {
  if (Platform.OS === "web") return { play() {}, stop() {}, setVolume() {} };
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
  let animationGain = 1;
  const updateVolume = () => {
    if (stopped) return;
    const duration = player.duration > 0 ? player.duration * 1000 : usedFallback ? 0 : asset.durationMs ?? 0;
    player.volume = Math.min(animationGain, fadeOut ? giftEndGain(player.currentTime * 1000, duration) : 1);
  };
  player.timeUpdateEventInterval = 0.05;
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
  subscriptions.push(player.addListener("timeUpdate", updateVolume));
  subscriptions.push(player.addListener("statusChange", event => {
    if (event.status !== "error") return;
    if (!usedFallback && !stopped) {
      try { player.replace({ uri: defaultUri() }); if (started) player.play(); return; } catch {}
    }
    stop();
  }));
  return { stop, setVolume: gain => { animationGain = Math.max(0, Math.min(1, gain)); updateVolume(); }, play: () => {
    if (stopped || started) return;
    started = true;
    while (voices.size >= 3) voices.values().next().value?.();
    voices.add(stop);
    try { player.play(); } catch { stop(); }
  } };
}
