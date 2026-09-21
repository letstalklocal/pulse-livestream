import { File, FileMode } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';

export interface MediaUploadSession { uploadUrl: string; objectPath: string; completed?: boolean }
const CHUNK = 1024 * 1024; // Multiple of Cloud Storage's 256 KiB chunk alignment.

/** Session URLs are private upload capabilities: never log or persist them in analytics. */
export async function uploadPrivateMedia(
  uri: string, contentType: string, session: MediaUploadSession,
  signal: AbortSignal, progress: (percent: number) => void,
) {
  const url = new URL(session.uploadUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'storage.googleapis.com')
    throw new Error('Upload failed. Please try again.');
  const file = new File(uri), size = file.size;
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error('Could not read the selected video. Try again.');
  const cancelled = () => { if (signal.aborted) throw new Error('Upload cancelled.'); };
  cancelled();
  if (session.completed) { progress(100); return; }
  const request = async (range: string, body?: Uint8Array<ArrayBuffer>) => {
    cancelled();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort);
    const timer = setTimeout(abort, 45000);
    try {
      return await expoFetch(session.uploadUrl, {
        method: 'PUT', signal: controller.signal,
        headers: { 'Content-Type': contentType, 'Content-Range': range },
        body: body ?? new Uint8Array(0),
      });
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  };
  const offsetFrom = (response: Awaited<ReturnType<typeof request>>) => {
    if (response.status === 200 || response.status === 201) { session.completed = true; return size; }
    if (response.status !== 308) throw new Error('Upload failed. Please try again.');
    const range = response.headers.get('range');
    if (!range) return 0;
    const match = /^bytes=0-(\d+)$/.exec(range);
    const offset = match ? Number(match[1]) + 1 : NaN;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= size)
      throw new Error('Upload failed. Please try again.');
    return offset;
  };
  let offset = 0, failures = 0, query = true;
  while (!session.completed) {
    cancelled();
    try {
      if (query) {
        offset = offsetFrom(await request(`bytes */${size}`));
        query = false;
        progress(Math.floor(offset / size * 100));
        if (session.completed) break;
      }
      const end = Math.min(size, offset + CHUNK);
      const handle = file.open(FileMode.ReadOnly);
      let bytes: Uint8Array<ArrayBuffer>;
      try { handle.offset = offset; bytes = handle.readBytes(end - offset); }
      finally { handle.close(); }
      if (bytes.byteLength !== end - offset) throw new Error('Upload failed. Please try again.');
      const next = offsetFrom(await request(`bytes ${offset}-${end - 1}/${size}`, bytes));
      cancelled();
      if (next <= offset || next > end) throw new Error('Upload failed. Please try again.');
      offset = next;
      progress(Math.floor(offset / size * 100));
      failures = 0;
    } catch {
      cancelled();
      if (++failures > 3) throw new Error('Upload failed. Please try again.');
      query = true;
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new Error('Upload cancelled.')); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, failures * 1000);
        signal.addEventListener('abort', abort, { once: true });
      });
    }
  }
}
