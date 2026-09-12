export type BackgroundCropSource = { uri: string; width: number; height: number };

export type StreamBackgroundCropperProps = {
  source: BackgroundCropSource;
  onCancel: () => void;
  onConfirm: (image: { uri: string; mimeType: string }) => Promise<void>;
};
