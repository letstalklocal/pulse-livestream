/** Full-file cache. All mutations are serialized; reads never renew FIFO age. */
export const VIDEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const VIDEO_CACHE_MAX_BYTES = 256 * 1024 * 1024;
export type CacheEntry = { key: string; file: string; bytes: number; createdAt: number };
export type CacheLease = CacheEntry & { uri: string; source: 'cache' | 'download'; release: () => Promise<void> };
export interface CacheStorage {
  read(): Promise<CacheEntry[]>;
  write(entries: CacheEntry[]): Promise<void>;
  exists(file: string): Promise<boolean>;
  remove(file: string): Promise<void>;
  uri(file: string): string;
  download(url: string, signal: AbortSignal, progress: (bytes: number) => void): Promise<{ file: string; bytes: number }>;
}
export function createVideoCache(storage: CacheStorage, now = Date.now, maxBytes = VIDEO_CACHE_MAX_BYTES) {
  let entries: CacheEntry[] | undefined;
  const pins = new Map<string, number>();
  let tail: Promise<unknown> = Promise.resolve();
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const next = tail.then(work, work);
    tail = next.catch(() => {});
    return next;
  }
  const expired = (entry: CacheEntry) => now() - entry.createdAt >= VIDEO_CACHE_TTL_MS || entry.createdAt > now();
  async function load() { entries ??= await storage.read(); }
  async function remove(entry: CacheEntry) {
    await storage.remove(entry.file);
    entries = entries!.filter(item => item.file !== entry.file);
  }
  async function prune() {
    await load();
    for (const entry of [...entries!].sort((a, b) => a.createdAt - b.createdAt)) {
      if (!pins.has(entry.file) && (expired(entry) || !await storage.exists(entry.file))) await remove(entry);
    }
    await storage.write(entries!);
  }
  function lease(entry: CacheEntry, source: CacheLease['source']): CacheLease {
    pins.set(entry.file, (pins.get(entry.file) ?? 0) + 1);
    let released = false;
    return { ...entry, uri: storage.uri(entry.file), source, release: () => serial(async () => {
      if (released) return;
      released = true;
      const count = (pins.get(entry.file) ?? 1) - 1;
      if (count) pins.set(entry.file, count); else pins.delete(entry.file);
      await prune();
    }) };
  }
  return {
    // The caller must authorize media first and supply a stable scope/id/version key.
    // Do not use signed URL text as identity for future private/message integrations.
    acquire(key: string, url: string, signal: AbortSignal, progress: (bytes: number) => void = () => {}): Promise<CacheLease> {
      return serial(async () => {
        if (signal.aborted) throw new Error('cancelled');
        await prune();
        const hit = entries!.find(entry => entry.key === key && !expired(entry));
        if (hit) return lease(hit, 'cache');
        const downloaded = await storage.download(url, signal, progress);
        try {
          if (signal.aborted) throw new Error('cancelled');
          if (downloaded.bytes <= 0 || downloaded.bytes > maxBytes) throw new Error('cache-size');
          let used = entries!.reduce((total, entry) => total + entry.bytes, 0);
          for (const entry of [...entries!].sort((a, b) => a.createdAt - b.createdAt)) {
            if (used + downloaded.bytes <= maxBytes) break;
            if (pins.has(entry.file)) continue;
            await remove(entry);
            used -= entry.bytes;
          }
          if (used + downloaded.bytes > maxBytes) throw new Error('cache-busy');
          const entry = { ...downloaded, key, createdAt: now() };
          await storage.write([...entries!, entry]);
          entries!.push(entry);
          return lease(entry, 'download');
        } catch (error) {
          await storage.remove(downloaded.file);
          throw error;
        }
      });
    },
    snapshot: () => serial(async () => { await prune(); return entries!.map(entry => ({ ...entry })); }),
    clear: () => serial(async () => {
      await load();
      for (const entry of [...entries!]) if (!pins.has(entry.file)) await remove(entry);
      await storage.write(entries!);
    }),
    // Prototype-only clock shortcut: uses the exact production expiry path.
    expireForTest: () => serial(async () => {
      await load();
      entries = entries!.map(entry => ({ ...entry, createdAt: now() - VIDEO_CACHE_TTL_MS }));
      await prune();
    }),
  };
}
