import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getListStreamsQueryKey,
  getGetStreamChatQueryKey,
  useCreateStream,
  useEndStream,
  useGenerateAgoraToken,
  useGetStream,
  useGetStreamChat,
  useHeartbeatStream,
  useSendChatMessage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  ChannelProfileType,
  ClientRoleType,
  RenderModeType,
  RtcSurfaceViewComponent,
  VideoSourceType,
  createEngine,
} from "@/utils/agora";
import { setIsBroadcasting } from "@/utils/agoraState";
import { GiftFloater, type FloatingGift } from "@/components/GiftFloater";
import { GIFTS } from "@/components/GiftPicker";
import { GiftLeaderboard } from "@/components/GiftLeaderboard";

const isNative = Platform.OS === "ios" || Platform.OS === "android";
const CAMERA_DIAGNOSTIC_REVISION = "CAM57-R3";

const CATEGORIES = ["Gaming", "Music", "Talk", "Art", "Dance", "Other"];
const CATEGORY_COLORS: Record<string, string> = {
  Gaming: "#7B4FFF",
  Music: "#FF1966",
  Talk: "#00C896",
  Art: "#FF8C00",
  Dance: "#FF1966",
  Other: "#4FC3F7",
};

function DemoCamera({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.7, duration: 1800, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  return (
    <View style={[styles.demoCamera, { backgroundColor: color + "22" }]}>
      <Animated.View style={[styles.demoCameraInner, { backgroundColor: color + "44", opacity: pulse }]} />
      <View style={styles.demoCameraIcon}>
        <Ionicons name="videocam" size={48} color={color} />
        <Text style={[styles.demoCameraLabel, { color }]}>Live Preview</Text>
        <Text style={styles.demoCameraNote}>Camera requires native build</Text>
      </View>
    </View>
  );
}

type MediaPermissionResult = {
  granted: boolean;
  canAskAgain: boolean;
};

async function requestPermissions(): Promise<MediaPermissionResult> {
  if (Platform.OS !== "android") return { granted: true, canAskAgain: true };
  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
    const cameraStatus = granted[PermissionsAndroid.PERMISSIONS.CAMERA];
    const microphoneStatus = granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    return {
      granted:
        cameraStatus === PermissionsAndroid.RESULTS.GRANTED &&
        microphoneStatus === PermissionsAndroid.RESULTS.GRANTED,
      canAskAgain:
        cameraStatus !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN &&
        microphoneStatus !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
    };
  } catch {
    return { granted: false, canAskAgain: true };
  }
}

export default function GoLiveScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isSignedIn } = useAuth();

  const [title, setTitle] = useState("");
  const nativeBuildNumber =
    Platform.OS === "android" ? Constants.platform?.android?.versionCode : null;
  const visibleBuildId = `${Constants.expoConfig?.version ?? "unknown"} (${nativeBuildNumber ?? "dev"}) · ${CAMERA_DIAGNOSTIC_REVISION}`;
  const [category, setCategory] = useState("Gaming");
  const [isLive, setIsLive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatText, setChatText] = useState("");
  const chatInputRef = useRef<TextInput>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(!isNative);
  const [cameraViewReady, setCameraViewReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraDiagnostic, setCameraDiagnostic] = useState(
    isNative ? "Waiting for camera setup" : "Web demo mode",
  );
  const [permissionCanAskAgain, setPermissionCanAskAgain] = useState(true);
  const [permissionRetryCount, setPermissionRetryCount] = useState(0);
  const [duration, setDuration] = useState(0);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; senderName: string; text: string; color: string; ts: number }>>([]);
  const chatListRef = useRef<FlatList>(null);

  const channelIdRef = useRef("");
  const isLiveRef = useRef(false);
  const engineRef = useRef<any>(null);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Holds token+channelId until the live RtcSurfaceView is mounted
  const pendingJoinRef = useRef<{ token: string; channelId: string } | null>(null);

  const queryClient = useQueryClient();
  const generateToken = useGenerateAgoraToken();
  const createStream = useCreateStream();
  const endStream = useEndStream();
  const heartbeat = useHeartbeatStream();
  const sendChatMutation = useSendChatMessage();

  // If not signed in, show gate screen — hooks must be called unconditionally so this goes after them
  // Poll viewer count while live
  const { data: liveStreamData } = useGetStream(channelIdRef.current, {
    query: { enabled: isLive && !!channelIdRef.current, refetchInterval: 5000 } as any,
  });
  const viewerCount = liveStreamData?.stream?.viewerCount ?? 0;

  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // WebSocket push — server sends earnings + gift events in real time
  const [streamCoins, setStreamCoins] = useState(0);
  const [floatingGifts, setFloatingGifts] = useState<FloatingGift[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const channelId = channelIdRef.current;
    if (!isLive || !channelId) return;

    const domain = process.env["EXPO_PUBLIC_DOMAIN"];
    if (!domain) return;

    const ws = new WebSocket(`wss://${domain}/api/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", channelId }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          type?: string;
          coins?: number;
          giftName?: string;
          senderName?: string;
        };
        if (msg.type === "earnings" && typeof msg.coins === "number") {
          setStreamCoins(msg.coins);
        }
        if (msg.type === "gift" && msg.giftName) {
          const gift = GIFTS.find((g) => g.name === msg.giftName) ?? GIFTS[0]!;
          const x = 60 + Math.random() * 200;
          setFloatingGifts((prev) => [
            ...prev,
            { id: `${Date.now()}-${Math.random()}`, emoji: gift.emoji, name: gift.name, senderName: msg.senderName ?? "Viewer", x, size: gift.size },
          ]);
        }
      } catch {
        // ignore
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [isLive]);

  // Poll chat messages while live (broadcaster sees viewer messages too)
  const { data: chatPollData } = useGetStreamChat(channelIdRef.current, undefined, {
    query: { enabled: isLive && !!channelIdRef.current, refetchInterval: 3000 } as any,
  });

  useEffect(() => {
    if (!chatPollData?.messages) return;
    setChatMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const next = chatPollData.messages.filter((m) => !existingIds.has(m.id));
      if (next.length === 0) return prev;
      const updated = [...prev, ...next].slice(-100);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 60);
      return updated;
    });
  }, [chatPollData]);

  // Request permissions and initialise Agora engine on mount
  useEffect(() => {
    if (!isNative) return;
    let mounted = true;
    let cameraTimeout: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      setCameraReady(false);
      setCameraViewReady(false);
      setCameraError(null);
      setCameraDiagnostic("Requesting camera and microphone permissions");
      const permission = await requestPermissions();
      if (!mounted) return;
      setPermissionCanAskAgain(permission.canAskAgain);
      if (!permission.granted) {
        console.warn("[Agora] Permissions denied");
        setCameraDiagnostic(
          permission.canAskAgain ? "Permissions denied" : "Permissions blocked in Android settings",
        );
        setCameraError(
          permission.canAskAgain
            ? "Camera and microphone access are required before you can go live."
            : "Camera and microphone access are blocked. Open Android settings to allow them.",
        );
        return;
      }
      try {
        setCameraDiagnostic("Initializing Agora camera");
        const engine = createEngine();
        if (!engine) {
          setCameraError("This development build does not include the Agora camera module.");
          return;
        }
        const appId = process.env["EXPO_PUBLIC_AGORA_APP_ID"] ?? "";
        if (!appId) throw new Error("Agora App ID is missing");
        const initializeResult = engine.initialize({
          appId,
          channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
        });
        console.log("[Agora] initialize result:", initializeResult);
        if (initializeResult < 0) throw new Error(`Agora initialization failed (${initializeResult})`);
        engineRef.current = engine;
        engine.registerEventHandler({
          onError: (err: number, msg: string) => {
            console.warn("[Agora] onError:", err, msg);
            mounted && setCameraReady(false);
            mounted && setCameraViewReady(false);
            mounted && setCameraDiagnostic(`Agora error ${err}: ${msg || "unknown"}`);
            mounted && setCameraError(`Live video error ${err}: ${msg || "Unknown Agora error"}`);
          },
          onJoinChannelSuccess: (connection: any, elapsed: number) => {
            console.log("[Agora] joined channel:", connection?.channelId, "elapsed:", elapsed);
            mounted && setCameraDiagnostic(`Live channel joined in ${elapsed} ms`);
            mounted && setCameraError(null);
          },
          onConnectionStateChanged: (connection: any, state: number, reason: number) => {
            console.log(
              "[Agora] connectionState channel:",
              connection?.channelId,
              "state:",
              state,
              "reason:",
              reason,
            );
            if (mounted && state === 5) {
              setCameraDiagnostic(`Connection failed: state ${state}, reason ${reason}`);
              setCameraError(`Could not connect the live stream (reason ${reason}).`);
            }
          },
          onPermissionError: (permissionType: number) => {
            console.warn("[Agora] permission error:", permissionType);
            if (mounted) {
              setCameraReady(false);
              setCameraViewReady(false);
              setCameraDiagnostic(`Permission error type ${permissionType}`);
              setCameraError(
                permissionType === 1
                  ? "Camera access is required before you can go live."
                  : "Microphone access is required before you can go live.",
              );
            }
          },
          onLocalVideoStateChanged: (source: any, state: number, reason: number) => {
            console.log("[Agora] localVideoState source:", source, "state:", state, "reason:", reason);
            if (!mounted || source !== VideoSourceType.VideoSourceCamera) return;
            setCameraDiagnostic(`Camera state ${state}, reason ${reason}`);
            if (state === 1 || state === 2) {
              if (cameraTimeout) clearTimeout(cameraTimeout);
              setCameraReady(true);
              setCameraDiagnostic(state === 2 ? "Camera frames are encoding" : "Camera is capturing");
              setCameraError(null);
            } else if (state === 3) {
              if (cameraTimeout) clearTimeout(cameraTimeout);
              setCameraReady(false);
              setCameraViewReady(false);
              setCameraError(`The camera could not start (reason ${reason}).`);
            }
          },
        });
        cameraTimeout = setTimeout(() => {
          if (!mounted) return;
          console.warn("[Agora] camera preview timed out");
          setCameraReady(false);
          setCameraDiagnostic("No camera detected after 10 seconds");
          setCameraError("The camera did not start. Check permissions and try again.");
        }, 10000);
        engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
        const previewResult = engine.startPreview();
        const videoResult = engine.enableVideo();
        const audioResult = engine.enableAudio();
        console.log(
          "[Agora] setup results preview:",
          previewResult,
          "video:",
          videoResult,
          "audio:",
          audioResult,
        );
        setCameraDiagnostic(
          `Setup accepted: preview ${previewResult}, video ${videoResult}, audio ${audioResult}`,
        );
        if (videoResult < 0 || audioResult < 0 || previewResult < 0) {
          throw new Error(`Agora camera setup failed (${videoResult}, ${audioResult}, ${previewResult})`);
        }
        if (mounted) setCameraViewReady(true);
      } catch (e) {
        console.warn("[Agora] init error:", e);
        if (mounted) {
          setCameraReady(false);
          setCameraViewReady(false);
          setCameraDiagnostic(e instanceof Error ? e.message : "Camera initialization failed");
          setCameraError(e instanceof Error ? e.message : "The camera could not be started.");
        }
      }
    })();

    return () => {
      mounted = false;
      if (cameraTimeout) clearTimeout(cameraTimeout);
      engineRef.current?.stopPreview?.();
    };
  }, [permissionRetryCount]);

  // After the live screen mounts its RtcTextureView, join the channel
  useEffect(() => {
    if (!isLive || !isNative || !engineRef.current || !pendingJoinRef.current) return;
    const { token, channelId } = pendingJoinRef.current;
    pendingJoinRef.current = null;

    // Give the texture view one frame to attach before joining
    const t = setTimeout(() => {
      try {
        const joinResult = engineRef.current.joinChannel(token, channelId, user!.uid, {
          clientRoleType: ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          publishCameraTrack: true,
        });
        console.log("[Agora] joinChannel result:", joinResult, "channel:", channelId);
        if (joinResult < 0) {
          setCameraError(`Could not start the live stream (${joinResult}).`);
        }
      } catch (e) {
        console.warn("[Agora] joinChannel error:", e);
        setCameraError(e instanceof Error ? e.message : "Could not start the live stream.");
      }
    }, 300);

    return () => clearTimeout(t);
  }, [isLive, user?.uid]);

  const startLive = useCallback(async () => {
    if (!title.trim()) return;
    if (isNative && (!cameraReady || !engineRef.current)) {
      setCameraError("Wait for the camera preview before going live.");
      return;
    }
    setIsStarting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const channelId = `pulse-${user!.uid}-${Date.now()}`;
    channelIdRef.current = channelId;

    try {
      const tokenData = await generateToken.mutateAsync({
        data: { channelName: channelId, uid: user!.uid, role: "broadcaster" },
      });

      await createStream.mutateAsync({
        data: {
          channelId,
          hostUid: user!.uid,
          hostName: user!.name,
          hostAvatarUrl: user!.avatarUri ?? null,
          title: title.trim(),
          category,
        },
      });

      if (isNative && engineRef.current) {
        pendingJoinRef.current = { token: tokenData.token, channelId };
      }

      isLiveRef.current = true;
      setIsBroadcasting(true);
      setIsLive(true);
      setIsStarting(false);
      durationRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.warn("[Agora] start live error:", e);
      setCameraError(e instanceof Error ? e.message : "Could not start the live stream.");
      setIsStarting(false);
    }
  }, [title, category, user, generateToken, createStream, cameraReady]);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    engineRef.current?.muteLocalAudioStream?.(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isMuted]);

  const stopLive = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    if (durationRef.current) clearInterval(durationRef.current);
    // Mark not-live before async ops so the unmount cleanup doesn't double-delete
    isLiveRef.current = false;
    setIsBroadcasting(false);
    try {
      engineRef.current?.leaveChannel?.();
      await endStream.mutateAsync({ channelId: channelIdRef.current });
      await queryClient.invalidateQueries({ queryKey: getListStreamsQueryKey() });
    } catch (_e) {
      // best effort — still invalidate so stale data is cleared
      void queryClient.invalidateQueries({ queryKey: getListStreamsQueryKey() });
    }
    router.back();
  }, [endStream, queryClient, router]);

  // Safety net: if the screen unmounts while live (e.g. Android back gesture),
  // delete the stream so it doesn't linger on the Discover page.
  useEffect(() => {
    return () => {
      if (isLiveRef.current && channelIdRef.current) {
        void endStream.mutateAsync({ channelId: channelIdRef.current }).finally(() => {
          void queryClient.invalidateQueries({ queryKey: getListStreamsQueryKey() });
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep a stable ref to heartbeat.mutate so the interval below never needs to
  // reset when the mutation object gets a new reference after each settled call.
  const heartbeatMutateRef = useRef(heartbeat.mutate);
  useEffect(() => { heartbeatMutateRef.current = heartbeat.mutate; });

  // Send a heartbeat every 20 s while live (TTL is 60 s, so 3 chances before expiry).
  // Depends only on isLive — not on the mutation object — so the interval is stable.
  useEffect(() => {
    if (!isLive || !channelIdRef.current) return;
    heartbeatMutateRef.current({ channelId: channelIdRef.current });
    const id = setInterval(() => {
      heartbeatMutateRef.current({ channelId: channelIdRef.current });
    }, 20_000);
    return () => clearInterval(id);
  }, [isLive]);

  const formatDuration = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const catColor = CATEGORY_COLORS[category] ?? colors.primary;

  // Auth gate — must live after all hooks
  if (!isSignedIn || !user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <TouchableOpacity
          style={[styles.backBtnAlt, { top: insets.top + 10 }]}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Ionicons name="radio-outline" size={52} color={colors.primary} />
        <Text style={[styles.gateTitle, { color: colors.foreground }]}>Sign in to go live</Text>
        <Text style={[styles.gateSub, { color: colors.mutedForeground }]}>Create an account to start streaming to your audience</Text>
        <TouchableOpacity
          style={[styles.gateBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/(auth)/sign-in" as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.gateBtnText}>Sign in</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/(auth)/sign-up" as any)} style={{ marginTop: 12 }}>
          <Text style={[styles.gateLink, { color: colors.mutedForeground }]}>
            No account? <Text style={{ color: colors.primary }}>Sign up</Text>
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const VideoView = RtcSurfaceViewComponent;
  const showNativeVideo = isNative && VideoView;

  // ── LIVE screen ──────────────────────────────────────────────────────────
  if (isLive) {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        {showNativeVideo && VideoView ? (
          <VideoView
            canvas={{ uid: 0, sourceType: VideoSourceType.VideoSourceCamera }}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <DemoCamera color={catColor} />
        )}
        {cameraError ? (
          <View style={[styles.liveErrorBanner, { top: topPad + 66 }]}>
            <Ionicons name="warning" size={16} color="#FFF" />
            <Text style={styles.liveErrorText}>{cameraError}</Text>
          </View>
        ) : null}

        <KeyboardAvoidingView
          style={styles.liveOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={{ paddingTop: topPad + 12, paddingHorizontal: 16 }}>
            <View style={styles.liveTopBar}>
              <View style={styles.liveBadgeRow}>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
                <Text style={styles.liveDuration}>{formatDuration(duration)}</Text>
              </View>
              <View style={styles.liveTopRight}>
                {!isNative && (
                  <View style={styles.demoBadge}>
                    <Text style={styles.demoBadgeText}>DEMO</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.viewerPill}
                  onPress={() => setShowLeaderboard(true)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.viewerPillText}>🪙 {streamCoins.toLocaleString()}</Text>
                </TouchableOpacity>
                <View style={styles.viewerPill}>
                  <Ionicons name="eye" size={13} color="#FFF" />
                  <Text style={styles.viewerPillText}>{viewerCount}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Chat messages overlay */}
          <View style={styles.liveChatArea} pointerEvents="box-none">
            <FlatList
              ref={chatListRef}
              data={chatMessages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.liveChatBubble}>
                  <Text style={[styles.liveChatSender, { color: item.color }]}>{item.senderName}: </Text>
                  <Text style={styles.liveChatText}>{item.text}</Text>
                </View>
              )}
              contentContainerStyle={styles.liveChatList}
              style={styles.liveChatScroll}
              showsVerticalScrollIndicator={false}
            />
          </View>

          <View style={[styles.liveBottom, { paddingBottom: bottomPad + 12, paddingHorizontal: 16 }]}>
            {showChat && (
              <View style={styles.chatInputRow}>
                <TextInput
                  ref={chatInputRef}
                  style={styles.chatInput}
                  value={chatText}
                  onChangeText={setChatText}
                  placeholder="Say something..."
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  returnKeyType="send"
                  onSubmitEditing={() => {
                    const text = chatText.trim();
                    setChatText("");
                    setShowChat(false);
                    if (text) {
                      sendChatMutation.mutateAsync({
                        channelId: channelIdRef.current,
                        data: { senderName: user!.name, text, color: "#FF1966" },
                      }).then(() => {
                        void queryClient.invalidateQueries({
                          queryKey: getGetStreamChatQueryKey(channelIdRef.current),
                        });
                      }).catch(() => {});
                    }
                  }}
                  onBlur={() => setShowChat(false)}
                  autoFocus
                />
              </View>
            )}
            <View style={styles.liveBottomBar}>
              <TouchableOpacity
                style={styles.liveIconBtn}
                onPress={() => {
                  setShowChat(true);
                  setTimeout(() => chatInputRef.current?.focus(), 50);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="chatbubble-ellipses" size={26} color="#FFF" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.endLiveIconBtn} onPress={stopLive} activeOpacity={0.85}>
                <Ionicons name="stop-circle" size={32} color="#FFF" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.liveIconBtn} onPress={toggleMute} activeOpacity={0.7}>
                <Ionicons name={isMuted ? "mic-off" : "mic"} size={26} color={isMuted ? "#FF4444" : "#FFF"} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>

        <GiftLeaderboard
          channelId={channelIdRef.current}
          visible={showLeaderboard}
          onClose={() => setShowLeaderboard(false)}
        />

        {/* Floating gift animations — rendered above everything */}
        {floatingGifts.map((fg) => (
          <GiftFloater
            key={fg.id}
            gift={fg}
            onDone={(id) => setFloatingGifts((prev) => prev.filter((g) => g.id !== id))}
          />
        ))}
      </View>
    );
  }

  // ── SETUP screen ─────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TouchableOpacity
        style={[styles.closeBtn, { top: topPad + 12 }]}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Ionicons name="close" size={20} color={colors.foreground} />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={[
          styles.setupContent,
          { paddingTop: topPad + 60, paddingBottom: bottomPad + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.buildIdentifier}>
          <Text style={styles.buildIdentifierLabel}>BUILD ID</Text>
          <Text style={styles.buildIdentifierValue}>{visibleBuildId}</Text>
        </View>

        <View style={styles.inputSection}>
          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Stream title</Text>
          <TextInput
            style={[
              styles.titleInput,
              {
                color: colors.foreground,
                borderColor: title ? catColor : colors.border,
                backgroundColor: colors.card,
              },
            ]}
            value={title}
            onChangeText={setTitle}
            placeholder="What are you streaming today?"
            placeholderTextColor={colors.mutedForeground}
            maxLength={80}
            returnKeyType="done"
            autoFocus
          />
        </View>

        <View style={[styles.cameraPreview, { backgroundColor: catColor + "22", borderColor: catColor + "55" }]}>
          {isNative && cameraViewReady && VideoView ? (
            <VideoView
              canvas={{ uid: 0, sourceType: VideoSourceType.VideoSourceCamera }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          {isNative && !cameraReady ? (
            <View style={styles.cameraPreviewStatus}>
              {!cameraError ? (
                <ActivityIndicator color={catColor} />
              ) : (
                <Ionicons name="videocam-off" size={40} color={catColor} />
              )}
              <Text style={[styles.cameraPreviewText, { color: colors.mutedForeground }]}>
                {cameraError ?? "Preparing camera…"}
              </Text>
              {cameraError ? (
                <TouchableOpacity
                  style={[styles.cameraRetryBtn, { backgroundColor: catColor }]}
                  onPress={() => {
                    if (!permissionCanAskAgain) {
                      void Linking.openSettings().catch(() => {
                        setCameraError("Open Android settings and allow camera and microphone access.");
                      });
                      return;
                    }
                    setPermissionRetryCount((count) => count + 1);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cameraRetryText}>
                    {permissionCanAskAgain ? "Try Again" : "Open Settings"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : !isNative ? (
            <View style={styles.cameraPreviewStatus}>
              <Ionicons name="radio" size={40} color={catColor} />
              <Text style={[styles.cameraPreviewText, { color: colors.mutedForeground }]}>
                Camera preview requires a native build
              </Text>
            </View>
          ) : null}
        </View>
        {isNative ? (
          <View
            style={[
              styles.cameraDiagnosticPanel,
              cameraError ? styles.cameraDiagnosticPanelError : null,
            ]}
          >
            <Ionicons
              name={cameraError ? "warning-outline" : cameraReady ? "checkmark-circle-outline" : "time-outline"}
              size={18}
              color={cameraError ? "#FF6B6B" : cameraReady ? "#00C896" : "#FFD166"}
            />
            <Text style={styles.cameraDiagnosticText}>
              <Text style={styles.cameraDiagnosticLabel}>Message: </Text>
              {cameraError ?? cameraDiagnostic}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.setupTitle, { color: colors.foreground }]}>
          Start your stream
        </Text>
        <Text style={[styles.setupSubtitle, { color: colors.mutedForeground }]}>
          {isNative ? "Choose a category and go live" : "Demo mode — stream info saved, no camera on web"}
        </Text>

        <View style={styles.inputSection}>
          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Category</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => {
              const selected = category === cat;
              const cc = CATEGORY_COLORS[cat] ?? colors.primary;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: selected ? cc + "33" : colors.card,
                      borderColor: selected ? cc : colors.border,
                    },
                  ]}
                  onPress={() => { setCategory(cat); Haptics.selectionAsync(); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.categoryChipText, { color: selected ? cc : colors.mutedForeground }]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.goLiveBtn,
            {
              backgroundColor: title.trim() && cameraReady ? catColor : colors.muted,
              opacity: isStarting || (isNative && !cameraReady) ? 0.7 : 1,
            },
          ]}
          onPress={startLive}
          disabled={!title.trim() || isStarting || (isNative && !cameraReady)}
          activeOpacity={0.85}
        >
          {isStarting ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Ionicons name="radio" size={20} color="#FFF" />
              <Text style={styles.goLiveBtnText}>
                {isNative && !cameraReady ? "Preparing Camera" : isNative ? "Go Live" : "Go Live (Demo)"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  closeBtn: {
    position: "absolute",
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  demoCamera: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  demoCameraInner: { ...StyleSheet.absoluteFillObject },
  demoCameraIcon: { alignItems: "center", gap: 10 },
  demoCameraLabel: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  demoCameraNote: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "Inter_400Regular" },
  setupContent: { alignItems: "center", paddingHorizontal: 24, gap: 20 },
  buildIdentifier: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 8,
    backgroundColor: "rgba(255,25,102,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,25,102,0.45)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  buildIdentifierLabel: {
    color: "#FF75A3",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  buildIdentifierValue: {
    color: "#FFF",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  cameraPreview: {
    width: "100%",
    aspectRatio: 3 / 4,
    maxHeight: 340,
    borderRadius: 20,
    borderWidth: 2,
    overflow: "hidden",
  },
  cameraPreviewStatus: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "rgba(8,8,15,0.82)",
  },
  cameraPreviewText: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center", paddingHorizontal: 24 },
  cameraRetryBtn: {
    marginTop: 4,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  cameraRetryText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  cameraDiagnosticPanel: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    backgroundColor: "rgba(0,200,150,0.12)",
    borderWidth: 1,
    borderColor: "rgba(0,200,150,0.32)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cameraDiagnosticPanelError: {
    backgroundColor: "rgba(255,107,107,0.12)",
    borderColor: "rgba(255,107,107,0.36)",
  },
  cameraDiagnosticText: {
    flex: 1,
    color: "#FFF",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    lineHeight: 17,
  },
  cameraDiagnosticLabel: {
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
  },
  setupTitle: { fontSize: 26, fontWeight: "700", fontFamily: "Inter_700Bold", textAlign: "center" },
  setupSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: -8 },
  inputSection: { width: "100%", gap: 8 },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  titleInput: { borderWidth: 1.5, borderRadius: 12, padding: 14, fontSize: 16, fontFamily: "Inter_400Regular" },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5 },
  categoryChipText: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  goLiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    paddingVertical: 18,
    borderRadius: 14,
    justifyContent: "center",
    marginTop: 8,
  },
  goLiveBtnText: { color: "#FFF", fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  liveOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "column",
  },
  liveErrorBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: "rgba(180,24,24,0.92)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  liveErrorText: {
    flex: 1,
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  liveChatArea: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  liveChatScroll: { maxHeight: 240 },
  liveChatList: { gap: 5, paddingBottom: 4 },
  liveChatBubble: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "rgba(0,0,0,0.42)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
    maxWidth: "85%",
  },
  liveChatSender: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Inter_600SemiBold",
  },
  liveChatText: {
    color: "#FFF",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flexShrink: 1,
  },
  liveTopBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  liveTopRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  viewerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  viewerPillText: { color: "#FFF", fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  liveBadgeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FF1966",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#FFF" },
  liveBadgeText: { color: "#FFF", fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  liveDuration: { color: "#FFF", fontSize: 14, fontFamily: "Inter_500Medium" },
  demoBadge: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  demoBadgeText: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "700", fontFamily: "Inter_700Bold", letterSpacing: 1 },
  liveBottom: {
    gap: 10,
  },
  liveBottomBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 40,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  liveIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  endLiveIconBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  chatInputRow: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  chatInput: {
    color: "#FFF",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingVertical: 10,
    minHeight: 40,
  },
  backBtnAlt: {
    position: "absolute",
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  gateTitle: { fontSize: 24, fontWeight: "800", fontFamily: "Inter_700Bold", marginTop: 20, marginBottom: 8, textAlign: "center" },
  gateSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 32, lineHeight: 22, marginBottom: 28 },
  gateBtn: { paddingHorizontal: 48, paddingVertical: 14, borderRadius: 30 },
  gateBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
  gateLink: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
