import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import {
  createAgoraRtcEngine,
  RtcSurfaceView,
  MediaPlayerState,
  VideoSourceType,
  RenderModeType,
  type IMediaPlayer,
  type IMediaPlayerSourceObserver,
} from "react-native-agora";
import { isBroadcasting } from "@/utils/agoraState";
export default function MomentPlayer({ uri }: { uri: string }) {
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const playerRef = useRef<IMediaPlayer | null>(null);
  useEffect(() => {
    setError("");
    setReady(false);
    setPlayerId(null);
    if (isBroadcasting()) {
      setError("Finish your live before playing Moments.");
      return;
    }
    let engine: ReturnType<typeof createAgoraRtcEngine> | undefined;
    let player: IMediaPlayer | undefined;
    let observer: IMediaPlayerSourceObserver | undefined;
    let mounted = true;
    const timeout = setTimeout(() => {
      if (mounted)
        setError("The clip could not be opened. Close and try again.");
    }, 15000);
    try {
      engine = createAgoraRtcEngine();
      const result = engine.initialize({
        appId: process.env.EXPO_PUBLIC_AGORA_APP_ID ?? "",
      });
      if (result < 0)
        throw new Error(`Player initialization failed (${result})`);
      // A fresh RTC engine has video disabled by default, including player rendering.
      const videoResult = engine.enableVideo();
      if (videoResult < 0)
        throw new Error(
          `Video playback initialization failed (${videoResult})`,
        );
      engine.enableLocalVideo(false);
      engine.enableLocalAudio(false);
      player = engine.createMediaPlayer();
      const id = player?.getMediaPlayerId();
      if (id == null || id < 0)
        throw new Error("The video player is unavailable in this build.");
      playerRef.current = player;
      // Explicit registration is required: this SDK's addListener precheck
      // skips native registration when a new player's observer map is absent.
      observer = {
        onPlayerSourceStateChanged: (state, reason) => {
          if (!mounted) return;
          if (state === MediaPlayerState.PlayerStateOpenCompleted) {
            clearTimeout(timeout);
            const result = player?.play();
            if (result != null && result < 0) {
              setError(`Could not start playback (${result})`);
              return;
            }
            setError("");
            setReady(true);
          }
          if (state === MediaPlayerState.PlayerStateFailed) {
            clearTimeout(timeout);
            setError(`Playback failed (${reason})`);
          }
        },
      };
      const registered = player.registerPlayerSourceObserver(observer);
      if (registered < 0)
        throw new Error(
          `Could not initialize playback callbacks (${registered})`,
        );
      setPlayerId(id);
      const opened = player.open(uri.replace(/^file:\/\//, ""), 0);
      if (opened < 0) throw new Error(`Could not open clip (${opened})`);
    } catch (e) {
      clearTimeout(timeout);
      setError(e instanceof Error ? e.message : "Playback unavailable");
    }
    return () => {
      mounted = false;
      clearTimeout(timeout);
      playerRef.current = null;
      try {
        if (observer) player?.unregisterPlayerSourceObserver(observer);
        player?.stop();
        player?.removeAllListeners();
        if (player) engine?.destroyMediaPlayer(player);
        engine?.release();
      } catch {}
    };
  }, [uri]);
  return (
    <View
      style={{ flex: 1, backgroundColor: "#000", justifyContent: "center" }}
    >
      {error ? (
        <Text style={{ color: "white", textAlign: "center", padding: 24 }}>
          {error}
        </Text>
      ) : (
        <>
          {playerId !== null && (
            <RtcSurfaceView
              style={{ flex: 1 }}
              canvas={{
                uid: 0,
                sourceType: VideoSourceType.VideoSourceMediaPlayer,
                mediaPlayerId: playerId,
                renderMode: RenderModeType.RenderModeFit,
              }}
            />
          )}
          {!ready && (
            <ActivityIndicator
              style={{ position: "absolute", alignSelf: "center" }}
              color="white"
            />
          )}
          <TouchableOpacity
            accessibilityRole="button"
            disabled={!ready}
            onPress={() => {
              try {
                // Reopening also works after the player has fully stopped.
                setReady(false);
                const result = playerRef.current?.open(
                  uri.replace(/^file:\/\//, ""),
                  0,
                );
                if (result != null && result < 0)
                  setError(`Could not replay clip (${result})`);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Could not replay clip",
                );
              }
            }}
            style={{ padding: 18, alignItems: "center" }}
          >
            <Text style={{ color: "white" }}>Replay</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
