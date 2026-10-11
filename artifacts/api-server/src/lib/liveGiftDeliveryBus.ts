// Presentation only. Installed by global live delivery, never by wallet code.
export type LiveGiftEvent = { type: string; channelId: string; giftId?: string; recipientUid?: number | null;
  giftSnapshot?: Record<string, any> | null; combo?: { id: string; count: number }; [key: string]: unknown };
type Handler = (event: LiveGiftEvent, deliver: (event: LiveGiftEvent) => void) => boolean;
let handler: Handler | undefined;
let stop: ((channel: string) => void) | undefined;
export function installLiveGiftDelivery(next: Handler, onStop: (channel: string) => void) { handler = next; stop = onStop; }
export function deliverLiveGift(event: LiveGiftEvent, deliver: (event: LiveGiftEvent) => void) {
  let sent = false;
  const once = (value: LiveGiftEvent) => { if (!sent) { sent = true; deliver(value); } };
  try { if (handler?.(event, once)) return; } catch { /* Playback must never fail a paid notification. */ }
  once(event);
}
export function stopLiveGiftDelivery(channel: string) { try { stop?.(channel); } catch {} }
