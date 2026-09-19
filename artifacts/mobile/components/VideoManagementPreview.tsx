import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import { useAppLanguage } from '@/i18n';
import { videoCache } from '@/utils/videoCache';
import { VIDEO_CACHE_TTL_MS, type CacheLease } from '@/utils/videoCache/core';
import type { CreatorVideo } from '@/utils/creatorVideos';
import type { CachedVideoPlayerProps } from './CachedVideoPlayer';
const Player = Platform.OS !== 'web' && requireOptionalNativeModule('ExpoVideo')
  ? require('./CachedVideoPlayer').default as React.ComponentType<CachedVideoPlayerProps> : null;

export function VideoManagementPreview({ video, onExpand, active = true }: { video: CreatorVideo; onExpand: () => void; active?: boolean }) {
  const { t } = useAppLanguage();
  const [started, setStarted] = useState(false), [paused, setPaused] = useState(false);
  const [lease, setLease] = useState<CacheLease | null>(null), [error, setError] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const release = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!active || !started || !foreground || !video.playbackUrl || !Player) return;
    let alive = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    void videoCache.acquire(`creator-video:${video.id}`, video.playbackUrl, controller.signal).then(value => {
      if (!alive) { void value.release().catch(() => {}); return; }
      release.current = value.release;
      setLease(value);
      timer = setTimeout(() => { setStarted(false); setLease(null); }, Math.max(0, value.createdAt + VIDEO_CACHE_TTL_MS - Date.now()));
    }).catch(() => { if (alive) { setError(true); setStarted(false); } });
    return () => {
      alive = false; controller.abort(); clearTimeout(timer); setLease(null);
      if (release.current) { void release.current().catch(() => {}); release.current = null; }
    };
  }, [active, started, foreground, video.id, video.playbackUrl]);
  const loading = started && !lease;
  return <View style={styles.stage}>
    {video.thumbnailUrl && <Image source={{ uri: video.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
    {active && foreground && lease && Player && !error && <View style={StyleSheet.absoluteFill}>
      <Player uri={lease.uri} paused={paused} contentFit="cover" nativeControls={false} onError={() => { setError(true); setStarted(false); }} />
    </View>}
    <TouchableOpacity style={styles.play} accessibilityRole="button" accessibilityLabel={t(started && !paused ? 'Pause' : 'Play')}
      disabled={!active || !Player || !video.playbackUrl || loading} onPress={() => {
        setError(false);
        if (!started) { setPaused(false); setStarted(true); }
        else setPaused(value => !value);
      }}>
      {loading ? <ActivityIndicator color="#FFF" /> : <Ionicons name={started && !paused ? 'pause' : 'play'} size={28} color="#FFF" />}
    </TouchableOpacity>
    <TouchableOpacity style={styles.expand} accessibilityLabel={t('Open full screen')} disabled={!active} onPress={onExpand}>
      <Ionicons name="expand-outline" size={20} color="#FFF" />
    </TouchableOpacity>
    {error && <Text style={styles.error}>{t('Video could not play. Try another MP4 link.')}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  stage: { width: 156, aspectRatio: 9 / 16, alignSelf: 'center', borderRadius: 16, overflow: 'hidden', backgroundColor: '#142B30', alignItems: 'center', justifyContent: 'center' },
  play: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  expand: { position: 'absolute', right: 4, top: 4, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  error: { position: 'absolute', bottom: 8, left: 6, right: 6, color: '#FFF', fontSize: 11, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
});
