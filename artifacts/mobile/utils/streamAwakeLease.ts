// Keep each stream's lease independent so cleanup cannot release another screen's lock.
export function startStreamAwakeLease({ tag, activate, deactivate, isForeground, subscribe, reportError, now = Date.now }: {
  tag: string;
  activate: (tag: string) => Promise<unknown>;
  deactivate: (tag: string) => Promise<unknown>;
  isForeground: () => boolean;
  subscribe: (onActive: () => void) => () => void;
  reportError: (error: unknown) => void;
  now?: () => number;
}) {
  let disposed = false;
  let busy = false;
  let activationStartedAt = 0;
  let activationGeneration = 0;
  let warned = false;
  const refresh = () => {
    if (disposed || !isForeground()) return;
    // Native activation should resolve promptly. Do not let one hung bridge call
    // permanently suppress the foreground and periodic recovery attempts.
    if (busy && now() - activationStartedAt < 5_000) return;
    busy = true;
    activationStartedAt = now();
    const generation = ++activationGeneration;
    void Promise.resolve().then(() => {
      if (!disposed && isForeground()) return activate(tag);
    }).then(() => {
      warned = false;
      // If an activation completes after its screen has closed, immediately
      // release it rather than leaving the device awake for a stale stream.
      if (disposed) return deactivate(tag);
    }).catch(error => {
      if (!disposed && !warned) { reportError(error); warned = true; }
    }).finally(() => {
      if (generation === activationGeneration) busy = false;
    });
  };
  const unsubscribe = subscribe(refresh);
  refresh();
  // Also repair a flag reset by native media/window transitions while foregrounded.
  const timer = setInterval(refresh, 10_000);
  return () => {
    disposed = true;
    clearInterval(timer);
    unsubscribe();
    // Release any successful activation now. A late activation also releases
    // itself in the completion handler above.
    void deactivate(tag).catch(reportError);
  };
}
