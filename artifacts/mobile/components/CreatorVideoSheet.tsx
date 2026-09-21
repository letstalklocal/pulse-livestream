import { VideoManagementPreview } from "./VideoManagementPreview";
import { VideoManagementSummary } from "./VideoManagementSummary";
import { LiveStickerSetup } from "./LiveStickerSetup";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useColors } from "@/hooks/useColors";
import { useAppLanguage } from "@/i18n";
import {
  videoRequest,
  uploadCreatorVideo,
  type CreatorVideo,
  type VideoLibrary,
  type VideoStats,
} from "@/utils/creatorVideos";

export function CreatorVideoSheet({
  visible,
  onClose,
  onOpenPreview,
}: {
  visible: boolean;
  onClose: () => void;
  onOpenPreview?: () => void;
}) {
  const { getToken: getClerkToken, userId } = useAuth();
  const { t, appLocale } = useAppLanguage();
  const colors = useColors(),
    insets = useSafeAreaInsets(),
    router = useRouter();
  const [library, setLibrary] = useState<VideoLibrary | null>(null);
  const [encodingProgress, setEncodingProgress] = useState<Record<string, number | null>>({});
  const [stats, setStats] = useState<VideoStats | null>(null);
  const [statsId, setStatsId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<number | null>(null),
    [error, setError] = useState("");
  const [tab, setTab] = useState<"video" | "history">("video");
  const operation = useRef(false),
    generation = useRef(0),
    upload = useRef<AbortController | null>(null),
    pollingRequest = useRef<AbortController | null>(null);
  const sessionActive = useRef(false);
  const getToken = async () => {
    const version = generation.current;
    if (!sessionActive.current) throw new Error("Upload cancelled.");
    const token = await getClerkToken();
    if (!sessionActive.current || version !== generation.current)
      throw new Error("Upload cancelled.");
    return token;
  };
  const selected = library?.videos.find((v) => v.id === library.selectedId);
  const pendingVideo = library?.videos.find(video => video.status === "processing" || video.status === "uploading");
  const pendingProgress = pendingVideo ? encodingProgress[pendingVideo.id] : null;
  const statusLabel = progress !== null
    ? progress < 100 ? t("Uploading: {v0}%", { v0: progress }) : t("Processing video…")
    : pendingVideo
      ? pendingVideo.status === "uploading" ? t("Uploading…")
        : pendingProgress === 100 ? t("Finalizing video…")
          : (pendingProgress ?? 0) > 0 ? t("Processing video: {v0}%", { v0: pendingProgress })
            : t("Processing video…")
      : null;
  const displayedProgress = progress !== null && progress < 100
    ? progress
    : pendingProgress != null && pendingProgress > 0 && pendingProgress < 100
      ? pendingProgress : null;
  const load = async (signal?: AbortSignal) => {
    const version = generation.current;
    const data = await videoRequest<VideoLibrary>(
      "/library",
      getToken,
      "GET",
      undefined,
      signal,
    );
    if (version === generation.current && !signal?.aborted) setLibrary(data);
    return data;
  };
  useEffect(() => {
    generation.current++;
    sessionActive.current = visible && !!userId;
    setTab("video");
    setLibrary(null);
    setEncodingProgress({});
    setStats(null);
    setStatsId(null);
    setError("");
    setBusy(false);
    setProgress(null);
    if (!visible || !userId) return;
    const version = generation.current;
    let polling = false;
    const refresh = async () => {
      if (polling || operation.current || AppState.currentState !== "active")
        return;
      polling = true;
      const controller = new AbortController();
      pollingRequest.current = controller;
      try {
        const data = await load(controller.signal);
        for (const v of data.videos.filter(
          (v) => v.status === "processing" || v.status === "uploading",
        )) {
          if (controller.signal.aborted) break;
          const updated = await videoRequest<CreatorVideo>(
            `/${v.id}/refresh`,
            getToken,
            "POST",
            {},
            controller.signal,
          );
          if (!controller.signal.aborted && version === generation.current)
            setEncodingProgress((values) => ({
              ...values,
              [v.id]: updated.encodingProgress ?? null,
            }));
        }
        if (!controller.signal.aborted) await load(controller.signal);
      } catch (e) {
        if (!controller.signal.aborted && version === generation.current)
          setError((e as Error).message);
      } finally {
        if (pollingRequest.current === controller) pollingRequest.current = null;
        polling = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      sessionActive.current = false;
      generation.current++;
      pollingRequest.current?.abort();
      upload.current?.abort();
      clearInterval(timer);
    };
  }, [visible, userId]);
  const run = async (fn: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    // A pending processing refresh may return 404 after removal succeeds.
    pollingRequest.current?.abort();
    setBusy(true);
    setError("");
    const version = generation.current;
    try {
      await fn();
    } catch (e) {
      if (version === generation.current) setError((e as Error).message);
    } finally {
      operation.current = false;
      if (version === generation.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  };
  const choose = () =>
    void run(async () => {
      const version = generation.current;
      setProgress(0);
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsEditing: false,
      });
      if (
        picked.canceled ||
        version !== generation.current ||
        !sessionActive.current
      )
        return;
      const asset = picked.assets[0];
      if (
        !asset.width ||
        !asset.height ||
        Math.abs(asset.width / asset.height - 9 / 16) > 0.025
      )
        throw new Error("Choose a portrait 9:16 video.");
      setTab("video");
      const controller = new AbortController();
      upload.current = controller;
      setProgress(0);
      await uploadCreatorVideo(
        asset,
        async () => {
          if (version !== generation.current)
            throw new Error("Upload cancelled.");
          return getToken();
        },
        controller.signal,
        (value) => {
          if (version === generation.current) setProgress(value);
        },
      );
      await load();
    });
  const close = () => {
    if (busy) {
      Alert.alert(t("Upload in progress"), t("Cancel this upload?"), [
        { text: t("Keep uploading"), style: "cancel" },
        {
          text: t("Cancel upload"),
          style: "destructive",
          onPress: () => {
            upload.current?.abort();
            onClose();
          },
        },
      ]);
      return;
    }
    onClose();
  };
  const showDetails = (id: string) => void run(async () => {
    const version = generation.current;
    const data = await videoRequest<VideoStats>(`/${id}/stats`, getToken);
    if (version === generation.current) { setStats(data); setStatsId(id); }
  });
  const action = (label: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      style={[
        styles.button,
        { borderColor: colors.border, opacity: disabled || busy ? 0.45 : 1 },
      ]}
    >
      <Text style={{ color: colors.foreground }}>{t(label)}</Text>
    </TouchableOpacity>
  );
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={close}
          accessibilityLabel={t("Close")}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              paddingBottom: insets.bottom + 14,
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {t(statsId ? "Video stats" : "Your Video")}
            </Text>
            <TouchableOpacity
              onPress={
                statsId
                  ? () => {
                      setStatsId(null);
                      setStats(null);
                    }
                  : close
              }
              style={styles.close}
              accessibilityLabel={t(statsId ? "Back" : "Close")}
            >
              <Ionicons
                name={statsId ? "chevron-back" : "close"}
                size={24}
                color={colors.foreground}
              />
            </TouchableOpacity>
          </View>
          {statusLabel && <View testID="creator-video-upload-status" accessibilityLiveRegion="polite"
            style={[styles.uploadStatus, { backgroundColor: colors.card }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ActivityIndicator color="#00D4D4" />
              <Text style={{ color: colors.foreground, flex: 1 }}>{statusLabel}</Text>
            </View>
            {pendingVideo?.status === "processing" && <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
              {t("Your video is processing. You can leave this screen. We'll notify you in the app when it's ready.")}
            </Text>}
            {displayedProgress !== null && <View testID="creator-video-progress-bar" accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: displayedProgress }} style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, displayedProgress))}%` }]} />
            </View>}
          </View>}
          {!statsId && <>
            {selected && <View style={[styles.visibility, { backgroundColor: colors.card }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                <Ionicons name="compass-outline" size={20} color="#00D4D4" />
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>{t("Show in Discovery")}</Text>
              </View>
              <Switch accessibilityLabel={t("Show in Discovery")} value={library?.enabled ?? false} disabled={busy}
                trackColor={{ true: "#00AFAF", false: "#555" }}
                onValueChange={enabled => void run(async () => {
                  await videoRequest("/visibility", getToken, "PUT", { enabled });
                  await load();
                })} />
            </View>}
            <View style={[styles.tabs, { backgroundColor: colors.card }]}>
              {(["video", "history"] as const).map(value => <TouchableOpacity key={value}
                accessibilityRole="tab" accessibilityLabel={t(value === "video" ? "Video" : "History")}
                accessibilityState={{ selected: tab === value }}
                onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.activeTab]}>
                <Text style={{ color: tab === value ? "#00D4D4" : colors.mutedForeground, fontSize: 14, fontWeight: "600" }}>{t(value === "video" ? "Video" : "History")}</Text>
              </TouchableOpacity>)}
            </View>
          </>}
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 18,
              gap: 12,
              paddingBottom: 12,
            }}
          >
            {!!error && (
              <Text
                accessibilityLiveRegion="polite"
                style={{ color: colors.primary }}
              >
                {t(error)}
              </Text>
            )}
            {statsId ? (
              stats ? (
                <>
                  <Text style={{ color: colors.foreground }}>
                    {t("Viewers")}: {stats.viewers.toLocaleString(appLocale())}
                  </Text>
                  <Text style={{ color: colors.foreground }}>
                    {t("Average watch time")}:{" "}
                    {stats.averageWatchSeconds.toLocaleString(appLocale())}{" "}
                    {t("seconds")}
                  </Text>
                  <Text style={{ color: colors.foreground }}>
                    {t("Total coins")}:{" "}
                    {stats.coins.toLocaleString(appLocale())}
                  </Text>
                  <Text style={{ color: colors.mutedForeground }}>
                    {t(
                      "Unique viewers and average watch time per viewing session.",
                    )}
                  </Text>
                  <Text style={[styles.title, { color: colors.foreground }]}>
                    {t("Gift senders")}
                  </Text>
                  {stats.senders.length === 0 && (
                    <Text style={{ color: colors.mutedForeground }}>
                      {t("No gifts yet")}
                    </Text>
                  )}
                  {stats.senders.map((s) => (
                    <Text
                      key={s.senderUid}
                      style={{ color: colors.foreground }}
                    >
                      {s.senderName} · {s.coins.toLocaleString(appLocale())}{" "}
                      {t("coins")}
                    </Text>
                  ))}
                  {stats.gifts.map((g) => (
                    <Text key={g.id} style={{ color: colors.mutedForeground }}>
                      {g.senderName} · {t(g.giftName)} · {g.amount} ·{" "}
                      {new Date(g.createdAt).toLocaleString(appLocale())}
                    </Text>
                  ))}
                </>
              ) : (
                <ActivityIndicator color={colors.primary} />
              )
            ) : (
              <>
                {!library && <ActivityIndicator color={colors.primary} />}
                {!library?.uploadsConfigured && library && (
                  <Text style={{ color: colors.mutedForeground }}>
                    {t("Video uploads are not configured yet.")}
                  </Text>
                )}
                {tab === "video" && <>
                  {selected ? <View style={[styles.videoCard, { borderColor: colors.border }]}>
                    {visible && <VideoManagementPreview active={!busy} key={`preview:${userId}:${selected.id}`} video={selected} onExpand={() => {
                      (onOpenPreview ?? onClose)(); router.push(`/video/${selected.id}` as any);
                    }} />}
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Replace video")}
                      onPress={choose} disabled={busy || !library?.uploadsConfigured}
                      style={[styles.replaceButton, { opacity: busy || !library?.uploadsConfigured ? 0.45 : 1 }]}>
                      <Ionicons name="swap-horizontal-outline" size={16} color="#00D4D4" />
                      <Text style={{ color: "#00D4D4", fontSize: 12, fontWeight: "600" }}>{t("Replace video")}</Text>
                    </TouchableOpacity>
                    <LiveStickerSetup value={selected.stickers ?? []} disabled={busy} onChange={(stickers) => void run(async () => { await videoRequest(`/${selected.id}/stickers`, getToken, "PUT", { stickers }); await load(); })} />
                    {visible && <VideoManagementSummary key={`summary:${userId}:${selected.id}`} videoId={selected.id} onDetails={() => showDetails(selected.id)} disabled={busy} />}
                  </View> : <View style={[styles.emptyVideo, { backgroundColor: colors.card }]}>
                    <Ionicons name="videocam-outline" size={38} color="#00D4D4" />
                    <Text style={{ color: colors.mutedForeground, textAlign: "center", lineHeight: 20 }}>{t("Let viewers discover you while you’re offline.")}</Text>
                  </View>}
                  {!selected && <TouchableOpacity accessibilityRole="button" onPress={choose} disabled={busy || !library?.uploadsConfigured}
                    style={[styles.uploadButton, { opacity: busy || !library?.uploadsConfigured ? 0.45 : 1 }]}>
                    <Ionicons name="cloud-upload-outline" size={19} color="#061E22" />
                    <Text style={{ color: "#061E22", fontSize: 14, fontWeight: "700" }}>{t("Upload Video")}</Text>
                  </TouchableOpacity>}

                </>}
                {tab === "history" && library && !library.videos.some(video => video.status === "ready") &&
                  <View style={styles.emptyVideo}><Ionicons name="time-outline" size={32} color={colors.mutedForeground} /><Text style={{ color: colors.mutedForeground }}>{t("No videos in history yet.")}</Text></View>}
                {library?.videos.filter(video => tab === "history" ? video.status === "ready" : video.status !== "ready").map((video) => (

                  <View
                    key={video.id}
                    style={[styles.history, { borderColor: colors.border }]}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      {video.thumbnailUrl ? (
                        <Image
                          source={{ uri: video.thumbnailUrl }}
                          style={{ width: 45, height: 80, borderRadius: 6 }}
                        />
                      ) : (
                        <Ionicons
                          name="videocam-outline"
                          size={30}
                          color={colors.mutedForeground}
                        />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text
                          numberOfLines={2}
                          style={{ color: colors.foreground }}
                        >
                          {video.filename}
                        </Text>
                        <Text style={{ color: colors.mutedForeground }}>
                          {t(
                            video.status === "ready"
                              ? "Uploaded"
                              : video.status === "failed"
                                ? "Video processing failed."
                                : video.status === "uploading"
                                  ? "Uploading…"
                                  : encodingProgress[video.id] === 100
                                    ? "Finalizing video…"
                                    : (encodingProgress[video.id] ?? 0) > 0
                                      ? "Processing video: {v0}%"
                                      : "Processing video…",
                            { v0: encodingProgress[video.id] ?? 0 },
                          )}
                        </Text>
                      </View>
                    </View>
                    {video.status !== "ready" &&
                      action("Remove", () =>
                        void run(async () => {
                          await videoRequest(`/${video.id}`, getToken, "DELETE");
                          await load();
                        }),
                      )}
                    {video.status === "ready" && (
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        {action(
                          video.id === library.selectedId
                            ? "Selected"
                            : "Use this video",
                          () =>
                            void run(async () => {
                              await videoRequest(
                                "/selection",
                                getToken,
                                "PUT",
                                { id: video.id },
                              );
                              await load();
                              if (sessionActive.current) setTab("video");
                            }),
                          video.id === library.selectedId,
                        )}
                        {action("Show details", () => showDetails(video.id))}
                      </View>
                    )}
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  title: { fontSize: 18, fontWeight: "700" },
  close: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  visibility: { marginHorizontal: 18, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tabs: { flexDirection: "row", marginHorizontal: 18, marginBottom: 16, padding: 4, borderRadius: 12 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 38, borderRadius: 9 },
  activeTab: { backgroundColor: "rgba(0,212,212,0.12)" },
  videoCard: { borderWidth: 1, borderRadius: 20, padding: 14, gap: 14 },
  emptyVideo: { borderRadius: 20, padding: 24, minHeight: 150, alignItems: "center", justifyContent: "center", gap: 14 },
  replaceButton: { alignSelf: "center", minHeight: 44, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, borderWidth: 1, borderColor: "rgba(0,212,212,0.35)" },
  uploadButton: { minHeight: 48, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#00D4D4" },
  uploadStatus: { marginHorizontal: 18, marginBottom: 12, padding: 12, borderRadius: 12, gap: 8 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: "#333", overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: "#00D4D4" },
  button: {
    borderWidth: 1,
    borderRadius: 20,
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  history: { paddingVertical: 12, borderBottomWidth: 1, gap: 8 },
});
