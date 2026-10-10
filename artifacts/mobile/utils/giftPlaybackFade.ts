/** Preserve full playback; only opacity/gain changes in its final second. */
export function giftEndGain(positionMs: number, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || !Number.isFinite(positionMs) || positionMs < 0) return 1;
  return Math.max(0, Math.min(1, (durationMs - positionMs) / Math.min(1000, durationMs)));
}

/** SVGA exposes start/finish, not progress. Start only after its native onStart. */
export function scheduleGiftEndFade(durationMs: number | undefined, update: (gain: number) => void): () => void {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) return () => {};
  const start = Date.now();
  let interval: ReturnType<typeof setInterval> | undefined;
  const timeout = setTimeout(() => {
    const tick = () => {
      const gain = giftEndGain(Date.now() - start, durationMs);
      update(gain);
      if (gain === 0) clearInterval(interval);
    };
    interval = setInterval(tick, 33);
    tick();
  }, Math.max(0, durationMs - 1000));
  return () => { clearTimeout(timeout); clearInterval(interval); };
}
