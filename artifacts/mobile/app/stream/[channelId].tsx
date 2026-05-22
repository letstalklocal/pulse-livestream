import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
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
  useUpdateViewerCount,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
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

// Animated gradient background used as the "video" in demo mode
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
  const { user } = useAuth();

  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>(SEED_CHAT);
  const [inputText, setInputText] = useState("");
  const [joined, setJoined] = useState(false);
  const [likeCount, setLikeCount] = useState(Math.floor(Math.random() * 500) + 50);
  const engineRef = useRef<any>(null);
  const listRef = useRef<FlatList>(null);

  const { data: streamData } = useGetStream(channelId ?? "", {
    query: { enabled: !!channelId, refetchInterval: 5000 },
  });
  const stream = streamData?.stream;

  const generateToken = useGenerateAgoraToken();
  const updateViewers = useUpdateViewerCount();

  // Simulate live chat for demo
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
          data: {
            channelName: channelId,
            uid: user.uid,
            role: "audience",
          },
        });
        await engine.joinChannel(tokenData.token, channelId, user.uid, {
          clientRoleType: ClientRoleType.ClientRoleAudience,
          autoSubscribeAudio: true,
          autoSubscribeVideo: true,
        });
        if (!didUnmount) setJoined(true);
        updateViewers.mutate({ channelId, data: { action: "join" } });
      } catch (_e) { /* non-native or Expo Go */ }
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
      { id: Date.now().toString(), sender: user.name, text: inputText.trim(), color: "#FF1966" },
    ]);
    setInputText("");
    Haptics.selectionAsync();
  };

  const topPad    = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // Decide what to show as the video layer
  const showNativeVideo = isNative && joined && remoteUid !== null && RtcSurfaceViewComponent;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: "#000" }]}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
    >
      {/* Video / demo background */}
      {showNativeVideo ? (
        <RtcSurfaceViewComponent
          canvas={{ uid: remoteUid! }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <DemoVideo category={stream?.category} />
      )}

      {/* Overlay UI */}
      <View
        style={[
          styles.overlay,
          { paddingTop: topPad + 8, paddingBottom: bottomPad + 8 },
        ]}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-down" size={22} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.streamMeta}>
            {stream && (
              <View style={styles.hostRow}>
                <Text style={styles.hostName}>{stream.hostName}</Text>
                <View style={styles.liveBadge}>
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

        {stream && (
          <Text style={styles.streamTitle} numberOfLines={2}>
            {stream.title}
          </Text>
        )}

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
        <View style={styles.bottomBar}>
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
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
            <Ionicons name="share-outline" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
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
  chatArea: { flex: 1, justifyContent: "flex-end" },
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
