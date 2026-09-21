import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useStreamKeepAwake } from '@/hooks/useStreamKeepAwake';

function Awake() { useStreamKeepAwake(); return null; }
/** Mounted for focused, foreground playback; independent of the Agora live session. */
export interface CachedVideoPlayerProps {
  uri: string;
  onError: () => void;
  contentFit?: 'contain' | 'cover';
  nativeControls?: boolean;
  muted?: boolean;
  paused?: boolean;
  keepAwake?: boolean;
  onFirstFrame?: () => void;
  onPlayingChange?: (playing: boolean) => void;
}
export default function CachedVideoPlayer(props: CachedVideoPlayerProps) {
  // A source change replaces the whole view/player session, never just a handle
  // still attached to the old native view. Keyboard and callback changes keep it.
  return <PlaybackSession key={props.uri} {...props} />;
}
function PlaybackSession({ uri, onError, contentFit = 'contain', nativeControls = true,
  muted = false, paused = false, keepAwake = true, onFirstFrame, onPlayingChange }: CachedVideoPlayerProps) {
  const callbacks = useRef({ onError, onPlayingChange });
  useLayoutEffect(() => { callbacks.current = { onError, onPlayingChange }; }, [onError, onPlayingChange]);
  const [playing, setPlaying] = useState(false);
  const loaded = useRef(false), pausedRef = useRef(paused);
  const player = useVideoPlayer(null, instance => {
    instance.loop = true;
    instance.muted = muted;
    instance.staysActiveInBackground = false;
    instance.showNowPlayingNotification = false;
    instance.keepScreenOnWhilePlaying = false;
    instance.audioMixingMode = 'mixWithOthers';
  });
  useEffect(() => { player.muted = muted; }, [player, muted]);
  useLayoutEffect(() => {
    pausedRef.current = paused;
    if (paused) player.pause();
    else if (loaded.current) player.play();
  }, [paused, player]);
  useLayoutEffect(() => {
    let alive = true;
    const status = player.addListener('statusChange', event => {
      if (alive && event.status === 'error') callbacks.current.onError();
    });
    const playback = player.addListener('playingChange', event => {
      if (alive) { setPlaying(event.isPlaying); callbacks.current.onPlayingChange?.(event.isPlaying); }
    });
    void player.replaceAsync({ uri, useCaching: false }).then(() => {
      if (alive) { loaded.current = true; if (!pausedRef.current) player.play(); }
    }).catch(() => { if (alive) callbacks.current.onError(); });
    return () => {
      alive = false;
      loaded.current = false;
      status.remove();
      playback.remove();
      // Stop audio in layout cleanup, before Expo releases the native player in
      // passive cleanup. Expo alone owns release; no released handle in state.
      player.pause();
    };
  }, [player, uri]);
  return <View style={styles.container}>
    {keepAwake && playing && <Awake />}
    <VideoView player={player} style={styles.container} nativeControls={nativeControls}
      onFirstFrameRender={onFirstFrame} fullscreenOptions={{ enable: false }} allowsPictureInPicture={false} contentFit={contentFit} surfaceType="textureView" />
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#000' } });
