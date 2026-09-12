import type { StreamBackgroundCropperProps } from "./StreamBackgroundCropper.types";
export type { BackgroundCropSource } from "./StreamBackgroundCropper.types";

// Android uses Expo ImagePicker's existing native 9:16 editor. Keep the iOS
// cropper and its native dependency out of Android and web JavaScript bundles.
export function StreamBackgroundCropper(_props: StreamBackgroundCropperProps) {
  return null;
}
