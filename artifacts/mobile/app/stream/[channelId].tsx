import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGenerateAgoraToken,
  useGetStream,
  useListStreams,
  useUpdateViewerCount,
  useGetCoinBalance,
  getGetCoinBalanceQueryKey,
  useSpendCoins,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import { GiftPicker, GIFTS, type Gift } from "@/components/GiftPicker";
import { GiftFloater, type FloatingGift } from "@/components/GiftFloater";
import {
  ChannelProfileType,
  ClientRoleType,
  RtcSurfaceViewComponent,
  createEngine,
} from "@/utils/agora";

const isNative = Platform.OS === "ios" || Platform.OS === "android";

interface ChatMsg {
  id: string;
  sender: string;
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

export default function StreamScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const SCREEN_H = Dimensions.get("window").height;
  const SCREEN_W = Dimensions.get("window").width;
  const { user } = useAuth();

  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>(SEED_CHAT);
  const [inputText, setInputText] = useState("");
  const [joined, setJoined] = useState(false);
  const [likeCount, setLikeCount] = useState(Math.floor(Math.random() * 500) + 50);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [floatingGifts, setFloatingGifts] = useState<FloatingGift[]>([]);
  const [streamCoins, setStreamCoins] = useState(0);

  const queryClient = useQueryClient();
  const coinBalanceQuery = useGetCoinBalance(
    { uid: user?.uid ?? 0 },
    { query: { enabled: !!user?.uid, refetchOnWindowFocus: false } as any },
  );
  const coins = coinBalanceQuery.data?.balance ?? 0;
  const spendMutation = useSpendCoins();
  const engineRef = useRef<any>(null);
  const listRef = useRef<FlatList>(null);

  // Slide animation for swipe transitions
  const slideAnim = useRef(new Animated.Value(0)).current;
  // Overlay animation for the incoming stream during transition
  const transitionAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const [transitionCategory, setTransitionCategory] = useState<string | undefined>(undefined);
  const [isTransitioning, setIsTransitioning] = useState(false);
  // Hint arrow fade-in
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const isNavigatingRef = useRef(false);

  const { data: streamData } = useGetStream(channelId ?? "", {
    query: { enabled: !!channelId, refetchInterval: 5000 } as any,
  });
  const stream = streamData?.stream;

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

  const generateToken = useGenerateAgoraToken();
  const updateViewers = useUpdateViewerCount();

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
  const spawnGift = (gift: Gift, senderName: string) => {
    const x = Math.random() * (SCREEN_W * 0.55) + 16;
    setFloatingGifts((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, emoji: gift.emoji, name: gift.name, senderName, x, size: gift.size },
    ]);
    setStreamCoins((c) => c + gift.coins);
  };

  // Simulate other viewers sending gifts occasionally
  useEffect(() => {
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
  }, [SCREEN_W]);

  // Simulate live chat
  useEffect(() => {
    const interval = setInterval(() => {
      const sender = VIEWER_NAMES[Math.floor(Math.random() * VIEWER_NAMES.length)]!;
      const text   = CHAT_POOL[Math.floor(Math.random() * CHAT_POOL.length)]!;
      const color  = COLORS[Math.floor(Math.random() * COLORS.length)]!;
      setMessages((prev) => [...prev.slice(-40), { id: Date.now().toString(), sender, text, color }]);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages]);

  // Join Agora channel on native
  useEffect(() => {
    if (!channelId || !isNative) return;
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
        engine.enableAudio();
        engine.addListener("onUserPublished", (_conn: any, uid: number) => {
          if (!didUnmount) { engine.subscribeVideo(uid, {}); setRemoteUid(uid); }
        });
        engine.addListener("onUserOffline", () => {
          if (!didUnmount) setRemoteUid(null);
        });
        engineRef.current = engine;

        const tokenData = await generateToken.mutateAsync({
          data: { channelName: channelId, uid: user?.uid ?? 0, role: "audience" },
        });
        await engine.joinChannel(tokenData.token, channelId, user?.uid ?? 0, {
          clientRoleType: ClientRoleType.ClientRoleAudience,
          autoSubscribeAudio: true,
          autoSubscribeVideo: true,
        });
        if (!didUnmount) setJoined(true);
        updateViewers.mutate({ channelId, data: { action: "join" } });
      } catch (_e) {}
    };

    setup();
    return () => {
      didUnmount = true;
      engineRef.current?.leaveChannel?.();
      engineRef.current?.release?.();
      try { updateViewers.mutate({ channelId, data: { action: "leave" } }); } catch (_e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const navigateToStream = (targetChannelId: string, direction: "up" | "down") => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const exitValue = direction === "up" ? -SCREEN_H : SCREEN_H;
    const entryStart = direction === "up" ? SCREEN_H : -SCREEN_H;
    const targetCategory = allStreams.find((s) => s.channelId === targetChannelId)?.category;

    transitionAnim.setValue(entryStart);
    setTransitionCategory(targetCategory);
    setIsTransitioning(true);

    Animated.parallel([
      Animated.timing(slideAnim, { toValue: exitValue, duration: 320, useNativeDriver: true }),
      Animated.timing(transitionAnim, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start(() => {
      isNavigatingRef.current = false;
      setIsTransitioning(false);
      router.replace(`/stream/${targetChannelId}` as any);
    });
  };

  // PanResponder for swipe-up / swipe-down on the video area
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gs) =>
        Math.abs(gs.dy) > 10 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderRelease: (_evt, gs) => {
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
    if (!inputText.trim()) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), sender: user?.name ?? "Viewer", text: inputText.trim(), color: "#FF1966" },
    ]);
    setInputText("");
    Haptics.selectionAsync();
  };

  const topPad    = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const VideoView = RtcSurfaceViewComponent;
  const showNativeVideo = isNative && joined && remoteUid !== null && VideoView;

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
    >
      {/* Full-screen video area */}
      <View
        style={StyleSheet.absoluteFill}
      >
        {showNativeVideo && VideoView ? (
          <VideoView canvas={{ uid: remoteUid! }} style={StyleSheet.absoluteFill} />
        ) : (
          <DemoVideo category={stream?.category} />
        )}
      </View>

      {/* Overlay UI */}
      <View
        style={[
          styles.overlay,
          { paddingTop: topPad + 8, paddingBottom: bottomPad + 8 },
        ]}
        pointerEvents="box-none"
      >
        {/* Top bar */}
        <View style={styles.topBar} pointerEvents="auto">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Avatar
              uid={stream?.hostUid ?? 0}
              name={stream?.hostName ?? ""}
              size={40}
              borderWidth={2}
            />
          </TouchableOpacity>

          <View style={styles.streamMeta}>
            {stream && (
              <Text style={styles.hostName}>{stream.hostName}</Text>
            )}
          </View>

          {streamCoins > 0 && (
            <View style={styles.coinsBadge}>
              <Text style={styles.coinEmoji}>🪙</Text>
              <Text style={styles.streamCoinText}>
                {streamCoins >= 1000
                  ? `${(streamCoins / 1000).toFixed(1)}K`
                  : streamCoins}
              </Text>
            </View>
          )}

          <View style={styles.viewerBadge}>
            <Ionicons name="eye" size={13} color="#FFF" />
            <Text style={styles.viewerText}>
              {stream?.viewerCount != null
                ? stream.viewerCount >= 1000
                  ? `${(stream.viewerCount / 1000).toFixed(1)}K`
                  : stream.viewerCount
                : "—"}
            </Text>
          </View>
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
        <View style={styles.chatArea} pointerEvents="box-none">
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
                <Text style={styles.chatText}>{item.text}</Text>
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
            placeholder="Say something…"
            placeholderTextColor="rgba(255,255,255,0.45)"
            onSubmitEditing={sendMessage}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => {
              setLikeCount((c) => c + 1);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="heart" size={24} color="#FF1966" />
            <Text style={styles.actionBtnText}>{likeCount}</Text>
          </TouchableOpacity>
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
              const domain = process.env["EXPO_PUBLIC_DOMAIN"] ?? "pulse.app";
              Share.share({
                title: stream ? `${stream.hostName} is live on Pulse` : "Watch live on Pulse",
                message: stream
                  ? `🔴 ${stream.hostName} is streaming "${stream.title}" on Pulse!\nhttps://${domain}/stream/${channelId}`
                  : `Watch live streams on Pulse!\nhttps://${domain}`,
              });
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Ionicons name="share-outline" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
    </Animated.View>

    {/* Floating gift animations */}
    {floatingGifts.map((fg) => (
      <GiftFloater
        key={fg.id}
        gift={fg}
        onDone={(id) => setFloatingGifts((prev) => prev.filter((g) => g.id !== id))}
      />
    ))}

    {/* Gift picker */}
    <GiftPicker
      visible={showGiftPicker}
      coins={coins}
      onClose={() => setShowGiftPicker(false)}
      onSend={(gift) => {
        if (!user?.uid) return;
        setShowGiftPicker(false);
        spendMutation.mutate(
          { data: { uid: user.uid, amount: gift.coins, description: `gift:${gift.id}` } },
          {
            onSuccess: (data) => {
              queryClient.setQueryData(
                getGetCoinBalanceQueryKey({ uid: user.uid }),
                { balance: data.balance },
              );
              spawnGift(gift, user.name ?? "You");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            },
            onError: () => {
              Alert.alert("Not enough coins", "Add more coins from your profile.");
            },
          },
        );
      }}
    />

    {/* Incoming stream overlay — slides in simultaneously with current screen sliding out */}
    {isTransitioning && (
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ translateY: transitionAnim }] }]}
        pointerEvents="none"
      >
        <DemoVideo category={transitionCategory} />
      </Animated.View>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  videoOverlay: {
    backgroundColor: "transparent",
    opacity: 0.4,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  streamMeta: { flex: 1 },
  hostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hostName: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FF1966",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  liveDot: {
    width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#FFF",
  },
  liveBadgeText: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  viewerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
  },
  viewerText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  coinsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
  },
  coinEmoji: { fontSize: 12 },
  streamCoinText: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
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
    maxWidth: "85%",
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
  actionBtnText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
});
