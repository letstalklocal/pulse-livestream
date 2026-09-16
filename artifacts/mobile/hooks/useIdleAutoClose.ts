import { useCallback, useEffect, useRef } from "react";

export function useIdleAutoClose(onClose: () => void, paused: boolean, delayMs = 10_000) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reset = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (!paused) timer.current = setTimeout(() => {
      timer.current = null;
      closeRef.current();
    }, delayMs);
  }, [paused, delayMs]);
  useEffect(() => {
    reset();
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [reset]);
  return reset;
}
