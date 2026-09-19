import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FS from 'expo-file-system/legacy';
import { createVideoCache, VIDEO_CACHE_MAX_BYTES, type CacheEntry } from './core';
const root = `${FS.cacheDirectory}discovery-video-v1/`;
const manifestKey = 'discovery-video-cache-v1';
const safeName = (name: unknown): name is string => typeof name === 'string' && /^[a-z0-9-]+\.mp4$/.test(name);
export const videoCache = createVideoCache({
  async read() {
    if (!FS.cacheDirectory) throw new Error('cache-unavailable');
    await FS.makeDirectoryAsync(root, { intermediates: true });
    const raw = await AsyncStorage.getItem(manifestKey);
    let parsed: unknown;
    try { parsed = JSON.parse(raw ?? '[]'); } catch { parsed = []; }
    const entries: CacheEntry[] = Array.isArray(parsed) ? parsed.filter((entry): entry is CacheEntry =>
      entry && typeof entry.key === 'string' && safeName(entry.file) &&
      Number.isFinite(entry.createdAt) && Number.isFinite(entry.bytes) && entry.bytes > 0) : [];
    const known = new Set(entries.map(entry => entry.file));
    // Remove abandoned partial files, including downloads interrupted by an OS kill.
    for (const file of await FS.readDirectoryAsync(root)) {
      if (!known.has(file)) await FS.deleteAsync(root + file, { idempotent: true });
    }
    return entries;
  },
  write: entries => AsyncStorage.setItem(manifestKey, JSON.stringify(entries)),
  exists: async file => (await FS.getInfoAsync(root + file)).exists,
  remove: file => FS.deleteAsync(root + file, { idempotent: true }),
  uri: file => root + file,
  async download(url, signal, progress) {
    if (!/^https:\/\//i.test(url)) throw new Error('https-required');
    const file = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.mp4`;
    const partial = root + file + '.part';
    let oversized = false;
    const task = FS.createDownloadResumable(url, partial, {}, status => {
      progress(status.totalBytesWritten);
      if (status.totalBytesWritten > VIDEO_CACHE_MAX_BYTES || status.totalBytesExpectedToWrite > VIDEO_CACHE_MAX_BYTES) {
        oversized = true;
        void task.cancelAsync().catch(() => {});
      }
    });
    const cancel = () => { void task.cancelAsync().catch(() => {}); };
    signal.addEventListener('abort', cancel);
    const timeout = setTimeout(cancel, 120_000);
    try {
      if (signal.aborted) throw new Error('cancelled');
      const result = await task.downloadAsync();
      if (signal.aborted) throw new Error('cancelled');
      if (oversized || !result || result.status < 200 || result.status >= 300) throw new Error('download-failed');
      const contentType = Object.entries(result.headers ?? {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1] ?? '';
      if (contentType && !/^(video\/|application\/(octet-stream|mp4))/i.test(contentType)) throw new Error('not-video');
      const info = await FS.getInfoAsync(partial);
      if (!info.exists || info.isDirectory || info.size <= 0 || info.size > VIDEO_CACHE_MAX_BYTES) throw new Error('download-size');
      await FS.moveAsync({ from: partial, to: root + file });
      return { file, bytes: info.size };
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      await FS.deleteAsync(partial, { idempotent: true });
    }
  },
});
