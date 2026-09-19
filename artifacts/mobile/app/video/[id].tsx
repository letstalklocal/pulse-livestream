import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Keyboard,
  Modal,
  Platform,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter, useIsFocused } from "expo-router";
import { requireOptionalNativeModule } from "expo";
import { useAuth as useClerkAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  KeyboardAvoidingView,
  useKeyboardState,
} from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { randomUUID } from "expo-crypto";
import {
  useGetCoinBalance,
  getGetCoinBalanceQueryKey,
  useGetFollowStatus,
  getGetFollowStatusQueryKey,
  useFollowUser,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useLivePlayback } from "@/context/LivePlaybackContext";
import { useAppLanguage } from "@/i18n";
import { videoRequest, type CreatorVideo } from "@/utils/creatorVideos";
import { videoCache } from "@/utils/videoCache";
import { type CacheLease, VIDEO_CACHE_TTL_MS } from "@/utils/videoCache/core";
import { GiftPicker, type Gift } from "@/components/GiftPicker";
import { GiftFloater, type FloatingGift } from "@/components/GiftFloater";
import { GoldCoinIcon } from "@/components/GoldCoinIcon";
import { LiveChatAvatar } from "@/components/LiveChatAvatar";
import { LiveReactions } from "@/components/LiveReactions";
import { VideoViewersSheet } from "@/components/VideoViewersSheet";
import { CreatorVideoSheet } from "@/components/CreatorVideoSheet";
import type { CachedVideoPlayerProps } from "@/components/CachedVideoPlayer";
const Player =
  Platform.OS !== "web" && requireOptionalNativeModule("ExpoVideo")
    ? (require("@/components/CachedVideoPlayer")
        .default as React.ComponentType<CachedVideoPlayerProps>)
    : null;
type Chat = {
  id: number;
  senderUid: number;
  senderName: string;
  message: string;
};
function PreviewNotice() {
  const { t } = useAppLanguage();
  const opacity = useRef(new Animated.Value(1)).current;
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    let mounted = true;
    const fade = Animated.timing(opacity, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    });
    const timer = setTimeout(() => {
      fade.start(({ finished }) => {
        if (mounted && finished) setVisible(false);
      });
    }, 3000);
    return () => {
      mounted = false;
      clearTimeout(timer);
      fade.stop();
    };
  }, [opacity]);
  if (!visible) return null;
  return (
    <View pointerEvents="none" style={styles.previewNoticePosition}>
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.previewNotice, { opacity }]}
    >
      <Text style={styles.previewHeading}>{t("This is a preview")}</Text>
      <Text style={styles.previewExplanation}>{t("The Follow and Gift buttons are disabled.")}</Text>
    </Animated.View>
    </View>
  );
}
export default function CreatorVideoViewer() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    router = useRouter(),
    focused = useIsFocused(),
    insets = useSafeAreaInsets();
  const { getToken, userId } = useClerkAuth(),
    { user } = useAuth(),
    { t, appLocale } = useAppLanguage(),
    live = useLivePlayback();
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const active = focused && foreground && !live.previewsBlocked;
  const keyboard = useKeyboardState((s) => s.isVisible);
  const [lease, setLease] = useState<CacheLease | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [playing, setPlaying] = useState(false);
  const [draft, setDraft] = useState(""),
    [sending, setSending] = useState(false),
    [showGifts, setShowGifts] = useState(false),
    [showMenu, setShowMenu] = useState(false),
    [gifts, setGifts] = useState<FloatingGift[]>([]);
  const [previewNoticeVersion, setPreviewNoticeVersion] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [showReplacement, setShowReplacement] = useState(false);
  const [turningOff, setTurningOff] = useState(false);
  const turningOffRef = useRef(false);
  const pendingReplacement = useRef(false);
  const composer = useRef<TextInput>(null),
    chatList = useRef<ScrollView>(null),
    sendingRef = useRef(false),
    giftBusy = useRef(false),
    draftVersion = useRef(0);
  const session = useRef(randomUUID()),
    watched = useRef(0),
    alive = useRef(true),
    giftRequest = useRef<{ id: string; giftId: string } | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setForeground(s === "active"),
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const detail = useQuery({
    queryKey: ["creator-video", userId, id],
    queryFn: ({ signal }) =>
      videoRequest<CreatorVideo>(`/${id}`, getToken, "GET", undefined, signal),
    enabled: active && !!userId,
    refetchInterval: 5000,
    retry: false,
  });
  const chat = useQuery({
    queryKey: ["creator-video-chat", userId, id],
    queryFn: ({ signal }) =>
      videoRequest<{ messages: Chat[] }>(
        `/${id}/chat`,
        getToken,
        "GET",
        undefined,
        signal,
      ),
    enabled: active && !!detail.data && !detail.isError,
    refetchInterval: 2500,
    retry: false,
  });
  const video = detail.data,
    owner = !!video && video.ownerUid === user?.uid;
  const wallet = useGetCoinBalance(
    { uid: user?.uid ?? 0 },
    {
      query: {
        queryKey: getGetCoinBalanceQueryKey({ uid: user?.uid ?? 0 }),
        enabled: !!user?.uid && showGifts && !owner,
      },
    },
  );
  const follow = useGetFollowStatus(
    video?.ownerUid ?? 0,
    { followerUid: user?.uid ?? 0 },
    {
      query: {
        queryKey: getGetFollowStatusQueryKey(video?.ownerUid ?? 0, {
          followerUid: user?.uid ?? 0,
        }),
        enabled: !!video && !!user && !owner,
      },
    },
  );
  const followMutation = useFollowUser();
  const onError = useCallback(() => {
    setError("Video could not play. Try another MP4 link.");
    setPlaying(false);
  }, []);
  const onPlayingChange = useCallback(
    (value: boolean) => setPlaying(value),
    [],
  );
  useEffect(() => {
    if (!active || !video?.playbackUrl || !Player || detail.isError) return;
    let valid = true,
      current: CacheLease | undefined,
      expiry: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    setError("");
    void videoCache
      .acquire(
        `creator-video:${video.id}`,
        video.playbackUrl,
        controller.signal,
      )
      .then((result) => {
        if (!valid) {
          void result.release().catch(() => {});
          return;
        }
        current = result;
        setLease(result);
        expiry = setTimeout(
          () => setRetry((n) => n + 1),
          Math.max(0, result.createdAt + VIDEO_CACHE_TTL_MS - Date.now()),
        );
      })
      .catch(() => {
        if (valid) setError("Video service unavailable. Try again.");
      });
    return () => {
      valid = false;
      controller.abort();
      setLease(null);
      setPlaying(false);
      if (expiry) clearTimeout(expiry);
      if (current) void current.release().catch(() => {});
    };
  }, [active, video?.id, video?.playbackUrl, detail.isError, retry]);
  useEffect(() => {
    if (!active || !playing || owner || !video || detail.isError) return;
    let inFlight = false;
    const heartbeat = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        await videoRequest(`/${id}/views`, getToken, "POST", {
          sessionId: session.current,
          watchedSeconds: Math.floor(watched.current),
        });
      } catch {
      } finally {
        inFlight = false;
      }
    };
    void heartbeat();
    let last = Date.now();
    const clock = setInterval(() => {
      const now = Date.now();
      watched.current += Math.min(2, (now - last) / 1000);
      last = now;
    }, 1000);
    const tick = setInterval(() => void heartbeat(), 10000);
    return () => {
      clearInterval(clock);
      clearInterval(tick);
      void (async () => {
        await heartbeat();
        await videoRequest(
          `/${id}/views/${session.current}`,
          getToken,
          "DELETE",
        ).catch(() => {});
      })();
    };
  }, [active, playing, owner, video?.id, detail.isError]);
  useEffect(() => {
    if (!active) {
      setShowGifts(false);
      setShowMenu(false);
      setShowViewers(false);
      setGifts([]);
    }
  }, [active]);
  const send = async () => {
    const message = draft.trim();
    if (!message || sendingRef.current || !active || detail.isError || !video)
      return;
    const version = draftVersion.current;
    sendingRef.current = true;
    setSending(true);
    try {
      await videoRequest(`/${id}/chat`, getToken, "POST", {
        message,
        clientId: randomUUID(),
      });
      if (!alive.current) return;
      if (version === draftVersion.current) setDraft("");
      void chat.refetch();
      composer.current?.focus();
    } catch (e) {
      if (alive.current) Alert.alert(t("Chat"), t((e as Error).message));
    } finally {
      sendingRef.current = false;
      if (alive.current) setSending(false);
    }
  };
  const sendGift = async (gift: Gift) => {
    if (!video || !active || owner) return;
    if (giftBusy.current) return;
    giftBusy.current = true;
    if (!giftRequest.current || giftRequest.current.giftId !== gift.id)
      giftRequest.current = { id: randomUUID(), giftId: gift.id };
    try {
      await videoRequest(`/${id}/gifts`, getToken, "POST", {
        giftId: gift.id,
        requestId: giftRequest.current.id,
      });
      giftRequest.current = null;
      if (!alive.current) return;
      setShowGifts(false);
      setGifts((old) => [
        ...old.slice(-7),
        {
          id: randomUUID(),
          emoji: gift.emoji,
          name: gift.name,
          senderName: user?.name ?? "",
          x: 0,
          size: gift.size,
        },
      ]);
      void wallet.refetch();
      void detail.refetch();
    } catch (e) {
      if (alive.current)
        Alert.alert(t("Gift not sent"), t((e as Error).message));
    } finally {
      giftBusy.current = false;
    }
  };
  const turnOffVideo = async () => {
    if (!alive.current || !owner || !active || turningOffRef.current) return;
    turningOffRef.current = true;
    setTurningOff(true);
    try {
      await videoRequest("/visibility", getToken, "PUT", { enabled: false });
      if (!alive.current) return;
      setShowMenu(false);
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)");
    } catch (e) {
      if (alive.current) Alert.alert(t("Turn off video"), t((e as Error).message));
    } finally {
      turningOffRef.current = false;
      if (alive.current) setTurningOff(false);
    }
  };
  const usable = active && !!lease && !detail.isError && !error;
  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill}>
        {usable && !showReplacement && Player ? (
          <Player
            uri={lease!.uri}
            contentFit="cover"
            nativeControls={false}
            onError={onError}
            onPlayingChange={onPlayingChange}
          />
        ) : (
          <View style={styles.loading}>
            {error || detail.isError || !Player ? (
              <>
                <Text style={styles.text}>
                  {t(
                    !Player
                      ? "Install a new Android or iPhone build to test video caching."
                      : error ||
                          (detail.error as Error)?.message ||
                          "Video not found.",
                  )}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setRetry((n) => n + 1);
                    void detail.refetch();
                  }}
                >
                  <Text style={styles.text}>{t("Retry")}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <ActivityIndicator color="#FFF" />
            )}
          </View>
        )}
      </View>
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,0,0,0.65)", "transparent"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 150 }}
      />
      <LinearGradient
        pointerEvents="none"
        colors={["transparent", "rgba(0,0,0,0.7)"]}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 280,
        }}
      />
      <View style={[styles.header, { top: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.action}
          accessibilityLabel={t("Back")}
        >
          <Ionicons name="chevron-back" size={25} color="#FFF" />
        </TouchableOpacity>
        {video && (
          <LiveChatAvatar
            senderUid={video.ownerUid}
            senderName={video.ownerName ?? ""}
          />
        )}
        <Text
          style={[styles.text, { flex: 1, fontWeight: "700" }]}
          numberOfLines={1}
        >
          {video?.ownerName}
        </Text>
        <TouchableOpacity
          style={styles.pill}
          accessibilityRole="button"
          accessibilityLabel={t("Viewers")}
          disabled={!video || detail.isError}
          onPress={() => { Keyboard.dismiss(); setShowViewers(true); }}
        >
          <GoldCoinIcon size={14} />
          <Text testID="video-gift-total" style={styles.text}>
            {(video?.coins ?? 0).toLocaleString(appLocale())}
          </Text>
          <Text style={styles.text}>│</Text>
          <Ionicons name="eye" size={12} color="#FFF" />
          <Text testID="video-viewer-count" style={styles.text}>
            {(video?.viewers ?? 0).toLocaleString(appLocale())}
          </Text>
        </TouchableOpacity>
      </View>
      {owner && usable && (
        <PreviewNotice key={`${userId}:${id}:${previewNoticeVersion}`} />
      )}
      <KeyboardAvoidingView
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        automaticOffset
        keyboardVerticalOffset={0}
      >
        <View
          style={{ flex: 1, justifyContent: "flex-end" }}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            accessible={false}
            activeOpacity={1}
            onPress={Keyboard.dismiss}
            style={{ flex: 1, marginTop: insets.top + 60 }}
          />
          <View
            style={{
              paddingHorizontal: 14,
              paddingBottom: keyboard ? 0 : insets.bottom + 10,
            }}
          >
            <ScrollView
              ref={chatList}
              style={{ maxHeight: 240 }}
              contentContainerStyle={{ gap: 5 }}
              keyboardShouldPersistTaps="always"
              onTouchStart={Keyboard.dismiss}
              onContentSizeChange={() =>
                chatList.current?.scrollToEnd({ animated: true })
              }
            >
              {chat.data?.messages.map((m) => (
                <View
                  key={m.id}
                  style={{ flexDirection: "row", gap: 6, maxWidth: "60%" }}
                >
                  <LiveChatAvatar
                    senderUid={m.senderUid}
                    senderName={m.senderName}
                  />
                  <View style={{ flexShrink: 1 }}>
                    <Text
                      style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}
                    >
                      {m.senderName}
                    </Text>
                    <Text style={styles.text}>{m.message}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={styles.dock}>
              <View style={styles.composer}>
                <TextInput
                  ref={composer}
                  value={draft}
                  onChangeText={(v) => {
                    draftVersion.current++;
                    setDraft(v);
                  }}
                  style={styles.input}
                  placeholder={t("Type...")}
                  placeholderTextColor="#AAA"
                  maxLength={500}
                  blurOnSubmit={false}
                  returnKeyType="send"
                  onSubmitEditing={() => void send()}
                />
                <TouchableOpacity
                  onPress={() => void send()}
                  disabled={sending || !draft.trim() || !usable}
                  style={styles.action}
                  accessibilityLabel={t("Send")}
                >
                  <Ionicons
                    name="send"
                    size={18}
                    color={sending || !draft.trim() ? "#777" : "#FFF"}
                  />
                </TouchableOpacity>
              </View>
              {!keyboard && (
                <>
                  <TouchableOpacity
                      disabled={!video || followMutation.isPending}
                      accessibilityState={{ disabled: !video || followMutation.isPending }}
                      onPress={() => {
                        if (owner) {
                          setPreviewNoticeVersion((value) => value + 1);
                          return;
                        }
                        if (follow.data?.isFollowing)
                          router.push({
                            pathname: "/dm/[peerId]",
                            params: { peerId: String(video!.ownerUid), peerName: video!.ownerName ?? "" },
                          });
                        else if (video && user)
                          followMutation.mutate(
                            {
                              uid: video.ownerUid,
                              data: { followerUid: user.uid },
                            },
                            {
                              onSuccess: () => {
                                void follow.refetch();
                              },
                              onError: () =>
                                Alert.alert(
                                  t("Follow"),
                                  t("Something went wrong. Please try again."),
                                ),
                            },
                          );
                      }}
                      style={[
                        styles.followButton,
                        { opacity: owner ? 0.55 : 1 },
                      ]}
                      accessibilityLabel={t(
                        follow.data?.isFollowing ? "Messages" : "Follow",
                      )}
                    >
                      <Ionicons
                        name={
                          follow.data?.isFollowing
                            ? "chatbubble-ellipses"
                            : "add"
                        }
                        size={22}
                        color="#FFF"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={!usable}
                      accessibilityState={{ disabled: !usable }}
                      onPress={() => {
                        if (!usable) return;
                        if (owner) {
                          setPreviewNoticeVersion((value) => value + 1);
                          return;
                        }
                        Keyboard.dismiss();
                        setShowGifts(true);
                      }}
                      style={[styles.action, { opacity: owner ? 0.55 : 1 }]}
                      accessibilityLabel={t("Send a Gift")}
                    >
                      <Ionicons name="gift-outline" size={24} color="#FFD700" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t("More")}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowMenu(true);
                      }}
                      style={styles.action}
                    >
                      <Ionicons name="ellipsis-vertical" size={24} color="#FFF" />
                    </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {gifts.map((g) => (
          <GiftFloater
            key={g.id}
            gift={g}
            onDone={(done) =>
              setGifts((old) => old.filter((x) => x.id !== done))
            }
          />
        ))}
      </View>
      {active && video && !detail.isError && (
        <View pointerEvents="box-none" style={{ position: "absolute", right: 10, bottom: insets.bottom + 68, display: keyboard ? "none" : "flex" }}>
          <LiveReactions key={`${userId}:${id}`} channelId={`creator-video:${video.id}`} canSend selectedEmoji="❤️" />
        </View>
      )}
      <Modal
        visible={showMenu && active}
        onDismiss={() => {
          if (!pendingReplacement.current) return;
          pendingReplacement.current = false;
          if (alive.current && focused && owner) setShowReplacement(true);
        }}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowMenu(false)}
      >
        <View style={styles.menuBackdrop}>
          <TouchableOpacity
            style={{ flex: 1 }}
            accessibilityLabel={t("Close")}
            onPress={() => setShowMenu(false)}
          />
          <View style={[styles.menu, { marginBottom: insets.bottom + 24 }]}>
            <TouchableOpacity
              style={styles.menuItem}
              accessibilityLabel={t("Share")}
              onPress={() => {
                setShowMenu(false);
                const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "pulse.app";
                void Share.share({
                  title: video?.ownerName ?? "Pulse",
                  message: `https://${domain}/video/${id}`,
                }).catch(() => Alert.alert(t("Share"), t("Something went wrong. Please try again.")));
              }}
            >
              <Ionicons name="share-outline" size={20} color="#FFF" />
              <Text style={styles.text}>{t("Share")}</Text>
            </TouchableOpacity>
            {owner && <>
              <TouchableOpacity style={styles.menuItem} disabled={turningOff} accessibilityLabel={t("Replace video")} onPress={() => {
                if (Platform.OS === "ios") pendingReplacement.current = true;
                setShowMenu(false);
                if (Platform.OS !== "ios") setShowReplacement(true);
              }}>
                <Ionicons name="videocam-outline" size={20} color="#FFF" />
                <Text style={[styles.text, { flex: 1 }]}>{t("Replace video")}</Text>
                <Ionicons name="chevron-forward" size={18} color="#888" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} disabled={turningOff} accessibilityLabel={t("Turn off video")} onPress={() => {
                Alert.alert(
                  t("Turn off video"),
                  t("Your video will no longer appear in Discovery. You can turn it back on anytime."),
                  [
                    { text: t("Cancel"), style: "cancel" },
                    { text: t("Turn off video"), onPress: () => void turnOffVideo() },
                  ],
                  { cancelable: true },
                );
              }}>
                <Ionicons name="eye-off-outline" size={20} color="#FFF" />
                <Text style={styles.text}>{t("Turn off video")}</Text>
                {turningOff && <ActivityIndicator color="#FFF" />}
              </TouchableOpacity>
            </>}
            <TouchableOpacity
              style={styles.menuItem}
              accessibilityLabel={t("Exit Video")}
              onPress={() => {
                setShowMenu(false);
                if (router.canGoBack()) router.back();
                else router.replace("/(tabs)");
              }}
            >
              <Ionicons name="exit-outline" size={20} color="#FFF" />
              <Text style={styles.text}>{t("Exit Video")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {showViewers && active && video && !detail.isError && <VideoViewersSheet
        key={`${userId}:${id}:${owner}`}
        videoId={video.id}
        isOwner={owner}
        onClose={() => setShowViewers(false)}
        onProfile={(uid, name) => router.push({ pathname: "/profile/[hostUid]", params: { hostUid: String(uid), name } })}
      />}
      {owner && showReplacement && <CreatorVideoSheet
        key={userId}
        visible={showReplacement && focused}
        onClose={() => { setShowReplacement(false); void detail.refetch(); }}
      />}
      <GiftPicker
        visible={showGifts && active && !owner}
        coins={wallet.data?.balance ?? 0}
        onClose={() => setShowGifts(false)}
        onSend={(gift) => void sendGift(gift)}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  text: { color: "#FFF", fontSize: 13 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  previewNoticePosition: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, justifyContent: "center", alignItems: "center", zIndex: 3 },
  previewHeading: { color: "#FFF", fontSize: 24, lineHeight: 30, fontWeight: "700", textAlign: "center" },
  previewExplanation: { color: "rgba(255,255,255,0.85)", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 4 },
  previewNotice: {
    alignSelf: "center",
    maxWidth: "85%",
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  header: {
    position: "absolute",
    zIndex: 2,
    left: 4,
    right: 14,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 8,
    borderRadius: 16,
  },
  action: {
    width: 40,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  followButton: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: "#FF1966",
    alignItems: "center", justifyContent: "center",
  },
  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  menu: { alignSelf: "flex-end", marginRight: 14, minWidth: 190, borderRadius: 16, backgroundColor: "#191921", padding: 8 },
  menuItem: { flexDirection: "row", gap: 12, alignItems: "center", minHeight: 48, paddingHorizontal: 14 },
  dock: { flexDirection: "row", gap: 8, alignItems: "center", paddingTop: 10 },
  composer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#FFF",
    fontSize: 14,
  },
});
