// Limit history translation bursts; leaving a screen cancels queued requests.
let active = 0;
const waiting: Array<() => void> = [];
export function queueTranslation<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => {
      const index = waiting.indexOf(start);
      if (index >= 0) waiting.splice(index, 1);
      reject(new Error("Translation cancelled"));
    };
    const start = () => {
      signal.removeEventListener("abort", aborted);
      if (signal.aborted) { reject(new Error("Translation cancelled")); return; }
      active++;
      void Promise.resolve().then(run).then(resolve, reject).finally(() => {
        active--;
        waiting.shift()?.();
      });
    };
    if (signal.aborted) { reject(new Error("Translation cancelled")); return; }
    if (active < 4) start();
    else { waiting.push(start); signal.addEventListener("abort", aborted, { once: true }); }
  });
}
