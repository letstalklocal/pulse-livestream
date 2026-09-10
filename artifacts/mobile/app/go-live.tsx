import { BeautySheet, DEFAULT_BEAUTY, type BeautySettings } from "@/components/BeautySheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ViewerManagementSheet } from "@/components/ViewerManagementSheet";
import { useStreamSocket } from "@/hooks/useStreamSocket";
import { Ionicons } from "@expo/vector-icons";
import { useAuth as useClerkAuth } from "@clerk/expo";
import * as ImagePicker from "expo-image-picker";
import { fetch as expoFetch } from "expo/fetch";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
  type CreateStreamRequestRequiredGiftId,
  getListStreamsQueryKey,
  getGetStreamQueryKey,
  convertStreamToPremium,
  getStream,
  getGetStreamChatQueryKey,
  useCreateStream,
  useActOnPrivateStreamInvitation,
  useEndStream,
  useGenerateAgoraToken,
  useGetStream,
  useGetStreamEarnings,
  useGetStreamChat,
  useHeartbeatStream,
  useRequestStreamBackgroundUpload,
  useSendChatMessage,
  useUpsertUser,
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
import { LivePremiumSheet } from "@/components/LivePremiumSheet";
import { switchBroadcastChannel } from "@/utils/switchBroadcastChannel";
import { GiftLeaderboard } from "@/components/GiftLeaderboard";

const isNative = Platform.OS === "ios" || Platform.OS === "android";
const CATEGORIES = ["Gaming", "Music", "Talk", "Art", "Dance", "Other"];
const CATEGORY_COLORS: Record<string, string> = {
  Gaming: "#7B4FFF",
  Music: "#FF1966",
  Talk: "#00C896",
  Art: "#FF8C00",
  Dance: "#FF1966",
  Other: "#4FC3F7",
};

function releaseAgoraEngine(engine: any) {
  try { engine?.leaveChannel?.(); } catch (error) { console.warn("[Agora] leave cleanup error:", error); }
  try { engine?.stopPreview?.(); } catch (error) { console.warn("[Agora] preview cleanup error:", error); }
  try { engine?.release?.(); } catch (error) { console.warn("[Agora] release cleanup error:", error); }
}

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
  const navigation = useNavigation();
  const { user, isSignedIn, updateUser } = useAuth();
  const { getToken } = useClerkAuth();
  const { invitationId, channelId: invitationChannelId } = useLocalSearchParams<{ invitationId?: string; channelId?: string }>();
  const privateInvitationId = Number(invitationId);
  const isPrivateInvite = Number.isInteger(privateInvitationId) && !!invitationChannelId;

  const [title, setTitle] = useState("Join My Live");
  const [category, setCategory] = useState("Gaming");
  const [isPremium, setIsPremium] = useState(false);
  const [requiredGiftId, setRequiredGiftId] = useState<CreateStreamRequestRequiredGiftId>(null);
  const [draftRequiredGiftId, setDraftRequiredGiftId] = useState<CreateStreamRequestRequiredGiftId>(null);
  const [showPremiumGiftSheet, setShowPremiumGiftSheet] = useState(false);
  const [showLivePremium, setShowLivePremium] = useState(false);
  const [premiumConnecting, setPremiumConnecting] = useState(false);
  const mediaChannelRef = useRef("");
  const mediaSwitchBusyRef = useRef(false);
  const [mediaRetry, setMediaRetry] = useState(0);
  const mediaRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (mediaRetryTimerRef.current) clearTimeout(mediaRetryTimerRef.current); }, []);
  const [isLive, setIsLive] = useState(false);
  const [activeChannelId, setActiveChannelId] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatText, setChatText] = useState("");
  const chatInputRef = useRef<TextInput>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
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

  const channelIdRef = useRef("");
  const isLiveRef = useRef(false);
  const isStoppingRef = useRef(false);
  const engineRef = useRef<any>(null);
  const [showBeauty, setShowBeauty] = useState(false);
  const [beauty, setBeauty] = useState<BeautySettings>(DEFAULT_BEAUTY);
  const [beautyError, setBeautyError] = useState<string | null>(null);
  const [beautyLoadedKey, setBeautyLoadedKey] = useState<string | null>(null);
  const beautyKey = user ? `pulse:beauty:${user.uid}` : null;
  useEffect(() => {
    let cancelled = false;
    setBeauty(DEFAULT_BEAUTY);
    setBeautyLoadedKey(null);
    if (!beautyKey) return;
    void AsyncStorage.getItem(beautyKey).then(raw => {
      if (cancelled) return;
      if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved.enabled === "boolean" && typeof saved.smoothness === "number" && Number.isFinite(saved.smoothness)) {
          setBeauty({ enabled: saved.enabled, smoothness: Math.max(0, Math.min(1, saved.smoothness)) });
        }
      }
    }).catch(() => {}).finally(() => { if (!cancelled) setBeautyLoadedKey(beautyKey); });
    return () => { cancelled = true; };
  }, [beautyKey]);
  useEffect(() => {
    if (!beautyKey || beautyLoadedKey !== beautyKey) return;
    const timer = setTimeout(() => { void AsyncStorage.setItem(beautyKey, JSON.stringify(beauty)).catch(() => {}); }, 250);
    return () => clearTimeout(timer);
  }, [beauty, beautyKey, beautyLoadedKey]);
  useEffect(() => {
    if (!isNative || !cameraViewReady || !engineRef.current) return;
    try {
      const result = engineRef.current.setBeautyEffectOptions(beauty.enabled, {
        smoothnessLevel: beauty.smoothness,
        lighteningLevel: 0,
        rednessLevel: 0,
        sharpnessLevel: 0,
        lighteningContrastLevel: 1,
      });
      setBeautyError(result < 0 ? "Beauty effects could not be applied on this device. Try turning them off and on." : null);
    } catch {
      setBeautyError("Beauty effects are unavailable in this build.");
    }
  }, [beauty.enabled, beauty.smoothness, cameraViewReady]);
  const changeBeauty = useCallback((next: BeautySettings) => {
    setBeauty(previous => previous.enabled === next.enabled && previous.smoothness === next.smoothness ? previous : next);
  }, []);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Holds token+channelId until the live RtcSurfaceView is mounted
  const pendingJoinRef = useRef<{ token: string; channelId: string } | null>(null);

  const queryClient = useQueryClient();
  const generateToken = useGenerateAgoraToken();
  const createStream = useCreateStream();
  const invitationAction = useActOnPrivateStreamInvitation();
  const endStream = useEndStream();
  const heartbeat = useHeartbeatStream();
  const sendChatMutation = useSendChatMessage();
  const requestBackgroundUpload = useRequestStreamBackgroundUpload();
  const upsertUser = useUpsertUser();

  // If not signed in, show gate screen — hooks must be called unconditionally so this goes after them
  // Poll viewer count while live
  const { data: liveStreamData } = useGetStream(activeChannelId, {
    query: { enabled: isLive && !!activeChannelId, refetchInterval: 5000 } as any,
  });
  const viewerCount = liveStreamData?.stream?.viewerCount ?? 0;

  // A converted stream keeps its logical ID, but moves publishing to protected media.
  useEffect(() => {
    const target = liveStreamData?.stream.rtcChannelName;
    if (!isLive || !target || target === activeChannelId || target === mediaChannelRef.current || mediaSwitchBusyRef.current) return;
    const engine = engineRef.current;
    mediaSwitchBusyRef.current = true;
    setPremiumConnecting(true);
    void (async () => {
      try {
        if (isNative && !engine) throw new Error("Live camera is unavailable.");
        const token = await generateToken.mutateAsync({ data: { channelName: activeChannelId, uid: user!.uid, role: "broadcaster" } });
        const stillActive = () => isLiveRef.current && !isStoppingRef.current && engineRef.current === engine;
        if (!stillActive()) return;
        if (isNative) await switchBroadcastChannel(engine, token.token, token.channelName, user!.uid, isMuted, stillActive);
        if (!stillActive()) return;
        mediaChannelRef.current = token.channelName;
        setIsPremium(!!liveStreamData?.stream.requiredGift);
        setCameraError(null);
      } catch (error) {
        if (isLiveRef.current && !isStoppingRef.current) {
          setCameraError(error instanceof Error ? error.message : "Could not reconnect live video. Retrying…");
          mediaRetryTimerRef.current = setTimeout(() => setMediaRetry(attempt => attempt + 1), 2000);
        }
      } finally {
        mediaSwitchBusyRef.current = false;
        setPremiumConnecting(false);
      }
    })();
  }, [liveStreamData, isLive, activeChannelId, user?.uid, isMuted, mediaRetry]);

  const convertLiveToPremium = async (giftId: string, freeViewerIds: number[]) => {
    const channelId = channelIdRef.current;
    const engine = engineRef.current;
    // Pause before committing access changes, including when the HTTP response is lost.
    if (isNative) {
      if (!engine) throw new Error("Live camera is unavailable.");
      const result = engine.updateChannelMediaOptions({ publishCameraTrack: false, publishMicrophoneTrack: false });
      if (result < 0) throw new Error("Could not pause the broadcast. Please try again.");
    }
    try {
      const result = await convertStreamToPremium(channelId, { requiredGiftId: giftId, freeViewerIds });
      if (!isLiveRef.current || isStoppingRef.current || channelIdRef.current !== channelId) return;
      queryClient.setQueryData(getGetStreamQueryKey(channelId), result);
      setRequiredGiftId(giftId as CreateStreamRequestRequiredGiftId);
      setIsPremium(true);
      setShowLivePremium(false);
      void queryClient.invalidateQueries({ queryKey: getListStreamsQueryKey() });
    } catch (error) {
      // Only resume the public channel after the server confirms conversion did not commit.
      const confirmed = await getStream(channelId).catch(() => null);
      if (!isLiveRef.current || isStoppingRef.current || channelIdRef.current !== channelId) return;
      if (confirmed?.stream.requiredGift) {
        queryClient.setQueryData(getGetStreamQueryKey(channelId), confirmed);
        setIsPremium(true);
        setShowLivePremium(false);
      } else {
        if (confirmed && engineRef.current === engine && isLiveRef.current) {
          engine?.muteLocalAudioStream(isMuted);
          engine?.updateChannelMediaOptions({ publishCameraTrack: true, publishMicrophoneTrack: true });
        }
        throw error;
      }
    }
  };

  const [showViewerManagement, setShowViewerManagement] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // WebSocket push — server sends earnings + gift events in real time
  const [realtimeEarnings, setRealtimeEarnings] = useState({ channelId: "", coins: 0 });
  const earningsQuery = useGetStreamEarnings(activeChannelId, {
    query: { enabled: isLive && !!activeChannelId, refetchInterval: 3000 } as any,
  });
  // Push updates remain immediate; polling recovers missed events and reconnects.
  // An older HTTP response must not overwrite a newer push total.
  const streamCoins = Math.max(
    earningsQuery.data?.coins ?? 0,
    realtimeEarnings.channelId === activeChannelId ? realtimeEarnings.coins : 0,
  );
  const [floatingGifts, setFloatingGifts] = useState<FloatingGift[]>([]);
  const serverEndedShutdownRef = useRef<() => void>(() => {});

  useStreamSocket({
    channelId: activeChannelId,
    enabled: isLive && !!activeChannelId,
    onConnect: () => { void earningsQuery.refetch(); },
    onMessage: event => {
        try {
          const msg = JSON.parse(String(event.data)) as {
            type?: string;
            coins?: number;
            giftName?: string;
            senderName?: string;
          };
          if (msg.type === "stream_updated") {
            void queryClient.invalidateQueries({ queryKey: getGetStreamQueryKey(activeChannelId) });
          }
          if (msg.type === "earnings" && typeof msg.coins === "number") {
            const coins = msg.coins;
            setRealtimeEarnings(previous => ({
              channelId: activeChannelId,
              coins: previous.channelId === activeChannelId ? Math.max(previous.coins, coins) : coins,
            }));
          }
          if (msg.type === "gift" && msg.giftName) {
            const gift = GIFTS.find((g) => g.name === msg.giftName) ?? GIFTS[0]!;
            const x = 60 + Math.random() * 200;
            setFloatingGifts((prev) => [
              ...prev,
              { id: `${Date.now()}-${Math.random()}`, emoji: gift.emoji, name: gift.name, senderName: msg.senderName ?? "Viewer", x, size: gift.size },
            ]);
          }
          if (msg.type === "stream_ended") {
            serverEndedShutdownRef.current();
          }
        } catch {
          // ignore
        }
    },
  });

  // Poll chat messages while live (broadcaster sees viewer messages too)
  const { data: chatPollData } = useGetStreamChat(activeChannelId, undefined, {
    query: { enabled: isLive && !!activeChannelId, refetchInterval: 1000 } as any,
  });

  useEffect(() => {
    if (!chatPollData?.messages) return;
    setChatMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const next = chatPollData.messages.filter((m) => !existingIds.has(m.id));
      if (next.length === 0) return prev;
      return [...prev, ...next].slice(-100);
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
      const engine = engineRef.current;
      engineRef.current = null;
      releaseAgoraEngine(engine);
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

  const startLive = useCallback(async (premiumGiftId?: CreateStreamRequestRequiredGiftId) => {
    if (!title.trim()) return;
    if (!user?.streamBackgroundImagePath) {
      Alert.alert(
        "Background image required",
        "Add a stream background image before going live.",
      );
      return;
    }
    if (isNative && (!cameraReady || !engineRef.current)) {
      setCameraError("Wait for the camera preview before going live.");
      return;
    }
    const confirmedGiftId = isPrivateInvite ? null : (premiumGiftId ?? requiredGiftId);
    if (isPremium && !confirmedGiftId) return;

    setIsStarting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const channelId = isPrivateInvite ? invitationChannelId! : `pulse-${user!.uid}-${Date.now()}`;
    channelIdRef.current = channelId;

    let activatedPrivate = false;
    let createdStream = false;
    try {
      // Create the durable private session first. Invitation activation then
      // atomically verifies this exact host/channel before releasing escrow.
      await createStream.mutateAsync({
        data: {
          channelId,
          hostUid: user!.uid,
          hostName: user!.name,
          hostAvatarUrl: user!.avatarUri ?? null,
          title: title.trim(),
          category,
          requiredGiftId: confirmedGiftId,
        },
      });
      createdStream = true;
      if (isPrivateInvite) {
        await invitationAction.mutateAsync({ id: privateInvitationId, action: "start" });
        activatedPrivate = true;
      }

      // The durable live session must exist before Agora can authorize any
      // token for this channel, including the broadcaster's first token.
      const tokenData = await generateToken.mutateAsync({
        data: { channelName: channelId, uid: user!.uid, role: "broadcaster" },
      });

      if (isNative && engineRef.current) {
        pendingJoinRef.current = { token: tokenData.token, channelId: tokenData.channelName };
        mediaChannelRef.current = tokenData.channelName;
      }

      setShowPremiumGiftSheet(false);
      setShowLivePremium(false);
      isLiveRef.current = true;
      setActiveChannelId(channelId);
      setIsBroadcasting(true);
      setIsLive(true);
      setIsStarting(false);
      durationRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      if (createdStream) {
        try {
          await endStream.mutateAsync({ channelId });
        } catch {
          // Heartbeat expiry remains the final recovery path if cleanup cannot reach the server.
        }
      }
      if (activatedPrivate) {
        try {
          await invitationAction.mutateAsync({ id: privateInvitationId, action: "end" });
        } catch {
          // Heartbeat expiry remains the final recovery path if cleanup cannot reach the server.
        }
      }
      console.warn("[Agora] start live error:", e);
      setCameraError(e instanceof Error ? e.message : "Could not start the live stream.");
      setIsStarting(false);
    }
  }, [title, category, user, generateToken, createStream, cameraReady, invitationAction, isPrivateInvite, invitationChannelId, privateInvitationId, requiredGiftId]);

  const chooseStreamBackground = useCallback(async () => {
    if (!user || isUploadingBackground) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo access required",
        "Allow photo access to choose your stream background image.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    setIsUploadingBackground(true);
    try {
      const asset = result.assets[0];
      const upload = await requestBackgroundUpload.mutateAsync({ uid: user.uid });
      const sourceResponse = await expoFetch(asset.uri);
      const imageBlob = await sourceResponse.blob();
      const uploadResponse = await expoFetch(upload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": asset.mimeType ?? "image/jpeg",
        },
        body: imageBlob,
      });
      if (!uploadResponse.ok) {
        throw new Error(`Image upload failed (${uploadResponse.status}).`);
      }

      const updated = await upsertUser.mutateAsync({
        uid: user.uid,
        data: {
          name: user.name,
          bio: user.bio,
          streamBackgroundImagePath: upload.objectPath,
        },
      });
      updateUser({
        streamBackgroundImagePath: updated.user.streamBackgroundImagePath,
        streamBackgroundImageUrl: updated.user.streamBackgroundImageUrl,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert(
        "Background not saved",
        error instanceof Error ? error.message : "Choose another image and try again.",
      );
    } finally {
      setIsUploadingBackground(false);
    }
  }, [
    isUploadingBackground,
    requestBackgroundUpload,
    updateUser,
    upsertUser,
    user,
  ]);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    engineRef.current?.muteLocalAudioStream?.(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isMuted]);

  const resetLiveSetup = useCallback(() => {
    setShowPremiumGiftSheet(false);
    setShowLivePremium(false);
    setIsPremium(false);
    setRequiredGiftId(null);
    setDraftRequiredGiftId(null);
    setShowLeaderboard(false);
    setShowViewerManagement(false);
    setShowChat(false);
    setChatText("");
    setChatMessages([]);
    setFloatingGifts([]);
    setDuration(0);
    setIsMuted(false);
    setCameraError(null);
    setCameraReady(!isNative);
    setCameraViewReady(false);
    setPremiumConnecting(false);
    pendingJoinRef.current = null;
    mediaChannelRef.current = "";
    if (mediaRetryTimerRef.current) clearTimeout(mediaRetryTimerRef.current);
  }, []);

  const stopLive = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    if (durationRef.current) clearInterval(durationRef.current);
    // Mark not-live before async ops so the unmount cleanup doesn't double-delete
    isLiveRef.current = false;
    resetLiveSetup();
    setIsStarting(true);
    setIsLive(false);
    setActiveChannelId("");
    setIsBroadcasting(false);
    const engine = engineRef.current;
    engineRef.current = null;
    releaseAgoraEngine(engine);
    try {
      if (isPrivateInvite) {
        await Promise.allSettled([
          endStream.mutateAsync({ channelId: channelIdRef.current }),
          invitationAction.mutateAsync({ id: privateInvitationId, action: "end" }),
        ]);
      } else {
        await endStream.mutateAsync({ channelId: channelIdRef.current });
      }
      await queryClient.invalidateQueries({ queryKey: getListStreamsQueryKey() });
    } catch (_e) {
      // best effort — still invalidate so stale data is cleared
      void queryClient.invalidateQueries({ queryKey: getListStreamsQueryKey() });
    }
    if (isPrivateInvite) {
      router.back();
    } else {
      isStoppingRef.current = false;
      setIsStarting(false);
      setPermissionRetryCount(count => count + 1);
    }
  }, [endStream, queryClient, router, invitationAction, isPrivateInvite, privateInvitationId, resetLiveSetup]);

  const stopLiveFromServer = useCallback(() => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    if (durationRef.current) clearInterval(durationRef.current);
    isLiveRef.current = false;
    resetLiveSetup();
    setIsStarting(true);
    setIsLive(false);
    setActiveChannelId("");
    setIsBroadcasting(false);
    const engine = engineRef.current;
    engineRef.current = null;
    releaseAgoraEngine(engine);
    void queryClient.invalidateQueries({ queryKey: getListStreamsQueryKey() });
    if (isPrivateInvite) {
      router.back();
    } else {
      isStoppingRef.current = false;
      setIsStarting(false);
      setPermissionRetryCount(count => count + 1);
    }
  }, [queryClient, router, isPrivateInvite, resetLiveSetup]);

  useEffect(() => {
    serverEndedShutdownRef.current = stopLiveFromServer;
  }, [stopLiveFromServer]);

  const confirmStopLive = useCallback(() => {
    Alert.alert(
      "End live stream?",
      "Your viewers will be disconnected and this live stream will end.",
      [
        { text: "Keep Streaming", style: "cancel" },
        { text: "End Live", style: "destructive", onPress: () => void stopLive() },
      ],
    );
  }, [stopLive]);

  useEffect(() => {
    if (!isLive) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      confirmStopLive();
      return true;
    });
    return () => subscription.remove();
  }, [isLive, confirmStopLive]);

  useEffect(() => {
    return navigation.addListener("beforeRemove", (event) => {
      if (!isLiveRef.current || isStoppingRef.current) return;
      event.preventDefault();
      confirmStopLive();
    });
  }, [navigation, confirmStopLive]);

  // Safety net: if the screen unmounts while live (e.g. Android back gesture),
  // delete the stream so it doesn't linger on the Discover page.
  useEffect(() => {
    return () => {
      if (isLiveRef.current && channelIdRef.current) {
        const close = isPrivateInvite
          ? invitationAction.mutateAsync({ id: privateInvitationId, action: "end" })
          : endStream.mutateAsync({ channelId: channelIdRef.current });
        void close.finally(() => {
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
  const privateHeartbeatRef = useRef(invitationAction.mutate);
  useEffect(() => { privateHeartbeatRef.current = invitationAction.mutate; });
  const privateHeartbeatFailuresRef = useRef(0);

  // Send a heartbeat every 20 s while live (TTL is 60 s, so 3 chances before expiry).
  // Depends only on isLive — not on the mutation object — so the interval is stable.
  useEffect(() => {
    if (!isLive || !channelIdRef.current) return;
    const sendHeartbeat = () => {
      if (isPrivateInvite) {
        privateHeartbeatRef.current(
          { id: privateInvitationId, action: "heartbeat" },
          {
            onSuccess: () => {
              privateHeartbeatFailuresRef.current = 0;
              heartbeatMutateRef.current({ channelId: channelIdRef.current });
            },
            onError: (error) => {
              const status = typeof error === "object" && error !== null && "status" in error
                ? (error as { status?: unknown }).status
                : undefined;
              const invitationIsTerminal = status === 404 || status === 409;
              privateHeartbeatFailuresRef.current += 1;
              if (invitationIsTerminal || privateHeartbeatFailuresRef.current >= 3) {
                void stopLive();
              }
            },
          },
        );
        return;
      }
      heartbeatMutateRef.current({ channelId: channelIdRef.current });
    };
    sendHeartbeat();
    const id = setInterval(() => {
      sendHeartbeat();
    }, 20_000);
    return () => clearInterval(id);
  }, [isLive, isPrivateInvite, privateInvitationId, stopLive]);

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
          <View style={[styles.liveTopDock, { top: topPad + 12 }]}>
            <View style={styles.liveTopBar}>
              <View style={styles.liveBadgeRow}>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveBadgeText}>{liveStreamData?.stream.requiredGift || isPremium ? "PREMIUM" : "LIVE"}</Text>
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
                <TouchableOpacity style={styles.viewerPill} disabled={isPrivateInvite} onPress={() => setShowViewerManagement(true)} accessibilityLabel="Manage viewers">
                  <Ionicons name="eye" size={13} color="#FFF" />
                  <Text style={styles.viewerPillText}>{viewerCount}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={[styles.liveBottomDock, { bottom: bottomPad + 12 }]}>
            {/* Chat messages grow upward above the fixed action bar. */}
            <View style={styles.liveChatArea} pointerEvents="box-none">
              <View style={styles.liveChatList}>
                {chatMessages.slice(-6).map((item) => (
                  <View key={item.id} style={styles.liveChatBubble}>
                    <Text style={[styles.liveChatSender, { color: item.color }]}>{item.senderName}: </Text>
                    <Text style={styles.liveChatText}>{item.text}</Text>
                  </View>
                ))}
              </View>
            </View>

          <View style={[styles.liveBottom, { paddingHorizontal: 16 }]}>
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
                      }).then((data) => {
                        setChatMessages((prev) => {
                          if (prev.some((message) => message.id === data.message.id)) return prev;
                          return [...prev, data.message].slice(-100);
                        });
                        void queryClient.invalidateQueries({
                          queryKey: getGetStreamChatQueryKey(channelIdRef.current),
                        });
                      }).catch(() => {
                        Alert.alert("Message not sent", "Check your connection and try again.");
                      });
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

              {!isPrivateInvite && !isPremium && !liveStreamData?.stream.requiredGift ? (
                <TouchableOpacity style={styles.liveIconBtn} onPress={() => setShowLivePremium(true)} accessibilityRole="button" accessibilityLabel="Convert to Premium" activeOpacity={0.7}>
                  <Ionicons name="lock-closed-outline" size={26} color="#FFF" />
                </TouchableOpacity>
              ) : null}
              {premiumConnecting ? <ActivityIndicator color="#FFD700" /> : null}

              <TouchableOpacity style={styles.endLiveIconBtn} onPress={confirmStopLive} activeOpacity={0.85}>
                <Ionicons name="stop-circle" size={32} color="#FFF" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.liveIconBtn} onPress={toggleMute} activeOpacity={0.7}>
                <Ionicons name={isMuted ? "mic-off" : "mic"} size={26} color={isMuted ? "#FF4444" : "#FFF"} />
              </TouchableOpacity>
            </View>
          </View>
          </View>
        </KeyboardAvoidingView>

        {showViewerManagement ? <ViewerManagementSheet channelId={activeChannelId} onClose={() => setShowViewerManagement(false)} onProfile={(uid, name) => router.push({ pathname: "/profile/[hostUid]", params: { hostUid: String(uid), name } })} /> : null}
        {showLivePremium ? <LivePremiumSheet channelId={activeChannelId} onClose={() => setShowLivePremium(false)} onConfirm={convertLiveToPremium} /> : null}
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
  const selectedRequiredGift = GIFTS.find((gift) => gift.id === requiredGiftId);
  const canStart =
    !!title.trim() &&
    !!user.streamBackgroundImagePath &&
    !isStarting &&
    !isUploadingBackground &&
    (!isNative || cameraReady) &&
    (!isPremium || !!requiredGiftId);

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <View style={[styles.setupCamera, { backgroundColor: catColor + "22" }]}>
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
            <Text style={styles.fullScreenCameraStatusText}>
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
          <DemoCamera color={catColor} />
        ) : null}
      </View>
      <View pointerEvents="none" style={styles.setupShade} />

      <TouchableOpacity
        style={[styles.closeBtn, { top: topPad + 12 }]}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Ionicons name="arrow-back" size={24} color="#FFF" />
      </TouchableOpacity>

      {isNative ? <TouchableOpacity
        style={[styles.closeBtn, { left: undefined, right: 20, top: topPad + 12 }]}
        onPress={() => setShowBeauty(true)}
        disabled={!cameraViewReady}
        accessibilityLabel="Beauty effects"
        accessibilityRole="button"
      >
        <Ionicons name="sparkles-outline" size={24} color={beauty.enabled && !beautyError ? "#FF1966" : "#FFF"} />
      </TouchableOpacity> : null}
      {showBeauty ? <BeautySheet settings={beauty} onChange={changeBeauty} error={beautyError} onClose={() => setShowBeauty(false)} /> : null}

      <KeyboardAvoidingView
        style={styles.setupOverlay}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <View style={[styles.setupBottomDock, { paddingBottom: bottomPad + 18 }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.compactCategoryRow}
          >
            {CATEGORIES.map((cat) => {
              const selected = category === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.compactCategoryChip, selected ? styles.compactCategoryChipSelected : null]}
                  onPress={() => { setCategory(cat); Haptics.selectionAsync(); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.compactCategoryText, selected ? styles.compactCategoryTextSelected : null]}>{cat}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.setupMetaRow}>
            <TouchableOpacity
              style={[styles.backgroundThumbnail, !user.streamBackgroundImagePath ? styles.backgroundThumbnailMissing : null]}
              onPress={() => void chooseStreamBackground()}
              disabled={isUploadingBackground}
              activeOpacity={0.85}
            >
              {user.streamBackgroundImageUrl ? (
                <Image source={{ uri: user.streamBackgroundImageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <Ionicons name="image-outline" size={28} color="#FFF" />
              )}
              <View style={styles.backgroundEditBadge}>
                {isUploadingBackground ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Ionicons name={user.streamBackgroundImagePath ? "pencil" : "add"} size={15} color="#FFF" />
                )}
              </View>
            </TouchableOpacity>
            <View style={styles.titleGlassCard}>
              <Text style={styles.titleGlassLabel}>LIVE TITLE</Text>
              <TextInput
                style={styles.titleGlassInput}
                value={title}
                onChangeText={setTitle}
                placeholder="What are you streaming today?"
                placeholderTextColor="rgba(255,255,255,0.55)"
                maxLength={80}
                returnKeyType="done"
              />
              {selectedRequiredGift ? (
                <Text style={styles.selectedGiftSummary}>
                  {selectedRequiredGift.emoji} {selectedRequiredGift.name} · 🪙{selectedRequiredGift.coins}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.modeSelector}>
            {isPremium && requiredGiftId ? (
              <>
                <TouchableOpacity
                  testID="stream-entry-free"
                  style={styles.modeSecondary}
                  onPress={() => {
                    setIsPremium(false);
                    setRequiredGiftId(null);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text style={styles.modeSecondaryText}>Go Live</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="go-live-submit"
                  style={[styles.modePrimary, { backgroundColor: canStart ? "#FF1966" : "rgba(255,255,255,0.22)" }]}
                  onPress={() => void startLive()}
                  disabled={!canStart}
                  activeOpacity={0.85}
                >
                  {isStarting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modePrimaryText}>Go Premium</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  testID="go-live-submit"
                  style={[styles.modePrimary, { backgroundColor: canStart ? catColor : "rgba(255,255,255,0.22)" }]}
                  onPress={() => void startLive()}
                  disabled={!canStart}
                  activeOpacity={0.85}
                >
                  {isStarting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modePrimaryText}>Go Live</Text>}
                </TouchableOpacity>
                {!isPrivateInvite ? (
                  <TouchableOpacity
                    testID="stream-entry-premium"
                    style={styles.modeSecondary}
                    onPress={() => {
                      setIsPremium(true);
                      setDraftRequiredGiftId(requiredGiftId);
                      setShowPremiumGiftSheet(true);
                      Haptics.selectionAsync();
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="key" size={17} color="#FFF" />
                    <Text style={styles.modeSecondaryText}>Premium</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>
          {!user.streamBackgroundImagePath ? (
            <Text style={styles.setupRequirementText}>Add a background image before going live</Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={showPremiumGiftSheet}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => {
          setShowPremiumGiftSheet(false);
          setDraftRequiredGiftId(requiredGiftId);
          if (!requiredGiftId) setIsPremium(false);
        }}
      >
        <View style={styles.giftSheetBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              setShowPremiumGiftSheet(false);
              setDraftRequiredGiftId(requiredGiftId);
              if (!requiredGiftId) setIsPremium(false);
            }}
          />
          <View style={[styles.giftSheet, { paddingBottom: bottomPad + 18 }]}>
            <View style={styles.giftSheetGrabber} />
            <View style={styles.giftSheetHeader}>
              <View>
                <Text style={styles.giftSheetTitle}>Choose an entry gift</Text>
                <Text style={styles.giftSheetSubtitle}>Viewers send this gift to enter your Premium live.</Text>
              </View>
              <TouchableOpacity
                style={styles.giftSheetClose}
                onPress={() => {
                  setShowPremiumGiftSheet(false);
                  setDraftRequiredGiftId(requiredGiftId);
                  if (!requiredGiftId) setIsPremium(false);
                }}
              >
                <Ionicons name="close" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.giftSheetGrid} showsVerticalScrollIndicator={false}>
              {GIFTS.map((gift) => {
                const selected = draftRequiredGiftId === gift.id;
                return (
                  <TouchableOpacity
                    key={gift.id}
                    testID={`stream-required-gift-${gift.id}`}
                    style={[styles.giftSheetOption, selected ? styles.giftSheetOptionSelected : null]}
                    onPress={() => {
                      setDraftRequiredGiftId(gift.id as CreateStreamRequestRequiredGiftId);
                      Haptics.selectionAsync();
                    }}
                    activeOpacity={0.8}
                  >
                    {selected ? (
                      <View style={styles.giftSheetSelectedBadge}>
                        <Ionicons name="checkmark" size={14} color="#FFF" />
                      </View>
                    ) : null}
                    <Text style={styles.giftSheetEmoji}>{gift.emoji}</Text>
                    <Text style={styles.giftSheetGiftName}>{gift.name}</Text>
                    <Text style={styles.giftSheetGiftCost}>🪙 {gift.coins}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              testID="go-premium-submit"
              style={[
                styles.giftSheetSubmit,
                !draftRequiredGiftId || isStarting ? styles.giftSheetSubmitDisabled : null,
              ]}
              disabled={!draftRequiredGiftId || isStarting}
              onPress={() => {
                const giftId = draftRequiredGiftId;
                if (!giftId) return;
                setRequiredGiftId(giftId);
                setIsPremium(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                void startLive(giftId);
              }}
              activeOpacity={0.85}
            >
              {isStarting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="key" size={18} color="#FFF" />
                  <Text style={styles.giftSheetSubmitText}>
                    {draftRequiredGiftId ? "Go Premium" : "Choose a gift"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  demoCameraInner: { ...StyleSheet.absoluteFill },
  demoCameraIcon: { alignItems: "center", gap: 10 },
  demoCameraLabel: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  demoCameraNote: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "Inter_400Regular" },
  setupContent: { alignItems: "center", paddingHorizontal: 24, gap: 20 },
  setupCamera: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  setupShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "transparent",
    borderBottomWidth: 360,
    borderBottomColor: "rgba(0,0,0,0.58)",
  },
  setupOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "flex-end",
  },
  setupBottomDock: {
    paddingHorizontal: 14,
    gap: 12,
  },
  compactCategoryRow: {
    gap: 7,
    paddingRight: 14,
  },
  compactCategoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.34)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  compactCategoryChipSelected: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderColor: "rgba(255,255,255,0.7)",
  },
  compactCategoryText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  compactCategoryTextSelected: {
    color: "#FFF",
  },
  setupMetaRow: {
    minHeight: 104,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  titleGlassCard: {
    flex: 1,
    borderRadius: 17,
    paddingHorizontal: 15,
    paddingVertical: 13,
    justifyContent: "center",
    backgroundColor: "rgba(12,12,16,0.62)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  titleGlassLabel: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 10,
    letterSpacing: 0.8,
    fontFamily: "Inter_700Bold",
  },
  titleGlassInput: {
    color: "#FFF",
    fontSize: 17,
    lineHeight: 23,
    fontFamily: "Inter_600SemiBold",
    paddingVertical: 5,
    paddingHorizontal: 0,
  },
  selectedGiftSummary: {
    color: "#FFD76A",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  backgroundThumbnail: {
    width: 72,
    borderRadius: 17,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
  },
  backgroundThumbnailMissing: {
    borderStyle: "dashed",
  },
  backgroundEditBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  modeSelector: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  modePrimary: {
    flex: 1,
    minHeight: 54,
    borderRadius: 27,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modePrimaryText: {
    color: "#FFF",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  modeSecondary: {
    flex: 1,
    minHeight: 54,
    borderRadius: 27,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 18,
    backgroundColor: "rgba(0,0,0,0.34)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  modeSecondaryText: {
    color: "#FFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  setupRequirementText: {
    color: "#FFD76A",
    fontSize: 12,
    textAlign: "center",
    fontFamily: "Inter_600SemiBold",
  },
  fullScreenCameraStatusText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 28,
    fontFamily: "Inter_500Medium",
  },
  giftSheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  giftSheet: {
    maxHeight: "68%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 18,
    backgroundColor: "#17171D",
  },
  giftSheetGrabber: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 3,
    marginBottom: 17,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  giftSheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  giftSheetTitle: {
    color: "#FFF",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  giftSheetSubtitle: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 12,
    marginTop: 4,
    maxWidth: 290,
    fontFamily: "Inter_400Regular",
  },
  giftSheetClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  giftSheetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 8,
  },
  giftSheetOption: {
    position: "relative",
    width: "31%",
    minHeight: 112,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  giftSheetOptionSelected: {
    backgroundColor: "rgba(255,25,102,0.16)",
    borderColor: "#FF1966",
    borderWidth: 2,
  },
  giftSheetSelectedBadge: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF1966",
  },
  giftSheetEmoji: {
    fontSize: 31,
    marginBottom: 6,
  },
  giftSheetGiftName: {
    color: "#FFF",
    fontSize: 12,
    textAlign: "center",
    fontFamily: "Inter_600SemiBold",
  },
  giftSheetGiftCost: {
    color: "#FFD76A",
    fontSize: 11,
    marginTop: 4,
    fontFamily: "Inter_600SemiBold",
  },
  giftSheetSubmit: {
    minHeight: 56,
    marginTop: 14,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FF1966",
  },
  giftSheetSubmitDisabled: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  giftSheetSubmitText: {
    color: "#FFF",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  backgroundPicker: {
    width: "100%",
    height: 190,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  backgroundPickerEmpty: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 28,
  },
  backgroundPickerEmptyText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    lineHeight: 18,
  },
  backgroundPickerAction: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.68)",
  },
  backgroundPickerActionText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  backgroundRequired: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
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
  entryOptions: { flexDirection: "row", gap: 8 },
  entryOption: { flex: 1, borderRadius: 12, borderWidth: 1.5, padding: 12 },
  entryOptionTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  entryOptionSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  requiredGiftGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8 },
  requiredGiftOption: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6 },
  requiredGiftEmoji: { fontSize: 15 },
  requiredGiftText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
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
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  liveTopDock: {
    position: "absolute",
    left: 16,
    right: 16,
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
  liveBottomDock: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  liveChatArea: {
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  liveChatList: {
    gap: 5,
    paddingBottom: 4,
    justifyContent: "flex-end",
  },
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
    flexShrink: 0,
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
