import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { useGenerateAgoraToken } from "@workspace/api-client-react";
import {
  createEngine,
  RtcTextureViewComponent,
  ClientRoleType,
  ChannelProfileType,
  VideoSourceType,
} from "@/utils/agora";

interface Props {
  channelId: string;
  hostUid: number;
  isVisible?: boolean;
}

export function LivePreviewThumbnail({ channelId, hostUid, isVisible = false }: Props) {
  const [showLive, setShowLive] = useState(false);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const engineRef = useRef<any>(null);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generateToken = useGenerateAgoraToken();
  const VideoView = RtcTextureViewComponent;
  const isNative = Platform.OS !== "web";

  useEffect(() => {
    if (!isNative || channelId.endsWith("-demo") || !isVisible) {
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
      engineRef.current?.leaveChannel?.();
      engineRef.current?.release?.();
      engineRef.current = null;
      setShowLive(false);
      setRemoteUid(null);
      return;
    }

    let didUnmount = false;

    const profileTimer = setTimeout(async () => {
      if (didUnmount) return;

      try {
        const engine = createEngine();
        if (!engine || didUnmount) return;

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

        if (didUnmount) return;

        await engine.joinChannel(tokenData.token, channelId, 0, {
          clientRoleType: ClientRoleType.ClientRoleAudience,
          autoSubscribeVideo: true,
          autoSubscribeAudio: false,
        });

        engine.muteAllRemoteVideoStreams(false);
        engine.muteAllRemoteAudioStreams(true);

        if (!didUnmount) {
          setShowLive(true);
          setRemoteUid(hostUid);
        }

        liveTimerRef.current = setTimeout(() => {
          if (didUnmount) return;
          engineRef.current?.leaveChannel?.();
          engineRef.current?.release?.();
          engineRef.current = null;
          setShowLive(false);
          setRemoteUid(null);
        }, 3000);
      } catch {
        // Preview is best-effort
      }
    }, 4000);

    return () => {
      didUnmount = true;
      clearTimeout(profileTimer);
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
      engineRef.current?.leaveChannel?.();
      engineRef.current?.release?.();
      engineRef.current = null;
      setShowLive(false);
      setRemoteUid(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, isVisible]);

  if (!isNative || !VideoView || !showLive || remoteUid === null) return null;

  return (
    <VideoView
      canvas={{ uid: remoteUid, sourceType: VideoSourceType.VideoSourceRemote }}
      style={StyleSheet.absoluteFill}
    />
  );
}
