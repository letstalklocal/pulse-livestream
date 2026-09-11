import type { MomentGift } from "./moments";
// Browser preview has no Agora camera; only native Android performs the recording test.
export function recordGiftMoment(
  _engine: unknown,
  _channelId: string,
  _gift: MomentGift,
  _getToken: () => Promise<string | null>,
  _options: {
    getVideoSize: () => { width: number; height: number } | null;
    onVisualState?: (active: boolean) => void;
    onGiftVisible?: () => void;
    onFallback?: () => void;
  },
) {
  return false;
}
export function stopMomentRecording(_engine: unknown) {}

export function isMomentRecording(_engine: unknown) {
  return false;
}

export function prepareMomentRecording() {}
