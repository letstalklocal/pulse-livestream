// Share timer/focus refreshes. A deadline prevents a stalled request from
// holding the lock indefinitely. Tasks must check the signal before applying data.
export function createDmSyncRunner(task: (signal: AbortSignal) => Promise<void>, timeoutMs = 15_000) {
  let inFlight: Promise<void> | null = null;
  let controller: AbortController | null = null;
  const run = (): Promise<void> => {
    if (inFlight) return inFlight;
    const current = new AbortController();
    controller = current;
    let timer: ReturnType<typeof setTimeout>;
    const cancelled = new Promise<never>((_, reject) => {
      current.signal.addEventListener("abort", () => reject(new Error("DM refresh cancelled or timed out")), { once: true });
      timer = setTimeout(() => current.abort(), timeoutMs);
    });
    inFlight = Promise.race([Promise.resolve().then(() => task(current.signal)), cancelled]).finally(() => {
      clearTimeout(timer);
      inFlight = null;
      controller = null;
    });
    return inFlight;
  };
  return { run, cancel: () => controller?.abort() };
}
