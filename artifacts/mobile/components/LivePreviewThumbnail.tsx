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
}

/**
 * Joins an Agora channel as a silent audience member and renders
 * the host's video feed. Audio is always muted. On web or for
 * demo channels (no real Agora stream) it renders nothing so the
 * parent's gradient shows through.
 */
export function LivePreviewThumbnail({ channelId, hostUid }: Props) {
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const engineRef = useRef<any>(null);
  const generateToken = useGenerateAgoraToken();
  const VideoView = RtcTextureViewComponent;
  const isNative = Platform.OS !== "web";

  useEffect(() => {
    // Only run on native with a real (non-demo) channel
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
            if (!didUnmount && mediaType !== 0) {
              setRemoteUid(uid);
            }
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

        // Pre-set from known hostUid so video renders without waiting
        // for onUserPublished (same race-condition fix as the viewer screen)
        if (!didUnmount) setRemoteUid(hostUid);
      } catch {
        // Silent — preview is best-effort
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
    <VideoView
      canvas={{ uid: remoteUid, sourceType: VideoSourceType.VideoSourceRemote }}
      style={StyleSheet.absoluteFill}
    />
  );
}
