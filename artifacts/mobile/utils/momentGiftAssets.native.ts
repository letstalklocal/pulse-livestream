import { Directory, File, Paths } from "expo-file-system";
import { giftFramesBase64 } from "./momentGiftFrames";
import { MOMENT_GIFT_REVISION } from "./momentGiftConfig";
import { defaultGiftSoundBase64 } from "./defaultGiftSound";
let soundPath: string | undefined;
export function prepareMomentGiftSound() {
  if (soundPath) return soundPath;
  const directory = new Directory(Paths.document, "moment-gift-assets");
  directory.create({ idempotent: true, intermediates: true });
  const file = new File(directory, "default-gift-v1.wav");
  if (!file.exists) file.write(defaultGiftSoundBase64, { encoding: "base64" });
  soundPath = file.uri.replace(/^file:\/\//, "");
  return soundPath;
}

let paths: string[] | undefined;
export function prepareMomentGiftAssets() {
  if (paths) return paths;
  const directory = new Directory(
    Paths.document,
    "moment-gift-assets",
    MOMENT_GIFT_REVISION,
  );
  directory.create({ idempotent: true, intermediates: true });
  // Immutable files are prepared before gifting. The native decoder may still
  // be reading a previous frame; never overwrite a file used by the compositor.
  paths = giftFramesBase64.map((data, index) => {
    const file = new File(directory, `${index}.png`);
    if (!file.exists) file.write(data, { encoding: "base64" });
    return file.uri.replace(/^file:\/\//, "");
  });
  return paths;
}
