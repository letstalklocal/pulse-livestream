import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
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
import { useColors } from "@/hooks/useColors";
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
}

const SEED_CHAT: ChatMsg[] = [
  { id: "s1", sender: "viewer_neon", text: "Wow amazing stream!" },
  { id: "s2", sender: "cosmic_fan", text: "First time watching, love it" },
  { id: "s3", sender: "pulse_user99", text: "Keep it up!" },
];

export default function StreamScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const { user } = useAuth();

  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>(SEED_CHAT);
  const [inputText, setInputText] = useState("");
  const [joined, setJoined] = useState(false);
  const [likeCount, setLikeCount] = useState(
    Math.floor(Math.random() * 500) + 50,
  );
  const engineRef = useRef<any>(null);

  const { data: streamData } = useGetStream(channelId ?? "", {
    query: { enabled: !!channelId, refetchInterval: 5000 },
  });
  const stream = streamData?.stream;

  const generateToken = useGenerateAgoraToken();
  const updateViewers = useUpdateViewerCount();

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

        engine.addListener(
          "onUserPublished",
          (_conn: any, uid: number, _mediaType: any) => {
            if (!didUnmount) {
              engine.subscribeVideo(uid, {});
              setRemoteUid(uid);
            }
          },
        );
        engine.addListener("onUserOffline", () => {
          if (!didUnmount) setRemoteUid(null);
        });

        engineRef.current = engine;

        const tokenData = await generateToken.mutateAsync({
          channelName: channelId,
          uid: user.uid,
          role: "audience",
        });

        await engine.joinChannel(tokenData.token, channelId, user.uid, {
          clientRoleType: ClientRoleType.ClientRoleAudience,
          autoSubscribeAudio: true,
          autoSubscribeVideo: true,
        });

        if (!didUnmount) setJoined(true);
        updateViewers.mutate({ channelId, data: { action: "join" } });
      } catch (_e) {
        // ignore in non-native
      }
    };

    setup();

    return () => {
      didUnmount = true;
      engineRef.current?.leaveChannel?.();
      engineRef.current?.release?.();
      try {
        updateViewers.mutate({ channelId, data: { action: "leave" } });
      } catch (_e) {
        // best effort
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const sendMessage = () => {
    if (!inputText.trim()) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), sender: user.name, text: inputText.trim() },
    ]);
    setInputText("");
    Haptics.selectionAsync();
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const RemoteVideoView =
    isNative && joined && remoteUid !== null && RtcSurfaceViewComponent ? (
      <RtcSurfaceViewComponent
        canvas={{ uid: remoteUid }}
        style={StyleSheet.absoluteFill}
      />
    ) : null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: "#000" }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Video background */}
      {RemoteVideoView ?? (
        <View style={[StyleSheet.absoluteFill, styles.videoPlaceholder]}>
          <View style={styles.placeholderContent}>
            {isNative && !joined ? (
              <>
                <Ionicons
                  name="radio-outline"
                  size={48}
                  color="rgba(255,255,255,0.4)"
                />
                <Text style={styles.placeholderText}>Connecting…</Text>
              </>
            ) : (
              <>
                <Ionicons
                  name="play-circle-outline"
                  size={56}
                  color="rgba(255,255,255,0.4)"
                />
                <Text style={styles.placeholderText}>
                  {isNative
                    ? "Waiting for broadcaster"
                    : "Download the app to watch live"}
                </Text>
              </>
            )}
          </View>
        </View>
      )}

      {/* Overlay */}
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
            <Text style={styles.viewerText}>{stream?.viewerCount ?? 0}</Text>
          </View>
        </View>

        {stream && (
          <Text style={styles.streamTitle} numberOfLines={2}>
            {stream.title}
          </Text>
        )}

        {/* Chat */}
        <View style={styles.chatArea} pointerEvents="box-none">
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.chatList}
            showsVerticalScrollIndicator={false}
            style={styles.chatScroll}
            renderItem={({ item }) => (
              <View style={styles.chatBubble}>
                <Text style={styles.chatSender}>{item.sender}: </Text>
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
            <Ionicons name="heart" size={22} color="#FF1966" />
            <Text style={styles.actionBtnText}>{likeCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
            <Ionicons name="gift-outline" size={22} color="#FFD700" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
            <Ionicons name="share-outline" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  videoPlaceholder: {
    backgroundColor: "#0A0A18",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderContent: { alignItems: "center", gap: 12 },
  placeholderText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
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
    backgroundColor: "rgba(0,0,0,0.4)",
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
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#FFF",
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
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginBottom: 4,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  chatArea: { flex: 1, justifyContent: "flex-end" },
  chatScroll: { maxHeight: 220 },
  chatList: { gap: 4, paddingBottom: 4 },
  chatBubble: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
    maxWidth: "80%",
  },
  chatSender: {
    color: "#FF1966",
    fontSize: 12,
    fontWeight: "600",
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
    paddingTop: 8,
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
    borderColor: "rgba(255,255,255,0.15)",
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
