import { acquireGiftAsset } from "./giftAssetCache";
import type { GiftSnapshot } from "./giftCatalog";
import { playLiveGiftSound } from "./liveGiftSound";
import { giftEndGain } from "./giftPlaybackFade";

let voice = 0;
const active = new Map<number, { engine: any; stop: () => void }>();
const generations = new WeakMap<object, number>();
/** Stop owned voices and retire pending downloads before releasing/switching this engine. */
export function stopPublishedCatalogGiftSounds(engine: any): void {
  if (!engine) return;
  generations.set(engine, (generations.get(engine) ?? 0) + 1);
  for (const voice of [...active.values()]) if (voice.engine === engine) voice.stop();
}
/** Recipient host alone publishes the portable custom/extracted sound once. */
export async function playPublishedCatalogGiftSound(engine: any, snapshot: GiftSnapshot, isCurrent: () => boolean): Promise<void> {
  if (!engine || !snapshot.sound || !isCurrent()) return;
  const generation = generations.get(engine) ?? 0;
  const current = () => (generations.get(engine) ?? 0) === generation && isCurrent();
  let lease: Awaited<ReturnType<typeof acquireGiftAsset>>;
  try { lease = await acquireGiftAsset(snapshot.sound); }
  catch { if (current()) playLiveGiftSound(engine, snapshot.name); return; }
  if (!current()) { lease.release(); return; }
  const id = 7850 + (voice++ % 3);
  active.get(id)?.stop();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fadeTimer: ReturnType<typeof setInterval> | undefined;
  let subscription: { remove: () => void } | undefined;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    if (fadeTimer) clearInterval(fadeTimer);
    subscription?.remove();
    try { engine.stopEffect(id); } catch {}
    lease.release();
    if (active.get(id)?.stop === stop) active.delete(id);
  };
  active.set(id, { engine, stop });
  const { AppState } = require("react-native") as typeof import("react-native");
  subscription = AppState.addEventListener("change", state => { if (state !== "active") stop(); });
  try {
    engine.stopEffect(id);
    const result = engine.playEffect(id, lease.uri.replace(/^file:\/\//, ""), 0, 1, 0, 65, true, 0);
    if (result < 0) { stop(); if (current()) playLiveGiftSound(engine, snapshot.name); return; }
    // Change only this gift's effect, never the microphone or the whole stream.
    const measuredDuration = engine.getEffectDuration(lease.uri.replace(/^file:\/\//, ""));
    const soundDuration = measuredDuration > 0 ? measuredDuration : snapshot.sound.durationMs ?? 0;
    const animation = snapshot.animation ?? (require("react-native").Platform.OS === "android" ? snapshot.androidAnimation : snapshot.iosAnimation);
    const animationDuration = animation?.durationMs ?? 0;
    const fadeDuration = soundDuration > 0 && animationDuration > 0 ? Math.min(soundDuration, animationDuration) : soundDuration || animationDuration;
    if (animation && fadeDuration > 0) fadeTimer = setInterval(() => {
      if (!current()) { stop(); return; }
      try {
        const position = engine.getEffectCurrentPosition(id);
        if (position >= 0) engine.setVolumeOfEffect(id, 65 * giftEndGain(position, fadeDuration));
      } catch { /* Unsupported position reporting must not interrupt playback. */ }
    }, 50);
    // Audio-only lease guard; video removal is always player-completion driven.
    timer = setTimeout(stop, (snapshot.sound.durationMs ?? 60_000) + 1000);
  } catch { stop(); if (current()) playLiveGiftSound(engine, snapshot.name); }
}
