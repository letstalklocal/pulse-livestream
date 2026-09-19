import { Alert } from 'react-native';
import { videoRequest, type VideoLibrary } from './creatorVideos';

export async function confirmVideoBeforeLive(
  getToken: () => Promise<string | null>,
  t: (text: string) => string,
  signal: AbortSignal,
  timeoutMs = 12_000,
): Promise<boolean> {
  if (signal.aborted) return false;
  const request = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  const stopped = new Promise<never>((_, reject) => {
    cancel = () => { request.abort(); reject(new Error('Video check cancelled.')); };
    signal.addEventListener('abort', cancel, { once: true });
    timeout = setTimeout(() => {
      request.abort();
      reject(new Error('Video service unavailable. Try again.'));
    }, timeoutMs);
  });
  let library: VideoLibrary;
  try {
    library = await Promise.race([
      videoRequest<VideoLibrary>('/library', getToken, 'GET', undefined, request.signal),
      stopped,
    ]);
  } catch (error) {
    if (signal.aborted) return false;
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
  if (signal.aborted) return false;
  if (!library.enabled || !library.selectedId) return true;
  // This only informs/asks. The existing stream-create transaction disables
  // the video, so canceling or leaving setup never changes its visibility.
  return new Promise(resolve => {
    let settled = false;
    const finish = (confirmed: boolean) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      resolve(confirmed && !signal.aborted);
    };
    const onAbort = () => finish(false);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) { finish(false); return; }
    Alert.alert(
      t('Go Live'),
      t('Your active video will be turned off when you start broadcasting.'),
      [
        { text: t('Cancel'), style: 'cancel', onPress: () => finish(false) },
        { text: t('Continue'), onPress: () => finish(true) },
      ],
      { cancelable: true, onDismiss: () => finish(false) },
    );
  });
}
