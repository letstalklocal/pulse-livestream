import { Directory, File, Paths } from "expo-file-system";
import { customGiftSounds } from "./liveGiftSoundConfig";
import { prepareMomentGiftSound } from "./momentGiftAssets.native";
const paths = new Map<string, string>();
// Keep distinct effects for overlapping gifts, with a bounded number of voices.
let voice = 0;
export function prepareLiveGiftSound(giftName: string): string {
  const data = customGiftSounds[giftName];
  if (!data) return prepareMomentGiftSound();
  const cached = paths.get(data);
  if (cached) return cached;
  try {
    const directory = new Directory(Paths.cache, "live-gift-sounds");
    directory.create({ idempotent: true, intermediates: true });
    const file = new File(directory, `custom-${paths.size}.wav`);
    file.write(data, { encoding: "base64" });
    const path = file.uri.replace(/^file:\/\//, "");
    paths.set(data, path);
    return path;
  } catch (error) {
    console.warn("[Live] Custom gift sound unavailable; using default", error);
    return prepareMomentGiftSound();
  }
}
export function playLiveGiftSound(engine: any, giftName: string): void {
  if (!engine) return;
  try {
    const id = 7800 + (voice++ % 3);
    engine.stopEffect(id);
    const path = prepareLiveGiftSound(giftName);
    // Publish once from the host: viewers (including PiP) hear the same effect.
    const result = engine.playEffect(id, path, 0, 1, 0, 65, true, 0);
    if (result < 0) {
      const fallback = engine.playEffect(id, prepareMomentGiftSound(), 0, 1, 0, 65, true, 0);
      if (fallback < 0) console.warn("[Live] Gift sound failed", fallback);
    }
  } catch (error) { console.warn("[Live] Gift sound failed", error); }
}
