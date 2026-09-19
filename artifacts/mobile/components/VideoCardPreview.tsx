import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { useIsFocused } from 'expo-router';
import { useLivePlayback } from '@/context/LivePlaybackContext';
import { videoCache } from '@/utils/videoCache';
import { type CacheLease, VIDEO_CACHE_TTL_MS } from '@/utils/videoCache/core';
import type { CachedVideoPlayerProps } from './CachedVideoPlayer';

const Player = Platform.OS !== 'web' && requireOptionalNativeModule('ExpoVideo')
  ? require('./CachedVideoPlayer').default as React.ComponentType<CachedVideoPlayerProps> : null;

// A fresh session mounts on each visible entry; finishing does not restart it.
function PreviewSession({ url, cacheKey }: { url: string; cacheKey?: string }) {
  const [lease, setLease] = useState<CacheLease | null>(null);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef(false);
  const finish = useCallback(() => setDone(true), []);
  const onFirstFrame = useCallback(() => {
    if (started.current) return;
    started.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(finish, 5_000);
  }, [finish]);
  useEffect(() => {
    if (done) return;
    let alive = true;
    let acquired: CacheLease | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    // Fall back to the poster if download/decoding never becomes ready.
    timer.current = setTimeout(finish, 30_000);
    void videoCache.acquire(cacheKey ?? url, url, controller.signal).then(result => {
      if (!alive) { void result.release().catch(() => {}); return; }
      acquired = result;
      setLease(result);
      expiry = setTimeout(finish, Math.max(0, result.createdAt + VIDEO_CACHE_TTL_MS - Date.now()));
    }).catch(() => { if (alive) finish(); });
    return () => {
      alive = false;
      controller.abort();
      if (timer.current) clearTimeout(timer.current);
      if (expiry) clearTimeout(expiry);
      if (acquired) void acquired.release().catch(() => {});
    };
  }, [url, cacheKey, done, finish]);
  if (done || !lease || !Player) return null;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Player uri={lease.uri} muted keepAwake={false} contentFit="cover" nativeControls={false}
      onFirstFrame={onFirstFrame} onError={finish} />
  </View>;
}

export function VideoCardPreview({ url, isVisible, cacheKey }: { url: string; isVisible: boolean; cacheKey?: string }) {
  const focused = useIsFocused();
  const { previewsBlocked } = useLivePlayback();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  return Player && isVisible && focused && foreground && !previewsBlocked ? <PreviewSession key={cacheKey ?? url} url={url} cacheKey={cacheKey} /> : null;
}
