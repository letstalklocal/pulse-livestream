import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
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
import {
  useGenerateAgoraToken,
  useGetStream,
  useListStreams,
  useUpdateViewerCount,
} from "@workspace/api-client-react";
import type { Stream } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";
import {
  ChannelProfileType,
  ClientRoleType,
  RtcSurfaceViewComponent,
  createEngine,
} from "@/utils/agora";

const SCREEN_H = Dimensions.get("window").height;
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
  { id: "s1", sender: "viewer_neon",  text: "Wow amazing stream!",          color: "#FF1966" },
  { id: "s2", sender: "cosmic_fan",   text: "First time watching, love it", color: "#7B4FFF" },
  { id: "s3", sender: "pulse_user99", text: "Keep it up! 🔥",              color: "#00C896" },
];

const CATEGORY_BG: Record<string, string> = {
  Gaming: "#1A0A3D",
  Music:  "#1A0010",
  Talk:   "#001A12",
  Art:    "#1A0800",
  Dance:  "#1A0010",
  Other:  "#050D1A",
};

const CATEGORY_ACCENT: Record<string, string> = {
  Gaming: "#7B4FFF",
  Music:  "#FF1966",
  Talk:   "#00C896",
  Art:    "#FF8C00",
  Dance:  "#FF1966",
  Other:  "#4FC3F7",
};

// ─── Profile card shown while adjacent stream is off-screen ───────────────
function StreamProfileCard({ stream }: { stream: Stream }) {
  const bg     = CATEGORY_BG[stream.category]     ?? "#08080F";
  const accent = CATEGORY_ACCENT[stream.category] ?? "#FF1966";

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: bg }]}>
      {/* Subtle radial glow behind avatar */}
      <View style={[styles.cardGlow, { backgroundColor: accent + "22" }]} />

      <View style={styles.cardContent}>
        <Avatar uid={stream.hostUid} name={stream.hostName} size={160} borderWidth={3} />

        <Text style={styles.cardName}>{stream.hostName}</Text>

        <View style={[styles.cardLiveBadge, { backgroundColor: accent }]}>
          <View style={styles.liveDot} />
          <Text style={styles.cardLiveBadgeText}>LIVE</Text>
        </View>

        <View style={styles.cardViewers}>
          <Ionicons name="eye" size={13} color="rgba(255,255,255,0.6)" />
          <Text style={styles.cardViewersText}>
            {stream.viewerCount >= 1000
              ? `${(stream.viewerCount / 1000).toFixed(1)}K viewers`
              : `${stream.viewerCount} viewers`}
          </Text>
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>
          {stream.title}
        </Text>
      </View>
    </View>
  );
}

// ─── Full stream content: video + overlay (fades in after snap) ───────────
interface StreamContentProps {
  channelId: string;
  stream: Stream | undefined;
  onBack: () => void;
  topPad: number;
  bottomPad: number;
}

function StreamContent({ channelId, stream, onBack, topPad, bottomPad }: StreamContentProps) {
  const { user } = useAuth();
  const [remoteUid, setRemoteUid]   = useState<number | null>(null);
  const [messages,  setMessages]    = useState<ChatMsg[]>(SEED_CHAT);
  const [inputText, setInputText]   = useState("");
  const [joined,    setJoined]      = useState(false);
  const [likeCount, setLikeCount]   = useState(Math.floor(Math.random() * 500) + 50);
  const engineRef = useRef<any>(null);
  const listRef   = useRef<FlatList>(null);

  // Fade the overlay in after snap settles
  const revealAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(revealAnim, {
      toValue: 1,
      duration: 380,
      delay: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateToken = useGenerateAgoraToken();
  const updateViewers = useUpdateViewerCount();

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

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages]);

  // Join Agora
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
        engine.addListener("onUserOffline", () => { if (!didUnmount) setRemoteUid(null); });
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

  const sendMessage = () => {
    if (!inputText.trim()) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), sender: user?.name ?? "Viewer", text: inputText.trim(), color: "#FF1966" },
    ]);
    setInputText("");
    Haptics.selectionAsync();
  };

  const VideoView = RtcSurfaceViewComponent;
  const showNativeVideo = isNative && joined && remoteUid !== null && VideoView;
  const accent = CATEGORY_ACCENT[stream?.category ?? ""] ?? "#FF1966";

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: revealAnim }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* Video background */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: CATEGORY_BG[stream?.category ?? ""] ?? "#08080F" }]}>
          {showNativeVideo && VideoView ? (
            <VideoView canvas={{ uid: remoteUid! }} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[styles.cardGlow, { backgroundColor: accent + "22" }]} />
          )}
        </View>

        {/* Overlay UI */}
        <View
          style={[styles.overlay, { paddingTop: topPad + 8, paddingBottom: bottomPad + 8 }]}
          pointerEvents="box-none"
        >
          {/* Top bar */}
          <View style={styles.topBar} pointerEvents="auto">
            <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
              <Ionicons name="chevron-down" size={22} color="#FFF" />
            </TouchableOpacity>
            <View style={styles.streamMeta}>
              {stream && (
                <View style={styles.hostRow}>
                  <Text style={styles.hostName}>{stream.hostName}</Text>
                  <View style={[styles.liveBadge, { backgroundColor: accent }]}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveBadgeText}>LIVE</Text>
                  </View>
                </View>
              )}
            </View>
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

          <View style={styles.swipeZone} pointerEvents="none" />

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
                  <Text style={[styles.chatSender, { color: item.color }]}>{item.sender}: </Text>
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
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
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
  );
}

// ─── Root screen — owns paging state & shared pan gesture ─────────────────
export default function StreamScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { channelId: initialChannelId } = useLocalSearchParams<{ channelId: string }>();

  const [activeChannelId, setActiveChannelId] = useState(initialChannelId ?? "");

  const { data: allStreamsData } = useListStreams({
    query: { refetchInterval: 10000 } as any,
  });
  const allStreams = allStreamsData?.streams ?? [];
  const currentIndex = allStreams.findIndex((s) => s.channelId === activeChannelId);
  const prevStream   = currentIndex > 0 ? allStreams[currentIndex - 1] : null;
  const nextStream   = currentIndex >= 0 && currentIndex < allStreams.length - 1
    ? allStreams[currentIndex + 1] : null;
  const activeStream = allStreams[currentIndex];

  // Per-stream data for the active slot
  const { data: streamData } = useGetStream(activeChannelId, {
    query: { enabled: !!activeChannelId, refetchInterval: 5000 } as any,
  });
  const liveStream = streamData?.stream ?? activeStream;

  const panY = useRef(new Animated.Value(0)).current;
  const prevStreamRef = useRef(prevStream);
  const nextStreamRef = useRef(nextStream);
  useEffect(() => { prevStreamRef.current = prevStream; }, [prevStream]);
  useEffect(() => { nextStreamRef.current = nextStream; }, [nextStream]);

  const isAnimatingRef = useRef(false);

  const snapTo = (targetChannelId: string, direction: "up" | "down") => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.timing(panY, {
      toValue: direction === "up" ? -SCREEN_H : SCREEN_H,
      duration: 340,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setActiveChannelId(targetChannelId);
      panY.setValue(0);
      isAnimatingRef.current = false;
    });
  };

  const springBack = () => {
    Animated.spring(panY, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gs) =>
        Math.abs(gs.dy) > 12 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5,
      onPanResponderMove: (_evt, gs) => {
        if (isAnimatingRef.current) return;
        if      (gs.dy > 0 && !prevStreamRef.current) panY.setValue(gs.dy * 0.12);
        else if (gs.dy < 0 && !nextStreamRef.current) panY.setValue(gs.dy * 0.12);
        else panY.setValue(gs.dy);
      },
      onPanResponderRelease: (_evt, gs) => {
        if (isAnimatingRef.current) return;
        const { dy, vy } = gs;
        if ((dy < -55 || vy < -0.4) && nextStreamRef.current)
          snapTo(nextStreamRef.current.channelId, "up");
        else if ((dy > 55 || vy > 0.4) && prevStreamRef.current)
          snapTo(prevStreamRef.current.channelId, "down");
        else springBack();
      },
      onPanResponderTerminate: () => springBack(),
    }),
  ).current;

  const prevSlotY = useRef(Animated.add(panY, new Animated.Value(-SCREEN_H))).current;
  const nextSlotY = useRef(Animated.add(panY, new Animated.Value(SCREEN_H))).current;

  const topPad    = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: "#08080F" }]}>
      {/* Prev profile card */}
      {prevStream && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ translateY: prevSlotY }] }]}
          pointerEvents="none"
        >
          <StreamProfileCard stream={prevStream} />
        </Animated.View>
      )}

      {/* Next profile card */}
      {nextStream && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ translateY: nextSlotY }] }]}
          pointerEvents="none"
        >
          <StreamProfileCard stream={nextStream} />
        </Animated.View>
      )}

      {/* Active stream — full UI, moves with finger */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ translateY: panY }] }]}
        {...panResponder.panHandlers}
      >
        <StreamContent
          key={activeChannelId}
          channelId={activeChannelId}
          stream={liveStream}
          onBack={() => router.back()}
          topPad={topPad}
          bottomPad={bottomPad}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Profile card
  cardGlow: {
    position: "absolute",
    width: 400,
    height: 400,
    borderRadius: 200,
    alignSelf: "center",
    top: "20%",
  },
  cardContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 32,
  },
  cardName: {
    color: "#FFF",
    fontSize: 28,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginTop: 4,
  },
  cardLiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 6,
  },
  cardLiveBadgeText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  cardViewers: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  cardViewersText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  cardTitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 4,
  },

  // Stream overlay
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
  hostRow: { flexDirection: "row", alignItems: "center", gap: 8 },
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
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#FFF" },
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
  viewerText: { color: "#FFF", fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  swipeZone: { flex: 1 },
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
  chatSender: { fontSize: 12, fontWeight: "700", fontFamily: "Inter_600SemiBold" },
  chatText: { color: "#FFF", fontSize: 12, fontFamily: "Inter_400Regular", flexShrink: 1 },
  bottomBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10 },
  chatInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#FFF",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  actionBtn: { alignItems: "center", justifyContent: "center", width: 44, height: 44 },
  actionBtnText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    marginTop: 1,
  },
});
