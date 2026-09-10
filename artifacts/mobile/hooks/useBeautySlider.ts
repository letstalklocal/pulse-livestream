import { useEffect, useRef } from "react";

/** Keep touch dispatch separate from React updates and apply only the latest value per frame. */
export function useBeautySlider(value: number, onChange: (value: number) => void) {
  const current = useRef(value);
  const callback = useRef(onChange);
  const pending = useRef(value);
  const frame = useRef<number | null>(null);
  current.current = value;
  callback.current = onChange;
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);
  return (next: number) => {
    if (!Number.isFinite(next)) return;
    pending.current = Math.round(Math.max(0, Math.min(1, next)) * 100) / 100;
    if (frame.current !== null || pending.current === current.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (pending.current === current.current) return;
      current.current = pending.current;
      callback.current(pending.current);
    });
  };
}
