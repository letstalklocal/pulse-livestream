export type ProfileBackgroundCropSource = {
  uri: string;
  width: number;
  height: number;
};

export type ProfileBackgroundCropperProps = {
  source: ProfileBackgroundCropSource;
  onCancel: () => void;
  onConfirm: (image: ProfileBackgroundCropSource & { mimeType: string }) => Promise<void>;
};