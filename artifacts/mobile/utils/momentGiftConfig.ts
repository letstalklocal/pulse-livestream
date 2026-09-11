import type { WatermarkOptions } from "react-native-agora";
export const MOMENT_GIFT_REVISION = "live-crown-hd-v1";
export const MOMENT_LENGTH_MS = 7000;
export const GIFT_ANIMATION_MS = 2200;
export type MomentVideoSize = { width: number; height: number };
export function momentGiftWatermarkOptions(
  video: MomentVideoSize,
): WatermarkOptions {
  if (
    !Number.isFinite(video.width) ||
    !Number.isFinite(video.height) ||
    video.width <= 0 ||
    video.height <= 0
  )
    throw new Error(
      "Video dimensions are not available yet. Wait a few seconds and retry.",
    );
  // Give Agora both orientation-specific pixel rectangles. The ratio-mode
  // experiment agreed across views but was enlarged/clipped on the device.
  const short = Math.min(video.width, video.height);
  const long = Math.max(video.width, video.height);
  // Double the visible crown while preserving its previous travel distance.
  // The new sprite is 384x576 with the crown centered at (192,384).
  const units = Math.max(1, Math.floor(Math.min(128, short * 0.24) / 3));
  const width = units * 6,
    height = units * 9;
  const place = (frameWidth: number, frameHeight: number) => ({
    x: Math.round((frameWidth - width) / 2),
    y: Math.round(frameHeight / 2 - (height * 384) / 576),
    width,
    height,
  });
  return {
    visibleInPreview: true,
    mode: 0, // FitModeCoverPosition; never combine with watermarkRatio.
    positionInPortraitMode: place(short, long),
    positionInLandscapeMode: place(long, short),
  };
}
