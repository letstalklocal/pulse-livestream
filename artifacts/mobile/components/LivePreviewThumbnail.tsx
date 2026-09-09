import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useGenerateAgoraToken } from "@workspace/api-client-react";
import {
  createEngine,
  RtcSurfaceViewComponent,
  RtcTextureViewComponent,
  ClientRoleType,
  ChannelProfileType,
  VideoSourceType,
} from "@/utils/agora";
import { isBroadcasting } from "@/utils/agoraState";

const activePreviewCleanups = new Set<() => void>();

export function stopAllLivePreviews() {
  for (const cleanup of [...activePreviewCleanups]) cleanup();
}

interface Props {
  channelId: string;
  hostUid: number;
  isVisible?: boolean;
}

export function LivePreviewThumbnail({ channelId, hostUid, isVisible = false }: Props) {
  const [joined, setJoined] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const engineRef = useRef<any>(null);
  const eventHandlerRef = useRef<any>(null);
  const generateToken = useGenerateAgoraToken();
  const VideoView =
    Platform.OS === "android"
      ? RtcTextureViewComponent
      : RtcSurfaceViewComponent;
  const isNative = Platform.OS !== "web";

  useEffect(() => {
    if (!isNative || channelId.endsWith("-demo") || !isVisible || isBroadcasting()) {
      setJoined(false);
      setVideoReady(false);
      setRemoteUid(null);
      return;
    }

    let didUnmount = false;
    let cleanedUp = false;
    let previewStarted = false;
    let previewTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanupPreview = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      didUnmount = true;
      activePreviewCleanups.delete(cleanupPreview);
      if (previewTimer) clearTimeout(previewTimer);

      const engine = engineRef.current;
      const handler = eventHandlerRef.current;
      if (engine && handler) engine.unregisterEventHandler(handler);
      eventHandlerRef.current = null;
      engine?.leaveChannel?.();
      engine?.release?.();
      engineRef.current = null;
      setJoined(false);
      setVideoReady(false);
      setRemoteUid(null);
    };

    activePreviewCleanups.add(cleanupPreview);

    const markVideoReady = (uid: number) => {
      if (didUnmount) return;
      setRemoteUid(uid);
      setVideoReady(true);
      if (previewStarted) return;
      previewStarted = true;
      previewTimer = setTimeout(() => {
        if (didUnmount) return;
        setVideoReady(false);
        previewTimer = setTimeout(cleanupPreview, 100);
      }, 5_000);
    };

    const setup = async () => {
      try {
        const engine = createEngine();
        if (!engine || didUnmount) return;

        const appId = process.env["EXPO_PUBLIC_AGORA_APP_ID"] ?? "";
        if (!appId) throw new Error("Agora App ID is missing.");

        const initializeResult = engine.initialize({
          appId,
          channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
        });
        if (initializeResult < 0) {
          throw new Error(`Agora initialization failed (${initializeResult}).`);
        }

        const videoResult = engine.enableVideo();
        if (videoResult < 0) {
          throw new Error(`Agora video setup failed (${videoResult}).`);
        }

        const handler = {
          onError: (errorCode: number, message: string) => {
            console.warn(
              "[Agora preview] error:",
              errorCode,
              message,
              "channel:",
              channelId,
            );
          },
          onJoinChannelSuccess: () => {
            if (didUnmount) return;
            setJoined(true);
            setRemoteUid(hostUid);
          },
          onUserJoined: (_connection: unknown, uid: number) => {
            if (!didUnmount) setRemoteUid(uid);
          },
          onRemoteVideoStateChanged: (
            _connection: unknown,
            uid: number,
            state: number,
            reason: number,
          ) => {
            if (didUnmount) return;
            setRemoteUid(uid);
            if (state === 2) {
              markVideoReady(uid);
            } else if (state === 4) {
              setVideoReady(false);
              console.warn(
                "[Agora preview] remote video failed:",
                reason,
                "channel:",
                channelId,
              );
            }
          },
          onFirstRemoteVideoFrame: (_connection: unknown, uid: number) => {
            markVideoReady(uid);
          },
          onUserOffline: () => {
            if (didUnmount) return;
            setRemoteUid(null);
            setVideoReady(false);
          },
        };

        engine.registerEventHandler(handler);
        eventHandlerRef.current = handler;
        engineRef.current = engine;

        const tokenData = await generateToken.mutateAsync({
          data: { channelName: channelId, uid: 0, role: "audience" },
        });
        if (didUnmount) return;

        const joinResult = engine.joinChannel(tokenData.token, channelId, tokenData.uid, {
          clientRoleType: ClientRoleType.ClientRoleAudience,
          autoSubscribeVideo: true,
          autoSubscribeAudio: false,
        });
        if (joinResult < 0) {
          throw new Error(`Agora channel join failed (${joinResult}).`);
        }

        const unmuteResult = engine.muteAllRemoteVideoStreams(false);
        engine.muteAllRemoteAudioStreams(true);
        if (unmuteResult < 0) {
          throw new Error(`Agora remote video setup failed (${unmuteResult}).`);
        }
      } catch (error) {
        console.warn("[Agora preview] setup failed:", error, "channel:", channelId);
        if (!didUnmount) {
          setJoined(false);
          setVideoReady(false);
          setRemoteUid(null);
        }
      }
    };

    setup();

    return cleanupPreview;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, isVisible]);

  if (!isNative || !VideoView || !joined || remoteUid === null) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.preview, !videoReady && styles.previewWaiting]}
    >
      <VideoView
        canvas={{ uid: remoteUid, sourceType: VideoSourceType.VideoSourceRemote }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    ...StyleSheet.absoluteFill,
  },
  previewWaiting: {
    opacity: 0,
  },
});