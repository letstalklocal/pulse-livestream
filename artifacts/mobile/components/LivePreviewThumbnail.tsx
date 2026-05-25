import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import { useGenerateAgoraToken } from "@workspace/api-client-react";
import {
  createEngine,
  RtcTextureViewComponent,
  ClientRoleType,
  ChannelProfileType,
  VideoSourceType,
} from "@/utils/agora";

const CLIP_DURATION = 3000; // ms of "clip" shown before loop cut
const FADE_OUT_MS   = 180;  // black flash out
const FADE_IN_MS    = 220;  // fade back in

interface Props {
  channelId: string;
  hostUid: number;
}

/**
 * Shows the live Agora feed inside a stream card with a looping
 * 3-second clip effect (quick black cut every 3 s so it feels like
 * a preview clip rather than a continuous live feed).
 *
 * Skipped entirely for demo channels and on web.
 */
export function LivePreviewThumbnail({ channelId, hostUid }: Props) {
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const engineRef = useRef<any>(null);
  const generateToken = useGenerateAgoraToken();
  const VideoView = RtcTextureViewComponent;
  const isNative = Platform.OS !== "web";

  // Opacity animation drives the clip-loop effect
  const opacity = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Start the looping clip animation once video is ready
  useEffect(() => {
    if (remoteUid === null) return;

    // Fade in first
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      // Then loop: hold → cut to black → fade in → repeat
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(CLIP_DURATION),
          Animated.timing(opacity, {
            toValue: 0,
            duration: FADE_OUT_MS,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: FADE_IN_MS,
            useNativeDriver: true,
          }),
        ])
      );
      loopRef.current = loop;
      loop.start();
    });

    return () => {
      loopRef.current?.stop();
      opacity.setValue(0);
    };
  }, [remoteUid, opacity]);

  // Join Agora channel
  useEffect(() => {
    if (!isNative || channelId.endsWith("-demo")) return;

    let didUnmount = false;

    const setup = async () => {
      try {
        const engine = createEngine();
        if (!engine) return;

        engine.initialize({
          appId: process.env["EXPO_PUBLIC_AGORA_APP_ID"] ?? "",
          channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
        });
        engine.enableVideo();

        engine.registerEventHandler({
          onUserPublished: (_conn: any, uid: number, mediaType: number) => {
            if (!didUnmount && mediaType !== 0) setRemoteUid(uid);
          },
          onUserOffline: () => {
            if (!didUnmount) setRemoteUid(null);
          },
        });

        engineRef.current = engine;

        const tokenData = await generateToken.mutateAsync({
          data: { channelName: channelId, uid: 0, role: "audience" },
        });

        await engine.joinChannel(tokenData.token, channelId, 0, {
          clientRoleType: ClientRoleType.ClientRoleAudience,
          autoSubscribeVideo: true,
          autoSubscribeAudio: false,
        });

        engine.muteAllRemoteVideoStreams(false);
        engine.muteAllRemoteAudioStreams(true);

        if (!didUnmount) setRemoteUid(hostUid);
      } catch {
        // Preview is best-effort — fail silently
      }
    };

    setup();

    return () => {
      didUnmount = true;
      engineRef.current?.leaveChannel?.();
      engineRef.current?.release?.();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  if (!isNative || !VideoView || remoteUid === null) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
      {/* Black background shows during the cut frame */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]} />
      <VideoView
        canvas={{ uid: remoteUid, sourceType: VideoSourceType.VideoSourceRemote }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}
