import type { CreatorVideo, VideoLibrary } from './creatorVideos';

// One monitor per signed-in app session. Existing finished history is a baseline,
// while pending/new uploads notify once when a refresh or another screen finishes them.
export function createVideoProcessingMonitor(
  request: <T>(path: string, method: string, signal: AbortSignal) => Promise<T>,
  onFinished: (video: CreatorVideo) => void,
) {
  const known = new Set<string>();
  const pending = new Set<string>();
  const notified = new Set<string>();
  let initialized = false;
  let polling = false;
  return async (signal: AbortSignal) => {
    if (polling || signal.aborted) return;
    polling = true;
    try {
      const library = await request<VideoLibrary>('/library', 'GET', signal);
      if (signal.aborted) return;
      for (const video of library.videos) {
        if (!initialized) known.add(video.id);
        if (!notified.has(video.id) && (video.status === 'processing' || video.status === 'uploading')) pending.add(video.id);
      }
      initialized = true;
      const present = new Set(library.videos.map(video => video.id));
      for (const id of pending) if (!present.has(id)) pending.delete(id);
      for (const video of library.videos) {
        let updated = video;
        if (pending.has(video.id) && (video.status === 'processing' || video.status === 'uploading')) {
          try { updated = await request<CreatorVideo>(`/${video.id}/refresh`, 'POST', signal); }
          catch { if (signal.aborted) return; else continue; }
        }
        if (signal.aborted) return;
        if (!notified.has(video.id) && (updated.status === 'ready' || updated.status === 'failed') && (pending.has(video.id) || !known.has(video.id))) {
          pending.delete(video.id);
          known.add(video.id);
          notified.add(video.id);
          onFinished(updated);
        } else known.add(video.id);
      }
    } finally { polling = false; }
  };
}
