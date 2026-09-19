import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { VIDEO_PROTOTYPE_ENABLED } from '@/utils/videoPrototype';
import { videoCache } from '@/utils/videoCache';

export function VideoCacheMaintenance() {
  useEffect(() => {
    if (!VIDEO_PROTOTYPE_ENABLED || Platform.OS === 'web') return;
    const clean = () => {
      if (AppState.currentState === 'active') void videoCache.snapshot().catch(() => {});
    };
    clean();
    const subscription = AppState.addEventListener('change', clean);
    const timer = setInterval(clean, 60_000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, []);
  return null;
}
