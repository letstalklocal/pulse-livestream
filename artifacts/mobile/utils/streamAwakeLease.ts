// Keep each stream's lease independent so cleanup cannot release another screen's lock.
export function startStreamAwakeLease({ tag, activate, deactivate, isForeground, subscribe, reportError }: {
  tag: string;
  activate: (tag: string) => Promise<unknown>;
  deactivate: (tag: string) => Promise<unknown>;
  isForeground: () => boolean;
  subscribe: (onActive: () => void) => () => void;
  reportError: (error: unknown) => void;
}) {
  let disposed = false;
  let busy = false;
  let warned = false;
  let pending = Promise.resolve();
  const refresh = () => {
    if (disposed || busy || !isForeground()) return;
    busy = true;
    pending = Promise.resolve().then(() => {
      if (!disposed && isForeground()) return activate(tag);
    }).then(() => { warned = false; }).catch(error => {
      if (!disposed && !warned) { reportError(error); warned = true; }
    }).finally(() => { busy = false; });
  };
  const unsubscribe = subscribe(refresh);
  refresh();
  // Also repair a flag reset by native media/window transitions while foregrounded.
  const timer = setInterval(refresh, 10_000);
  return () => {
    disposed = true;
    clearInterval(timer);
    unsubscribe();
    // A late native activation must settle before releasing this instance's tag.
    void pending.then(() => deactivate(tag)).catch(reportError);
  };
}
