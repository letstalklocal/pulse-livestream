import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
  useCreateStream,
  useEndStream,
  useGenerateAgoraToken,
  useHeartbeatStream,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  ChannelProfileType,
  ClientRoleType,
  RenderModeType,
  RtcTextureViewComponent,
  VideoSourceType,
  createEngine,
} from "@/utils/agora";

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

async function requestPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
    return (
      granted[PermissionsAndroid.PERMISSIONS.CAMERA] === "granted" &&
      granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === "granted"
    );
  } catch {
    return false;
  }
}

export default function GoLiveScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Gaming");
  const [isLive, setIsLive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [duration, setDuration] = useState(0);

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

  // Request permissions and initialise Agora engine on mount
  useEffect(() => {
    if (!isNative) return;
    let mounted = true;

    (async () => {
      const ok = await requestPermissions();
      if (!mounted) return;
      if (!ok) {
        console.warn("[Agora] Permissions denied");
        return;
      }
      try {
        const engine = createEngine();
        if (!engine) return;
        engine.initialize({
          appId: process.env["EXPO_PUBLIC_AGORA_APP_ID"] ?? "",
          channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
        });
        // Log Agora errors to help diagnose black-screen issues
        engine.registerEventHandler({
          onError: (err: number, msg: string) =>
            console.warn("[Agora] onError:", err, msg),
          onJoinChannelSuccess: (connection: any, elapsed: number) =>
            console.log("[Agora] joined channel:", connection?.channelId, "elapsed:", elapsed),
          onLocalVideoStateChanged: (source: any, state: number, reason: number) =>
            console.log("[Agora] localVideoState source:", source, "state:", state, "reason:", reason),
        });
        engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
        engine.enableVideo();
        engine.enableAudio();
        // startPreview BEFORE the RtcTextureView mounts so the camera is
        // already capturing when the view connects to it
        engine.startPreview();
        engineRef.current = engine;
      } catch (e) {
        console.warn("[Agora] init error:", e);
      }
    })();

    return () => {
      mounted = false;
      engineRef.current?.stopPreview?.();
      engineRef.current?.release?.();
    };
  }, []);

  // After the live screen mounts its RtcTextureView, join the channel
  useEffect(() => {
    if (!isLive || !isNative || !engineRef.current || !pendingJoinRef.current) return;
    const { token, channelId } = pendingJoinRef.current;
    pendingJoinRef.current = null;

    // Give the texture view one frame to attach before joining
    const t = setTimeout(() => {
      try {
        engineRef.current.joinChannel(token, channelId, user.uid, {
          clientRoleType: ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          publishCameraTrack: true,
        });
      } catch (e) {
        console.warn("[Agora] joinChannel error:", e);
      }
    }, 300);

    return () => clearTimeout(t);
  }, [isLive, user.uid]);

  const startLive = useCallback(async () => {
    if (!title.trim()) return;
    setIsStarting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const channelId = `pulse-${user.uid}-${Date.now()}`;
    channelIdRef.current = channelId;

    try {
      const tokenData = await generateToken.mutateAsync({
        data: { channelName: channelId, uid: user.uid, role: "broadcaster" },
      });

      await createStream.mutateAsync({
        data: {
          channelId,
          hostUid: user.uid,
          hostName: user.name,
          title: title.trim(),
          category,
        },
      });

      if (isNative && engineRef.current) {
        pendingJoinRef.current = { token: tokenData.token, channelId };
      }

      isLiveRef.current = true;
      setIsLive(true);
      setIsStarting(false);
      durationRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (_e) {
      setIsStarting(false);
    }
  }, [title, category, user, generateToken, createStream]);

  const stopLive = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    if (durationRef.current) clearInterval(durationRef.current);
    // Mark not-live before async ops so the unmount cleanup doesn't double-delete
    isLiveRef.current = false;
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

  // Send a heartbeat every 8 s while live so the server knows the stream is active.
  // If the app crashes or is killed, heartbeats stop and the server auto-removes
  // the stream after 15 s (HEARTBEAT_TTL_MS).
  useEffect(() => {
    if (!isLive || !channelIdRef.current) return;
    const id = setInterval(() => {
      heartbeat.mutate({ channelId: channelIdRef.current });
    }, 8_000);
    return () => clearInterval(id);
  }, [isLive, heartbeat]);

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

  // RtcTextureView is more reliable than RtcSurfaceView for local camera on Android
  const VideoView = RtcTextureViewComponent;
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

        <View style={[styles.liveOverlay, { paddingTop: topPad + 12, paddingBottom: bottomPad + 16 }]}>
          <View style={styles.liveTopBar}>
            <View style={styles.liveBadgeRow}>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
              <Text style={styles.liveDuration}>{formatDuration(duration)}</Text>
            </View>
            {!isNative && (
              <View style={styles.demoBadge}>
                <Text style={styles.demoBadgeText}>DEMO</Text>
              </View>
            )}
          </View>

          <View style={styles.liveInfoRow}>
            <View style={[styles.liveAvatarBubble, { backgroundColor: catColor + "33", borderColor: catColor }]}>
              <Text style={[styles.liveAvatarText, { color: catColor }]}>
                {user.name.slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={styles.liveInfoText}>
              <Text style={styles.liveHostName}>{user.name}</Text>
              <Text style={styles.liveTitleText} numberOfLines={1}>{title}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.endLiveBtn} onPress={stopLive} activeOpacity={0.85}>
            <Ionicons name="stop-circle" size={20} color="#FFF" />
            <Text style={styles.endLiveBtnText}>End Stream</Text>
          </TouchableOpacity>
        </View>
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
        <View style={[styles.setupIcon, { backgroundColor: catColor + "22", borderColor: catColor + "55" }]}>
          <Ionicons name="radio" size={40} color={catColor} />
        </View>

        <Text style={[styles.setupTitle, { color: colors.foreground }]}>
          Start your stream
        </Text>
        <Text style={[styles.setupSubtitle, { color: colors.mutedForeground }]}>
          {isNative ? "Tell viewers what you're streaming" : "Demo mode — stream info saved, no camera on web"}
        </Text>

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
          />
        </View>

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
              backgroundColor: title.trim() ? catColor : colors.muted,
              opacity: isStarting ? 0.7 : 1,
            },
          ]}
          onPress={startLive}
          disabled={!title.trim() || isStarting}
          activeOpacity={0.85}
        >
          {isStarting ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Ionicons name="radio" size={20} color="#FFF" />
              <Text style={styles.goLiveBtnText}>
                {isNative ? "Go Live" : "Go Live (Demo)"}
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
  setupIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
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
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  liveTopBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
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
  liveInfoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  liveAvatarBubble: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  liveAvatarText: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
  liveInfoText: { gap: 2 },
  liveHostName: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  liveTitleText: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: "Inter_400Regular", maxWidth: 200 },
  endLiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "center",
    backgroundColor: "#FF4444",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
  },
  endLiveBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
});
