import { t, useAppLanguage, localizedTextStyle, appLocale } from "@/i18n";
import { createGiftPresentation, expectsNativeCrown } from "@/utils/giftPresentation";
import { CrownArtwork } from "@/components/CrownArtwork";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
import { TranslatedMessage } from "@/components/TranslatedMessage";
import { TranslationToggle } from "@/components/TranslationToggle";
import { ReportStreamSheet } from "@/components/ReportStreamSheet";
import { useStreamSocket } from "@/hooks/useStreamSocket";
import { useLiveParty } from "@/hooks/useLiveParty";
import { usePartyMedia } from "@/hooks/usePartyMedia";
import { PartyStage } from "@/components/PartyStage";
import { battleUsesSplitLayout, partyLayout } from "@/utils/partyLayout";
import { Ionicons } from "@expo/vector-icons";
import { useAuth as useClerkAuth } from "@clerk/expo";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGenerateAgoraToken,
  updateStreamPresence,
  getGetStreamQueryKey,
  useGetStream,
  useGetStreamChat,
  getGetStreamChatQueryKey,
  useListStreams,
  useSendChatMessage,
  useUpdateViewerCount,
  useGetCoinBalance,
  getGetCoinBalanceQueryKey,
  useGetStreamEarnings,
  useSpendCoins,
  useFollowUser,
  useUnfollowUser,
  useGetFollowStatus,
  useGetPrivateStreamInvitation,
  useAdmitToStream,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { GiftPicker, GIFTS, type Gift } from "@/components/GiftPicker";
import { GiftFloater, type FloatingGift } from "@/components/GiftFloater";
import { GiftLeaderboard } from "@/components/GiftLeaderboard";
import {
  ChannelProfileType,
  ClientRoleType,
  RtcSurfaceViewComponent,
  VideoSourceType,
  createEngine,
} from "@/utils/agora";

const isNative = Platform.OS === "ios" || Platform.OS === "android";

const createGiftRequestKey = () =>
  Crypto.randomUUID();

interface ChatMsg {
  id: string;
  sender: string;
  senderUid?: number;
  text: string;
  color: string;
}

const VIEWER_NAMES = [
  "neon_fox", "cosmic_ray", "pulse_fan", "techwave", "groovemstr",
  "stargazer", "l33tcode", "vibe_check", "midnight_owl", "glitch99",
];
const CHAT_POOL = [
  "Let's gooo 🔥", "This is fire!", "Amazing stream!", "First time here, love it",
  "W streamer", "PogChamp", "Keep it up!", "How long have you been streaming?",
  "❤️❤️❤️", "Hyped rn", "Drop a follow!", "This slaps", "No way lmaooo",
  "actual goat", "GG GG", "Clip that!", "POV: you found a great stream",
  "Sub worthy fr", "Bro is too good", "Repping from London!",
];
const COLORS = ["#FF1966", "#7B4FFF", "#00C896", "#FF8C00", "#4FC3F7", "#FFD700"];

const SEED_CHAT: ChatMsg[] = [
  { id: "s1", sender: "viewer_neon",  text: "Wow amazing stream!",           color: "#FF1966" },
  { id: "s2", sender: "cosmic_fan",   text: "First time watching, love it",  color: "#7B4FFF" },
  { id: "s3", sender: "pulse_user99", text: "Keep it up! 🔥",               color: "#00C896" },
];

const CATEGORY_COLORS: Record<string, [string, string]> = {
  Gaming: ["#7B4FFF", "#3D1FA8"],
  Music:  ["#FF1966", "#8B0030"],
  Talk:   ["#00C896", "#006B51"],
  Art:    ["#FF8C00", "#8B4700"],
  Dance:  ["#FF1966", "#8B0030"],
  Other:  ["#4FC3F7", "#1565C0"],
};

function DemoVideo({ category }: { category?: string }) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const [bg1, bg2] = CATEGORY_COLORS[category ?? ""] ?? CATEGORY_COLORS["Other"]!;
  const shift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shift, { toValue: 1, duration: 3000, useNativeDriver: false }),
        Animated.timing(shift, { toValue: 0, duration: 3000, useNativeDriver: false }),
      ]),
    ).start();
  }, [shift]);

  const bgColor = shift.interpolate({
    inputRange: [0, 1],
    outputRange: [bg2, bg1],
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: bgColor }]}>
      <View style={[StyleSheet.absoluteFill, styles.videoOverlay]} />
      <View style={styles.videoCenter}>
        <Text style={styles.videoInitials}>
          {(category ?? "?").slice(0, 2).toUpperCase()}
        </Text>
      </View>
    </Animated.View>
  );
}

function StreamBackdrop({ imageUrl, demo = false, category }: {
  imageUrl?: string | null;
  demo?: boolean;
  category?: string;
}) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  if (demo) return <DemoVideo category={category} />;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]} pointerEvents="none">
      {imageUrl ? <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" fadeDuration={0} /> : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.25)" }]} />
    </View>
  );
}

export default function StreamScreen() {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState(state => state.isVisible);
  const router = useRouter();
  const { channelId, privateInvitationId } = useLocalSearchParams<{
    channelId: string;
    privateInvitationId?: string;
  }>();
  const privateInvitationIdNumber = Number(privateInvitationId);
  const isPrivateStream =
    Number.isInteger(privateInvitationIdNumber) || (channelId ?? "").startsWith("private-");
  const SCREEN_H = Dimensions.get("window").height;
  const SCREEN_W = Dimensions.get("window").width;
  const { user } = useAuth();
  const { getToken } = useClerkAuth();

  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [remoteVideoReady, setRemoteVideoReady] = useState(false);
  const [agoraError, setAgoraError] = useState<string | null>(null);
  const isDemo = (channelId ?? "").endsWith("-demo");
  const [messages, setMessages] = useState<ChatMsg[]>(isDemo ? SEED_CHAT : []);
  const [inputText, setInputText] = useState("");
  const [joined, setJoined] = useState(false);
  const [likeCount, setLikeCount] = useState(Math.floor(Math.random() * 500) + 50);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const giftPresentation = useRef(createGiftPresentation());
  useEffect(() => { giftPresentation.current = createGiftPresentation(); setFloatingGifts([]); }, [channelId]);
  const [floatingGifts, setFloatingGifts] = useState<FloatingGift[]>([]);
  const [showReport, setShowReport] = useState(false);
  const [restrictedByEvent, setRestrictedByEvent] = useState(false);
  const [showKebabMenu, setShowKebabMenu] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [streamEnded, setStreamEnded] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [admitted, setAdmitted] = useState(false);
  const [admissionError, setAdmissionError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  // Viewer's own spendable balance (for the gift picker)
  const coinBalanceQuery = useGetCoinBalance(
    { uid: user?.uid ?? 0 },
    { query: { enabled: !!user?.uid, refetchOnWindowFocus: false } as any },
  );
  const viewerCoins = coinBalanceQuery.data?.balance ?? 0;
  const spendMutation = useSpendCoins();
  const admitToStream = useAdmitToStream();
  const sendChatMutation = useSendChatMessage();
  const engineRef = useRef<any>(null);
  const primaryRtcChannelRef = useRef("");
  const partyWindowTouchRef = useRef(false);
  const admissionKeyRef = useRef(Crypto.randomUUID());
  const streamEndedRef = useRef(false);
  const listRef = useRef<FlatList>(null);

  // Slide animation for swipe transitions
  const slideAnim = useRef(new Animated.Value(0)).current;
  const overlaySlideAnim = useRef(new Animated.Value(0)).current;
  const [overlaysHidden, setOverlaysHidden] = useState(false);
  const horizontalSwipeRef = useRef<(hide: boolean) => void>(() => {});
  horizontalSwipeRef.current = (hide) => {
    if (hide) Keyboard.dismiss();
    setOverlaysHidden(hide);
    Animated.timing(overlaySlideAnim, {
      toValue: hide ? SCREEN_W : 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  };
  // Overlay animation for the incoming stream during transition
  const transitionAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const [transitionBackground, setTransitionBackground] = useState<{
    imageUrl?: string | null; demo: boolean; category?: string;
  }>({ demo: false });
  const [isTransitioning, setIsTransitioning] = useState(false);
  // Hint arrow fade-in
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const isNavigatingRef = useRef(false);

  const { data: streamData } = useGetStream(channelId ?? "", {
    query: { enabled: !!channelId, refetchInterval: 5000 } as any,
  });
  const stream = streamData?.stream;
  const requiresAdmission = !!stream?.requiredGift;
  // Demo streams have no persisted stream record. Every live channel waits for
  // its server details so a Premium requirement cannot be bypassed.
  const streamDetailsLoaded = isDemo || !!stream;
  const hasAdmission = admitted || stream?.viewerAdmitted === true;
  const accessRestricted = restrictedByEvent || !!stream?.viewerRemoved || !!stream?.viewerBlocked;
  useEffect(() => { setRestrictedByEvent(false); }, [channelId]);
  useEffect(() => {
    if (stream) setRestrictedByEvent(!!stream.viewerRemoved || !!stream.viewerBlocked);
  }, [stream]);
  const canEnterStream = !accessRestricted && streamDetailsLoaded && (!requiresAdmission || hasAdmission);
  const { data: privateInvitationData } = useGetPrivateStreamInvitation(
    privateInvitationIdNumber,
    {
      query: {
        enabled: isPrivateStream,
        refetchInterval: 1000,
      } as any,
    },
  );

  useEffect(() => {
    streamEndedRef.current = false;
    slideAnim.setValue(0);
    overlaySlideAnim.setValue(0);
    setOverlaysHidden(false);
    setIsTransitioning(false);
    setStreamEnded(false);
    setCountdown(10);
    setAdmitted(false);
    setAdmissionError(null);
    admissionKeyRef.current = Crypto.randomUUID();
  }, [channelId]);

  useEffect(() => {
    if (!isPrivateStream || !privateInvitationData?.invitation) return;
    if (privateInvitationData.invitation.status !== "active") {
      streamEndedRef.current = true;
      setStreamEnded(true);
    }
  }, [isPrivateStream, privateInvitationData]);

  useFocusEffect(useCallback(() => {
    if (!channelId || isDemo || !user?.uid || !canEnterStream) return;
    const refresh = () => void updateStreamPresence(channelId, { action: "join" }).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      clearInterval(timer);
      void updateStreamPresence(channelId, { action: "leave" }).catch(() => {});
    };
  }, [channelId, isDemo, user?.uid, canEnterStream]));

  // Poll real chat for non-demo streams
  const { data: chatPollData } = useGetStreamChat(channelId ?? "", undefined, {
    query: { enabled: !!channelId && !isDemo, refetchInterval: 1000 } as any,
  });

  useEffect(() => {
    if (!chatPollData?.messages) return;
    setMessages((prev) => {
      const deleted = new Set(chatPollData.deletedIds ?? []);
      const retained = prev.filter(m => !deleted.has(m.id));
      const existingIds = new Set(retained.map((m) => m.id));
      const next = chatPollData.messages
        .filter((m) => !existingIds.has(m.id))
        .map((m) => ({ id: m.id, sender: m.senderName, senderUid: m.senderUid, text: m.text, color: m.color }));
      if (next.length === 0 && retained.length === prev.length) return prev;
      return [...retained, ...next].slice(-100);
    });
  }, [chatPollData]);

  // Parse hostUid directly from channelId (format: pulse-{uid}-{timestamp})
  // so we always have it even if the HTTP stream fetch returns 404
  const hostUidFromChannel = React.useMemo(() => {
    if (!channelId) return null;
    const parts = channelId.split("-");
    const parsed = parseInt(parts[1] ?? "", 10);
    return isNaN(parsed) ? null : parsed;
  }, [channelId]);

  const hostUid = stream?.hostUid ?? hostUidFromChannel;
  const isOwnStream = !!user?.uid && user.uid === hostUid;
  const partyState = useLiveParty(channelId ?? "", isNative && !isPrivateStream && !isDemo && canEnterStream && !streamEnded);
  const party = partyState.party;
  const vsActive = battleUsesSplitLayout(party?.battle?.status === "active" && (party.battle.endsAt ?? 0) > partyState.now);
  const vsChatHeight = partyLayout(SCREEN_W, SCREEN_H, insets.top, insets.bottom).chatHeight;
  const partyMedia = usePartyMedia(engineRef, channelId ?? "", party, isNative && joined && canEnterStream && !streamEnded, false);
  const partyViewerCount = party?.status === "active" ? party.viewerCount : stream?.viewerCount;
  const [giftRecipientUid, setGiftRecipientUid] = useState<number | undefined>(undefined);
  useEffect(() => { setGiftRecipientUid(hostUid ?? undefined); }, [hostUid, party?.id]);
  const giftRecipient = party?.status === "active" ? party.participants.find(p => p.uid === giftRecipientUid) : undefined;

  const AVATAR_COLORS = ["#FF1966","#7B2FFF","#FF6B35","#00C2A8","#FFB800","#0095FF"];
  const hostInitials = (stream?.hostName ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const hostAvatarColor = AVATAR_COLORS[
    (stream?.hostName ?? "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_COLORS.length
  ]!;

  // Coins earned by the streamer during this specific live (filtered by channelId)
  const streamEarningsQuery = useGetStreamEarnings(channelId ?? "", {
    query: { enabled: !!channelId && !isDemo, refetchInterval: 30000 } as any,
  });
  const [realtimeCoins, setRealtimeCoins] = useState<number | null>(null);
  const hostCoins = Math.max(realtimeCoins ?? 0, streamEarningsQuery.data?.coins ?? 0);
  useEffect(() => { setRealtimeCoins(null); }, [channelId]);
  const { data: followStatusData, refetch: refetchFollow } = useGetFollowStatus(
    hostUid ?? 0,
    { followerUid: user?.uid ?? 0 },
    { query: { enabled: !!hostUid && !!user?.uid && !isOwnStream } as any },
  );
  const isFollowing = followStatusData?.isFollowing ?? false;
  const followMutation = useFollowUser();
  const unfollowMutation = useUnfollowUser();

  const toggleFollow = () => {
    if (!hostUid || !user?.uid) return;
    if (isFollowing) {
      unfollowMutation.mutate(
        { uid: hostUid, data: { followerUid: user.uid } },
        { onSuccess: () => { refetchFollow(); } },
      );
    } else {
      followMutation.mutate(
        { uid: hostUid, data: { followerUid: user.uid } },
        {
          onSuccess: () => {
            refetchFollow();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      );
    }
  };

  // Fetch the full stream list so we know prev/next
  const { data: allStreamsData } = useListStreams({
    query: { refetchInterval: 10000 } as any,
  });
  const allStreams = allStreamsData?.streams ?? [];
  const currentIndex = allStreams.findIndex((s) => s.channelId === channelId);
  const nextStream = currentIndex >= 0 && currentIndex < allStreams.length - 1
    ? allStreams[currentIndex + 1]
    : null;
  const prevStream = currentIndex > 0 ? allStreams[currentIndex - 1] : null;
  // The list is already cached when swiping, before the destination detail query resolves.
  const backgroundImageUrl = stream?.hostBackgroundImageUrl
    ?? allStreams.find((item) => item.channelId === channelId)?.hostBackgroundImageUrl
    ?? privateInvitationData?.invitation?.backgroundImageUrl;

  useEffect(() => {
    const urls = [backgroundImageUrl, nextStream?.hostBackgroundImageUrl, prevStream?.hostBackgroundImageUrl];
    for (const url of new Set(urls)) {
      if (url) void Image.prefetch(url).catch(() => {});
    }
  }, [backgroundImageUrl, nextStream?.hostBackgroundImageUrl, prevStream?.hostBackgroundImageUrl]);


  const generateToken = useGenerateAgoraToken();
  const updateViewers = useUpdateViewerCount();

  const confirmAdmission = async () => {
    if (!channelId || admitted) return;
    setAdmissionError(null);
    try {
      const result = await admitToStream.mutateAsync({
        channelId,
        data: { idempotencyKey: admissionKeyRef.current },
      });
      if (!result.admitted) {
        setAdmissionError("Admission could not be confirmed. Please try again.");
        return;
      }
      if (user?.uid) {
        queryClient.setQueryData(
          getGetCoinBalanceQueryKey({ uid: user.uid }),
          { balance: result.balance },
        );
      }
      setAdmitted(true);
      void streamEarningsQuery.refetch();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setAdmissionError(
        message || "You need more coins for this entry gift. Top up and try again.",
      );
    }
  };

  // Show swipe-up hint briefly when a next stream is available
  useEffect(() => {
    if (!nextStream) return;
    const timeout = setTimeout(() => {
      Animated.sequence([
        Animated.timing(hintOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(1800),
        Animated.timing(hintOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    }, 1500);
    return () => clearTimeout(timeout);
  }, [channelId, nextStream, hintOpacity]);

  // Helper: spawn a floating gift on screen
  const spawnGift = (gift: Gift, senderName: string, giftId?: string, amount = gift.coins) => {
    const nativeExpected = !isDemo && expectsNativeCrown(gift.name, amount);
    if (giftId && !giftPresentation.current.claim(giftId, nativeExpected)) return;
    const inVideo = giftId ? giftPresentation.current.inVideo(giftId) : nativeExpected;
    const x = Math.random() * (SCREEN_W * 0.55) + 16;
    setFloatingGifts((prev) => giftId && prev.some(g => g.id === giftId) ? prev : [
      ...prev,
      { id: giftId ?? `${Date.now()}-${Math.random()}`, emoji: gift.emoji, name: gift.name, senderName, x, size: gift.size, inVideo },
    ]);
  };

  // Simulate other viewers sending gifts occasionally — demo streams only
  useEffect(() => {
    if (!isDemo) return;
    const names = ["neon_fox", "cosmic_ray", "techwave", "vibe_check", "l33tcode"];
    const interval = setInterval(() => {
      if (Math.random() < 0.35) {
        const gift = GIFTS[Math.floor(Math.random() * 4)]!;
        const sender = names[Math.floor(Math.random() * names.length)]!;
        spawnGift(gift, sender);
      }
    }, 4500);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SCREEN_W, isDemo]);

  // Simulate live chat — demo streams only
  useEffect(() => {
    if (!isDemo) return;
    const interval = setInterval(() => {
      const sender = VIEWER_NAMES[Math.floor(Math.random() * VIEWER_NAMES.length)]!;
      const text   = CHAT_POOL[Math.floor(Math.random() * CHAT_POOL.length)]!;
      const color  = COLORS[Math.floor(Math.random() * COLORS.length)]!;
      setMessages((prev) => [...prev.slice(-40), { id: Date.now().toString(), sender, text, color }]);
    }, 2200);
    return () => clearInterval(interval);
  }, [isDemo]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages]);

  useStreamSocket({
    channelId: channelId ?? "",
    enabled: !!channelId && !isDemo && !accessRestricted,
    onConnect: () => {
      void streamEarningsQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: getGetStreamQueryKey(channelId ?? "") });
    },
    onMessage: event => {
        try {
          const msg = JSON.parse(String(event.data)) as {
            type?: string;
            coins?: number;
            giftName?: string;
            giftId?: string;
            amount?: number;
            inVideo?: boolean;
            senderName?: string;
          };
          if (msg.type === "gift_in_video" && msg.giftId) {
            const inVideo = giftPresentation.current.decide(msg.giftId, msg.inVideo !== false);
            setFloatingGifts(prev => prev.map(g => g.id === msg.giftId ? { ...g, inVideo } : g));
          } else if (msg.type === "stream_restricted") {
            setRestrictedByEvent(true);
            void queryClient.invalidateQueries({ queryKey: getGetStreamQueryKey(channelId ?? "") });
          } else if (msg.type === "stream_updated") {
            void queryClient.invalidateQueries({ queryKey: getGetStreamQueryKey(channelId ?? "") });
          } else if (msg.type === "stream_ended") {
            streamEndedRef.current = true;
            setStreamEnded(true);
          } else if (msg.type === "earnings" && typeof msg.coins === "number") {
            setRealtimeCoins(previous => Math.max(previous ?? 0, msg.coins!));
          } else if (msg.type === "gift" && msg.giftName) {
            if (typeof msg.coins === "number") setRealtimeCoins(previous => Math.max(previous ?? 0, msg.coins!));
            const gift = GIFTS.find((g) => g.name === msg.giftName);
            if (gift) spawnGift(gift, msg.senderName ?? "Viewer", msg.giftId, msg.amount ?? gift.coins);
          }
        } catch { /* ignore */ }
    },
  });

  // Countdown + auto-navigate when stream ends
  useEffect(() => {
    if (!streamEnded || isDemo) return;
    const engine = engineRef.current;
    engineRef.current = null;
    try { engine?.leaveChannel?.(); } catch (error) {
      console.warn("[Agora viewer] leave-on-end error:", error);
    }
    try { engine?.release?.(); } catch (error) {
      console.warn("[Agora viewer] release-on-end error:", error);
    }
    setJoined(false);
    setRemoteUid(null);
    setRemoteVideoReady(false);
  }, [streamEnded, isDemo]);

  useEffect(() => {
    if (!streamEnded) return;
    if (countdown <= 0) { router.back(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [streamEnded, countdown, router]);

  // Join Agora channel on native
  useEffect(() => {
    if (!channelId || !isNative || !canEnterStream) return;
    let didUnmount = false;
    const setup = async () => {
      let engine: any = null;
      const setupIsCancelled = () => didUnmount || streamEndedRef.current;
      const releaseSetupEngine = () => {
        if (!engine) return;
        if (engineRef.current !== engine) {
          engine = null;
          return;
        }
        engineRef.current = null;
        try { engine.leaveChannel?.(); } catch (_error) {}
        try { engine.release?.(); } catch (_error) {}
        engine = null;
      };
      try {
        if (setupIsCancelled()) return;
        setJoined(false);
        setRemoteUid(null);
        setRemoteVideoReady(false);
        setAgoraError(null);
        engine = createEngine();
        if (!engine) throw new Error("This development build does not include the Agora video module.");
        engineRef.current = engine;
        const appId = process.env["EXPO_PUBLIC_AGORA_APP_ID"] ?? "";
        if (!appId) throw new Error("Agora App ID is missing.");
        const initializeResult = engine.initialize({
          appId,
          channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
        });
        if (initializeResult < 0) throw new Error(`Agora initialization failed (${initializeResult}).`);
        const videoResult = engine.enableVideo();
        const audioResult = engine.enableAudio();
        if (videoResult < 0 || audioResult < 0) {
          throw new Error(`Agora media setup failed (${videoResult}, ${audioResult}).`);
        }
        engine.registerEventHandler({
          onError: (err: number, msg: string) => {
            console.warn("[Agora viewer] onError:", err, msg);
            if (!didUnmount) setAgoraError(`Live video error ${err}: ${msg || "Unknown Agora error"}`);
          },
          onJoinChannelSuccess: (connection: any, elapsed: number) => {
            if (connection?.channelId !== primaryRtcChannelRef.current) return;
            console.log("[Agora viewer] joined:", connection?.channelId, elapsed);
            if (!didUnmount) {
              setJoined(true);
              setAgoraError(null);
            }
          },
          onConnectionStateChanged: (connection: any, state: number, reason: number) => {
            if (connection?.channelId !== primaryRtcChannelRef.current) return;
            console.log(
              "[Agora viewer] connectionState channel:",
              connection?.channelId,
              "state:",
              state,
              "reason:",
              reason,
            );
            if (!didUnmount && state === 5) {
              setAgoraError(`Could not connect to the live stream (reason ${reason}).`);
            }
          },
          onUserJoined: (_connection: any, uid: number, elapsed: number) => {
            if (_connection?.channelId !== primaryRtcChannelRef.current) return;
            console.log("[Agora viewer] onUserJoined uid:", uid, "elapsed:", elapsed);
            if (!didUnmount) setRemoteUid(uid);
          },
          onRemoteVideoStateChanged: (
            _connection: any,
            uid: number,
            state: number,
            reason: number,
            elapsed: number,
          ) => {
            if (_connection?.channelId !== primaryRtcChannelRef.current) return;
            console.log(
              "[Agora viewer] remoteVideoState uid:",
              uid,
              "state:",
              state,
              "reason:",
              reason,
              "elapsed:",
              elapsed,
            );
            if (didUnmount) return;
            setRemoteUid(uid);
            if (state === 2) {
              setRemoteVideoReady(true);
              setAgoraError(null);
            } else if (state === 0 || state === 4) {
              setRemoteVideoReady(false);
              if (state === 4) {
                setAgoraError(`The host video could not be decoded (reason ${reason}).`);
              }
            }
          },
          onFirstRemoteVideoFrame: (
            _connection: any,
            uid: number,
            width: number,
            height: number,
            elapsed: number,
          ) => {
            if (_connection?.channelId !== primaryRtcChannelRef.current) return;
            console.log(
              "[Agora viewer] firstRemoteVideoFrame uid:",
              uid,
              "size:",
              `${width}x${height}`,
              "elapsed:",
              elapsed,
            );
            if (!didUnmount) {
              setRemoteUid(uid);
              setRemoteVideoReady(true);
              setAgoraError(null);
            }
          },
          onUserOffline: (_conn: any, uid: number, reason: number) => {
            if (_conn?.channelId !== primaryRtcChannelRef.current) return;
            console.log("[Agora viewer] onUserOffline uid:", uid, "reason:", reason);
            if (!didUnmount) {
              setRemoteUid(null);
              setRemoteVideoReady(false);
            }
          },
        });
        const tokenData = await generateToken.mutateAsync({
          data: { channelName: channelId, uid: user?.uid ?? 0, role: "audience" },
        });
        if (setupIsCancelled() || engineRef.current !== engine) {
          releaseSetupEngine();
          return;
        }
        primaryRtcChannelRef.current = tokenData.channelName;
        const joinResult = engine.joinChannel(tokenData.token, tokenData.channelName, user?.uid ?? 0, {
          clientRoleType: ClientRoleType.ClientRoleAudience,
          autoSubscribeAudio: true,
          autoSubscribeVideo: true,
        });
        console.log("[Agora viewer] joinChannel result:", joinResult, "channel:", channelId);
        if (joinResult < 0) throw new Error(`Could not join the live stream (${joinResult}).`);
        // Explicitly unmute remote streams — Agora v4 can default to muted
        const videoUnmuteResult = engine.muteAllRemoteVideoStreams(false);
        const audioUnmuteResult = engine.muteAllRemoteAudioStreams(false);
        console.log(
          "[Agora viewer] remote unmute results video:",
          videoUnmuteResult,
          "audio:",
          audioUnmuteResult,
        );
        console.log("[Agora viewer] joined and unmuted remote streams");
        updateViewers.mutate({ channelId, data: { action: "join" } });
      } catch (e) {
        console.warn("[Agora viewer] setup error:", e);
        releaseSetupEngine();
        if (!setupIsCancelled()) {
          setAgoraError(e instanceof Error ? e.message : "Could not start live video.");
        }
      }
    };

    setup();
    return () => {
      didUnmount = true;
      const engine = engineRef.current;
      engineRef.current = null;
      try { engine?.leaveChannel?.(); } catch (_error) {}
      try { engine?.release?.(); } catch (_error) {}
      try { updateViewers.mutate({ channelId, data: { action: "leave" } }); } catch (_e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, canEnterStream, stream?.rtcChannelName]);

  // Once joined, pre-set the remote uid from the known host uid so the
  // RtcTextureView mounts immediately — don't wait for onUserPublished
  // (which can fire before React has a chance to mount the view).
  useEffect(() => {
    if (joined && hostUid != null && remoteUid === null) {
      console.log("[Agora viewer] pre-setting remoteUid from hostUid:", hostUid);
      setRemoteUid(hostUid);
    }
  }, [joined, hostUid, remoteUid]);

  const navigateToStream = (targetChannelId: string, direction: "up" | "down") => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const exitValue = direction === "up" ? -SCREEN_H : SCREEN_H;
    const entryStart = direction === "up" ? SCREEN_H : -SCREEN_H;
    const targetStream = allStreams.find((s) => s.channelId === targetChannelId);

    transitionAnim.setValue(entryStart);
    setTransitionBackground({
      imageUrl: targetStream?.hostBackgroundImageUrl,
      demo: targetChannelId.endsWith("-demo"),
      category: targetStream?.category,
    });
    setIsTransitioning(true);

    Animated.parallel([
      Animated.timing(slideAnim, { toValue: exitValue, duration: 320, useNativeDriver: true }),
      Animated.timing(transitionAnim, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start(() => {
      isNavigatingRef.current = false;
      // Keep the incoming image covering the screen until navigation completes.
      router.replace(`/stream/${targetChannelId}` as any);
    });
  };

  // Horizontal swipes clear/restore the UI; vertical swipes switch streams.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Capture horizontal swipes even over chat, without taking its vertical scrolling.
      onMoveShouldSetPanResponderCapture: (_evt, gs) =>
        !partyWindowTouchRef.current && Math.abs(gs.dx) > 15 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.2,
      onMoveShouldSetPanResponder: (_evt, gs) =>
        !partyWindowTouchRef.current && Math.max(Math.abs(gs.dx), Math.abs(gs.dy)) > 15,
      onPanResponderRelease: (_evt, gs) => {
        if (Math.abs(gs.dx) > Math.abs(gs.dy)) {
          if (Math.abs(gs.dx) > 60) horizontalSwipeRef.current(gs.dx > 0);
          return;
        }
        if (gs.dy < -60) {
          // Swipe up — go to next stream
          // Access via closure; use refs to avoid stale state
          swipeUpRef.current();
        } else if (gs.dy > 60) {
          // Swipe down — go to previous stream or back
          swipeDownRef.current();
        }
      },
    }),
  ).current;

  // Keep swipe callbacks in refs so PanResponder can access latest state
  const swipeUpRef = useRef<() => void>(() => {});
  const swipeDownRef = useRef<() => void>(() => {});

  useEffect(() => {
    swipeUpRef.current = () => {
      if (nextStream) {
        navigateToStream(nextStream.channelId, "up");
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    };
    swipeDownRef.current = () => {
      if (prevStream) {
        navigateToStream(prevStream.channelId, "down");
      } else {
        router.back();
      }
    };
  });

  const sendMessage = () => {
    if (stream?.viewerMuted || accessRestricted) return;
    const text = inputText.trim();
    if (!text) return;
    setInputText("");
    Haptics.selectionAsync();
    if (channelId && !isDemo) {
      const senderName = user?.name ?? "Viewer";
      sendChatMutation.mutateAsync({
        channelId,
        data: { senderName, text, color: "#FF1966" },
      }).then((data) => {
    setMessages((prev) => {
          if (prev.some((message) => message.id === data.message.id)) return prev;
          return [
            ...prev,
            {
              id: data.message.id,
              sender: data.message.senderName,
              senderUid: data.message.senderUid,
              text: data.message.text,
              color: data.message.color,
            },
          ].slice(-100);
        });
        void queryClient.invalidateQueries({ queryKey: getGetStreamChatQueryKey(channelId) });
      }).catch(error => {
        Alert.alert(t("Message not sent"), error instanceof Error ? error.message : t("Check your connection and try again."));
      });
    }
  };

  const topPad    = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = keyboardVisible ? 0 : Platform.OS === "web" ? 34 : insets.bottom;

  const VideoView = RtcSurfaceViewComponent;
  const showNativeVideo = isNative && joined && remoteUid !== null && VideoView;

  if (accessRestricted) {
    return <View style={[styles.endedScreen, { padding: 24 }]}>
      <Ionicons name="lock-closed-outline" size={40} color="#FFF" />
      <Text style={[localizedTextStyle(), styles.endedTitle]}>{stream?.viewerBlocked ? t("Blocked from this creator's streams") : t("Removed from this stream")}</Text>
      <TouchableOpacity onPress={() => router.back()} style={{ padding: 16 }}><Text style={[localizedTextStyle(), { color: "#FF1966", fontSize: 16 }]}>{t("Back to streams")}</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => setShowReport(true)} style={{ padding: 12 }}><Text style={[localizedTextStyle(), { color: "#AAA" }]}>{t("Report stream")}</Text></TouchableOpacity>
      {showReport ? <ReportStreamSheet channelId={channelId ?? ""} onClose={() => setShowReport(false)} /> : null}
    </View>;
  }

  if (streamEnded) {
    return (
      <View style={styles.endedScreen}>
        <View style={styles.endedCard}>
          <Text style={[localizedTextStyle(), styles.endedTitle]}>{t("Stream has ended")}</Text>
          <Text style={styles.endedCountdown}>{countdown}</Text>
          <Text style={[localizedTextStyle(), styles.endedSub]}>
            {isPrivateStream ? t("Returning to chat…") : t("Returning to streams…")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: "#000", transform: [{ translateY: slideAnim }] }]}
      {...panResponder.panHandlers}
    >
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
      automaticOffset
    >
      {/* Full-screen video area */}
      <PartyStage channelId={channelId ?? ""} mainName={stream?.hostName ?? "Host"} party={party} now={partyState.now} media={partyMedia} onWindowInteraction={active => { partyWindowTouchRef.current = active; }} onPartnerDoubleTap={target => navigateToStream(target, "up")} main={<>
        {!canEnterStream ? (
          <View style={styles.admissionBlocked}>
            <StreamBackdrop imageUrl={backgroundImageUrl} />
            <ActivityIndicator color="#FFF" />
            <Text style={[localizedTextStyle(), styles.nativeVideoStatusText]}>{t("Loading stream details…")}</Text>
          </View>
        ) : streamEnded ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]} />
        ) : isDemo ? (
          <DemoVideo category={stream?.category} />
        ) : showNativeVideo && VideoView ? (
          <>
            <VideoView
              canvas={{ uid: remoteUid!, sourceType: VideoSourceType.VideoSourceRemote }}
              style={StyleSheet.absoluteFill}
            />
            {!remoteVideoReady ? (
              <View style={styles.nativeVideoStatus}>
                <StreamBackdrop imageUrl={backgroundImageUrl} />
                <ActivityIndicator color="#FFF" />
                <Text style={[localizedTextStyle(), styles.nativeVideoStatusText]}>{t("Waiting for host video…")}</Text>
              </View>
            ) : null}
          </>
        ) : isNative ? (
          <View style={styles.nativeVideoStatus}>
            <StreamBackdrop imageUrl={backgroundImageUrl} />
            {agoraError ? (
              <Ionicons name="warning-outline" size={36} color="#FF6B6B" />
            ) : (
              <ActivityIndicator color="#FFF" />
            )}
            <Text style={[localizedTextStyle(), styles.nativeVideoStatusText]}>
              {agoraError ?? (joined ? t("Waiting for host video…") : t("Connecting to live video…"))}
            </Text>
          </View>
        ) : (
          <StreamBackdrop imageUrl={backgroundImageUrl} />
        )}
      </>} />

      {/* Overlay UI */}
      <Animated.View
        style={[
          styles.overlay,
          { paddingTop: topPad + 8, paddingBottom: bottomPad + 8,
            transform: [{ translateX: overlaySlideAnim }] },
        ]}
        pointerEvents={overlaysHidden ? "none" : "box-none"}
        accessibilityElementsHidden={overlaysHidden}
        importantForAccessibility={overlaysHidden ? "no-hide-descendants" : "auto"}
      >
        {/* Top bar */}
        <View style={styles.topBar} pointerEvents="auto">
          <View style={styles.backBtn}>
            <TouchableOpacity
              onPress={() => hostUid ? router.push(`/profile/${hostUid}`) : undefined}
              activeOpacity={0.8}
            >
              <View style={[styles.avatarCircle, { backgroundColor: hostAvatarColor }]}>
                <Text style={styles.avatarInitials}>{hostInitials}</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.streamMeta}>
            {stream && (
              <Text style={styles.hostName}>{stream.hostName}</Text>
            )}
          </View>

          <TouchableOpacity style={styles.statsRow} onPress={() => setShowLeaderboard(true)} activeOpacity={0.75}>
            <Text style={styles.coinEmoji}>🪙</Text>
            <Text style={styles.statsText}>{hostCoins.toLocaleString(appLocale())}</Text>
            <View style={styles.statsDivider} />
            <Ionicons name="eye" size={12} color="#FFF" />
            <Text style={styles.statsText}>
              {partyViewerCount != null
                ? partyViewerCount >= 1000
                  ? `${(partyViewerCount / 1000).toFixed(1)}K`
                  : partyViewerCount
                : "—"}
            </Text>
          </TouchableOpacity>
        </View>


        {/* Middle spacer — swipe gestures pass through here */}
        <View style={styles.swipeZone} pointerEvents="none">
          {/* Swipe-up hint */}
          {nextStream && (
            <Animated.View style={[styles.swipeHint, { opacity: hintOpacity }]}>
              <Ionicons name="chevron-up" size={18} color="rgba(255,255,255,0.7)" />
              <Text style={styles.swipeHintText}>
                {nextStream.hostName}
              </Text>
            </Animated.View>
          )}
        </View>

        {/* Live chat */}
        <View style={[styles.chatArea, vsActive && { maxHeight: keyboardVisible ? 0 : vsChatHeight, overflow: "hidden" }]} pointerEvents="box-none">
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.chatList}
            showsVerticalScrollIndicator={false}
            style={styles.chatScroll}
            renderItem={({ item }) => (
              <View style={styles.chatBubble}>
                <Text style={[styles.chatSender, { color: item.color }]}>
                  {item.sender}:{" "}
                </Text>
                <TranslatedMessage text={item.text} messageId={item.id} kind="live" channelId={channelId} incoming={item.senderUid !== undefined && item.senderUid !== user?.uid} style={styles.chatText} />
              </View>
            )}
          />
        </View>

        {/* Bottom actions */}
        <View style={styles.bottomBar} pointerEvents="auto">
          <TextInput
            style={styles.chatInput}
            value={inputText}
            onChangeText={setInputText}
            editable={!stream?.viewerMuted}
            placeholder={stream?.viewerMuted ? t("Chat muted by host") : t("Say something…")}
            placeholderTextColor="rgba(255,255,255,0.45)"
            onSubmitEditing={sendMessage}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          {!isOwnStream && (
            <TouchableOpacity
              style={[styles.followBtn, isFollowing && styles.followBtnActive]}
              onPress={isFollowing
                ? () => router.push({ pathname: "/dm/[peerId]", params: { peerId: String(hostUid ?? ""), peerName: stream?.hostName ?? "" } })
                : toggleFollow
              }
              activeOpacity={0.75}
              disabled={!isFollowing && (followMutation.isPending || unfollowMutation.isPending)}
            >
              <Ionicons
                name={isFollowing ? "chatbubble-ellipses" : "add"}
                size={isFollowing ? 19 : 22}
                color="#FFF"
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.actionBtn}
            activeOpacity={0.7}
            onPress={() => {
              setShowGiftPicker(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Ionicons name="gift-outline" size={24} color="#FFD700" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowKebabMenu(true);
            }}
          >
            <Ionicons name="ellipsis-vertical" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
    </Animated.View>

    {/* Floating gifts follow the UI while continuing their normal lifecycle. */}
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ translateX: overlaySlideAnim }] }]}>
    {floatingGifts.map((fg) => (
      <GiftFloater
        key={fg.id}
        gift={fg}
        onDone={(id) => setFloatingGifts((prev) => prev.filter((g) => g.id !== id))}
      />
    ))}
    </Animated.View>

    {/* Gift picker */}
    <GiftPicker
      visible={showGiftPicker}
      coins={viewerCoins}
      recipients={party?.status === "active" ? party.participants : undefined}
      recipientUid={giftRecipient?.uid ?? hostUid ?? undefined}
      onRecipientChange={setGiftRecipientUid}
      onClose={() => setShowGiftPicker(false)}
      onSend={(gift) => {
        if (!user?.uid) return;
        setShowGiftPicker(false);
        const giftId = createGiftRequestKey();
        spendMutation.mutate(
           { data: { uid: user.uid, recipientUid: giftRecipient?.uid ?? hostUid ?? undefined, amount: gift.coins, giftName: gift.name, senderName: user.name ?? "Viewer", channelId: giftRecipient?.channelId ?? channelId ?? undefined, description: gift.name, idempotencyKey: giftId } },
          {
            onSuccess: (data) => {
              // Update viewer's own balance in cache
              queryClient.setQueryData(
                getGetCoinBalanceQueryKey({ uid: user.uid }),
                { balance: data.balance },
              );
              // Invalidate host balance so the stats row reflects the credit
              queryClient.invalidateQueries({
                queryKey: getGetCoinBalanceQueryKey({ uid: giftRecipient?.uid ?? hostUid ?? 0 }),
              });
              spawnGift(gift, giftRecipient ? `${user.name ?? "You"} to ${giftRecipient.name}` : user.name ?? "You", giftId);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            },
            onError: () => {
              Alert.alert(t("Gift not sent"), t("Check your coin balance and that the selected host is still live."));
            },
          },
        );
      }}
    />

    {/* Keep both native Agora and the web demo hidden until a Premium admission
        has been explicitly confirmed. */}
    <Modal
      transparent
      visible={requiresAdmission && !hasAdmission}
      animationType="fade"
      onRequestClose={() => router.back()}
      statusBarTranslucent
    >
      <View style={styles.admissionBackdrop}>
        <View style={styles.admissionCard}>
          <View style={styles.admissionIcon}>
            <Ionicons name="lock-closed" size={20} color="#FFD700" />
          </View>
          <Text style={[localizedTextStyle(), styles.admissionTitle]}>{t("Premium live")}</Text>
          <Text style={[localizedTextStyle(), styles.admissionHost]}>{stream?.hostName ?? t("Host")} · {stream?.title ?? t("Live stream")}</Text>
          <View style={styles.admissionGift}>
            {stream?.requiredGift?.name === "Crown" ? <CrownArtwork size={30} /> : <Text style={styles.admissionGiftEmoji}>{stream?.requiredGift?.emoji}</Text>}
            <View>
              <Text style={styles.admissionGiftName}>{stream?.requiredGift?.name}</Text>
              <Text style={[localizedTextStyle(), styles.admissionGiftCost]}>{t("Entry gift · 🪙 {v0}", { v0: stream?.requiredGift?.coinCost })}</Text>
            </View>
          </View>
          <Text style={[localizedTextStyle(), styles.admissionBalance]}>{t("Your balance: 🪙 {v0}", { v0: viewerCoins.toLocaleString(appLocale()) })}</Text>
          {admissionError ? <Text style={styles.admissionError}>{t(admissionError)}</Text> : null}
          <TouchableOpacity
            testID="premium-admission-confirm"
            style={[styles.admissionConfirm, admitToStream.isPending && styles.admissionConfirmDisabled]}
            onPress={() => void confirmAdmission()}
            disabled={admitToStream.isPending}
            activeOpacity={0.85}
          >
            {admitToStream.isPending ? <ActivityIndicator color="#111118" /> : <Text style={[localizedTextStyle(), styles.admissionConfirmText]}>{t("Send gift & enter")}</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            testID="premium-admission-cancel"
            style={styles.admissionCancel}
            onPress={() => router.back()}
            disabled={admitToStream.isPending}
            activeOpacity={0.75}
          >
            <Text style={[localizedTextStyle(), styles.admissionCancelText]}>{t("Not now")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

    {/* Incoming stream overlay — slides in simultaneously with current screen sliding out */}
    {isTransitioning && (
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ translateY: transitionAnim }] }]}
        pointerEvents="none"
      >
        <StreamBackdrop {...transitionBackground} />
      </Animated.View>
    )}
    {showReport ? <ReportStreamSheet channelId={channelId ?? ""} onClose={() => setShowReport(false)} /> : null}
    {/* Kebab menu */}
    <Modal
      transparent
      visible={showKebabMenu}
      animationType="fade"
      onRequestClose={() => setShowKebabMenu(false)}
    >
      <TouchableWithoutFeedback onPress={() => setShowKebabMenu(false)}>
        <View style={styles.kebabBackdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.kebabMenu}>
              <TranslationToggle menu />
              <View style={styles.kebabDivider} />
              <TouchableOpacity
                style={styles.kebabItem}
                activeOpacity={0.7}
                onPress={() => {
                  setShowKebabMenu(false);
                  const domain = process.env["EXPO_PUBLIC_DOMAIN"] ?? "pulse.app";
                  Share.share({
                    title: stream ? `${stream.hostName} is live on Pulse` : "Watch live on Pulse",
                    message: stream
                      ? `🔴 ${stream.hostName} is streaming "${stream.title}" on Pulse!\nhttps://${domain}/stream/${channelId}`
                      : `Watch live streams on Pulse!\nhttps://${domain}`,
                  });
                }}
              >
                <Ionicons name="share-outline" size={20} color="#FFF" />
                <Text style={[localizedTextStyle(), styles.kebabItemText]}>{t("Share")}</Text>
              </TouchableOpacity>
              <View style={styles.kebabDivider} />
              <TouchableOpacity
                style={styles.kebabItem}
                activeOpacity={0.7}
                onPress={() => {
                  setShowKebabMenu(false);
                  if (isDemo) { Alert.alert(t("Demo stream"), t("This is a demo, not a live creator stream.")); return; }
                  setShowReport(true);
                }}
              >
                <Ionicons name="flag-outline" size={20} color="#FF453A" />
                <Text style={[localizedTextStyle(), [styles.kebabItemText, { color: "#FF453A" }]]}>{t("Report")}</Text>
              </TouchableOpacity>
              <View style={styles.kebabDivider} />
              <TouchableOpacity
                style={styles.kebabItem}
                activeOpacity={0.7}
                onPress={() => {
                  setShowKebabMenu(false);
                  router.back();
                }}
              >
                <Ionicons name="exit-outline" size={20} color="#FFF" />
                <Text style={[localizedTextStyle(), styles.kebabItemText]}>{t("Exit Live")}</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>

    <GiftLeaderboard
      channelId={channelId ?? ""}
      visible={showLeaderboard}
      onClose={() => setShowLeaderboard(false)}
    />

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  admissionBlocked: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#000",
  },
  admissionBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.78)",
  },
  admissionCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
    backgroundColor: "#111118",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.38)",
  },
  admissionIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,215,0,0.14)", marginBottom: 10 },
  admissionTitle: { color: "#FFF", fontSize: 21, fontFamily: "Inter_700Bold" },
  admissionHost: { color: "rgba(255,255,255,0.62)", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 6 },
  admissionGift: { width: "100%", flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", padding: 12, marginTop: 18 },
  admissionGiftEmoji: { fontSize: 30 },
  admissionGiftName: { color: "#FFF", fontSize: 15, fontFamily: "Inter_700Bold" },
  admissionGiftCost: { color: "#FFD700", fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  admissionBalance: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 15 },
  admissionError: { color: "#FF6B6B", fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center", lineHeight: 17, marginTop: 10 },
  admissionConfirm: { width: "100%", alignItems: "center", borderRadius: 14, paddingVertical: 13, backgroundColor: "#FFD700", marginTop: 18 },
  admissionConfirmDisabled: { opacity: 0.65 },
  admissionConfirmText: { color: "#111118", fontSize: 14, fontFamily: "Inter_700Bold" },
  admissionCancel: { paddingVertical: 12, paddingHorizontal: 20, marginTop: 3 },
  admissionCancelText: { color: "rgba(255,255,255,0.62)", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  videoOverlay: {
    backgroundColor: "transparent",
    opacity: 0.4,
  },
  nativeVideoStatus: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#000",
    paddingHorizontal: 32,
  },
  nativeVideoStatusText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
    textAlign: "center",
  },
  videoCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  videoInitials: {
    fontSize: 72,
    fontWeight: "800",
    color: "rgba(255,255,255,0.2)",
    fontFamily: "Inter_700Bold",
    letterSpacing: 4,
  },
  overlay: {
    flex: 1,
    flexDirection: "column",
    paddingHorizontal: 14,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
  },
  avatarInitials: {
    color: "#FFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  avatarChevron: {
    position: "absolute",
    bottom: -3,
    right: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  streamMeta: { flex: 1 },
  hostName: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statsText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  coinEmoji: {
    fontSize: 12,
    lineHeight: 15,
  },
  statsDivider: {
    width: 1,
    height: 10,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginHorizontal: 2,
  },
  streamTitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginBottom: 4,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  swipeZone: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 12,
  },
  swipeHint: {
    alignItems: "center",
    gap: 4,
  },
  swipeHintText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
  },
  chatArea: { justifyContent: "flex-end" },
  chatScroll: { maxHeight: 240 },
  chatList: { gap: 5, paddingBottom: 4 },
  chatBubble: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "rgba(0,0,0,0.42)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
    maxWidth: "60%",
  },
  chatSender: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Inter_600SemiBold",
  },
  chatText: {
    color: "#FFF",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flexShrink: 1,
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
  },
  chatInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#FFF",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  actionBtn: {
    alignItems: "center",
    gap: 2,
    minWidth: 36,
  },
  followBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FF1966",
    alignItems: "center",
    justifyContent: "center",
  },
  followBtnActive: {
    backgroundColor: "rgba(255,25,102,0.25)",
    borderWidth: 1.5,
    borderColor: "#FF1966",
  },
  kebabBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  kebabMenu: {
    backgroundColor: "#1A1A2E",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  kebabItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  kebabItemText: {
    color: "#FFF",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  kebabDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginHorizontal: 20,
  },
  endedScreen: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  endedCard: {
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  endedTitle: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  endedCountdown: {
    color: "#FF1966",
    fontSize: 64,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    lineHeight: 72,
  },
  endedSub: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});
