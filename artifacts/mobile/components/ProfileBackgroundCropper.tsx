import type { ProfileBackgroundCropperProps } from "./ProfileBackgroundCropper.types";

export type { ProfileBackgroundCropSource } from "./ProfileBackgroundCropper.types";

// Android uses Expo ImagePicker's native 16:9 editor. The custom cropper is
// needed on iOS because its system editor does not honor non-square aspects.
export function ProfileBackgroundCropper(_props: ProfileBackgroundCropperProps) {
  return null;
}