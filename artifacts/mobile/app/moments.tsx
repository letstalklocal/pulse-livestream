import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { File } from "expo-file-system";
import { Ionicons } from "@expo/vector-icons";
import { useAuth as useClerkAuth } from "@clerk/expo";
import { useFocusEffect, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import MomentProofCard from "@/components/MomentProofCard";
import MomentPlayer from "@/components/MomentPlayer";
import {
  localMoments,
  momentsRequest,
  removeLocalMoment,
  uploadMoment,
  type LocalMoment,
} from "@/utils/moments";
type SavedMoment = {
  id: number;
  giftId: string;
  amount: number;
  senderName?: string;
  giftName?: string;
  createdAt: string;
  durationMs?: number;
  captureMode?: "live-gift-v1" | null;
  status: "ready" | "uploading";
};
export default function MomentsScreen() {
  const colors = useColors(),
    insets = useSafeAreaInsets(),
    router = useRouter();
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  const [playing, setPlaying] = useState<string | null>(null),
    [busy, setBusy] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["moments", user?.uid],
    enabled: !!user,
    refetchInterval: 3000,
    queryFn: async () => {
      const local = await localMoments(user!.uid);
      try {
        const remote = await momentsRequest("", getToken);
        return { local, saved: remote.moments as SavedMoment[], error: "" };
      } catch (e) {
        return {
          local,
          saved: [] as SavedMoment[],
          error: e instanceof Error ? e.message : "Could not load Moments",
        };
      }
    },
  });
  const { refetch } = query;
  useFocusEffect(
    useCallback(() => {
      if (user) void refetch();
    }, [user?.uid, refetch]),
  );
  const merged = new Map<string, SavedMoment | LocalMoment>();
  for (const row of query.data?.saved ?? []) merged.set(row.giftId, row);
  for (const row of query.data?.local ?? []) {
    const saved = merged.get(row.giftId);
    merged.set(
      row.giftId,
      saved?.status === "ready" ? { ...row, ...saved } : { ...saved, ...row },
    );
  }
  const rows = [...merged.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const fg = { color: colors.foreground },
    muted = { color: colors.mutedForeground };
  const play = async (row: SavedMoment | LocalMoment) => {
    setBusy(row.giftId);
    try {
      if (
        Platform.OS !== "web" &&
        row.captureMode === "live-gift-v1" &&
        "uri" in row &&
        row.uri
      ) {
        const file = new File(row.uri);
        if (file.exists && file.size) {
          setPlaying(row.uri);
          return;
        }
      }
      if (row.status === "ready" && row.id) {
        setPlaying((await momentsRequest(`/${row.id}/play`, getToken)).url);
      } else {
        Alert.alert(
          "Moment is not ready",
          "Retry uploading this clip to finish saving your Moment.",
        );
      }
    } catch (e) {
      Alert.alert(
        "Playback unavailable",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setBusy(null);
    }
  };
  const remove = (row: SavedMoment | LocalMoment) =>
    Alert.alert("Delete Moment?", "This removes the clip from your Moments.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              if (row.id)
                await momentsRequest(`/${row.id}`, getToken, "DELETE");
              await removeLocalMoment(user!.uid, row.giftId);
              await refetch();
            } catch (e) {
              Alert.alert(
                "Could not delete",
                e instanceof Error ? e.message : "Try again.",
              );
            }
          })();
        },
      },
    ]);
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 10,
            borderColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel="Back to settings"
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, fg]}>Moments</Text>
        <TouchableOpacity
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel="About Moments"
          onPress={() =>
            Alert.alert(
              "Moments",
              "Gifts of 500+ coins capture up to 7 seconds of your camera and microphone. Clips are private to you. The crown is captured in the live video as it happens.\n\nIf gifts overlap, the first reaction finishes and the next is marked as not recorded. Failed uploads can be retried here.",
            )
          }
        >
          <Ionicons
            name="information-circle-outline"
            size={22}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 14,
          paddingBottom: insets.bottom + 32,
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => {
              void refetch();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {__DEV__ && user ? <MomentProofCard uid={user.uid} /> : null}
        <Text style={[styles.caption, muted]}>
          Your reactions · 500+ coin gifts
        </Text>
        {!!query.data?.error && (
          <Text accessibilityRole="alert" style={{ color: "#FF8CA7" }}>
            {query.data.error}
          </Text>
        )}
        {query.isPending ? (
          <ActivityIndicator color={colors.primary} />
        ) : rows.length === 0 ? (
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                alignItems: "center",
                gap: 14,
                paddingVertical: 40,
              },
            ]}
          >
            <Ionicons
              name="videocam-outline"
              size={32}
              color={colors.primary}
            />
            <Text style={[styles.medium, fg]}>
              Your next big gift becomes a Moment
            </Text>
            <Text style={[styles.caption, muted, { textAlign: "center" }]}>
              Go live on Android to test recording.
            </Text>
          </View>
        ) : (
          rows.map((row) => {
            const local =
              "recipientUid" in row ? (row as LocalMoment) : undefined;
            const interrupted =
              row.status === "recording" &&
              Date.now() - Date.parse(row.createdAt) > 30000;
            const playable =
              row.status === "ready" ||
              (local?.captureMode === "live-gift-v1" &&
                !!local.uri &&
                row.status === "failed");
            return (
              <View
                key={row.giftId}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    gap: 12,
                  },
                ]}
              >
                <View style={styles.row}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[styles.medium, fg]}>
                      {row.giftName || "Gift"} · {row.amount.toLocaleString()}{" "}
                      coins
                    </Text>
                    <Text style={[styles.caption, muted]}>
                      From {row.senderName || "a supporter"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.button}
                    accessibilityRole="button"
                    accessibilityLabel="Delete Moment"
                    disabled={
                      (row.status === "recording" && !interrupted) ||
                      (row.status === "uploading" &&
                        Date.now() - Date.parse(row.createdAt) < 30000)
                    }
                    onPress={() => remove(row)}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={colors.mutedForeground}
                    />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.caption, muted]}>
                  {new Date(row.createdAt).toLocaleString()}
                </Text>
                <Text
                  style={[
                    styles.caption,
                    {
                      color:
                        row.status === "failed" || interrupted
                          ? "#FF8CA7"
                          : colors.mutedForeground,
                    },
                  ]}
                >
                  {interrupted
                    ? "Recording was interrupted. Try another qualifying gift."
                    : row.status === "failed"
                      ? local?.error
                      : row.status === "ready"
                        ? `${((row.durationMs ?? 7000) / 1000).toFixed(1)}s · Private`
                        : row.status === "recording"
                          ? "Recording reaction…"
                          : "Saving clip…"}
                </Text>
                <View style={styles.row}>
                  {playable && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={busy === row.giftId}
                      onPress={() => {
                        void play(row);
                      }}
                      style={[
                        styles.action,
                        { backgroundColor: colors.primary },
                      ]}
                    >
                      <Ionicons name="play" size={16} color="white" />
                      <Text style={[styles.medium, { color: "white" }]}>
                        {busy === row.giftId ? "Opening…" : "Play"}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {local?.uri &&
                    (row.status === "failed" ||
                      (row.status === "uploading" &&
                        Date.now() - Date.parse(row.createdAt) > 30000)) && (
                      <TouchableOpacity
                        accessibilityRole="button"
                        onPress={() => {
                          void uploadMoment(local, getToken).then(() =>
                            refetch(),
                          );
                        }}
                        style={styles.action}
                      >
                        <Text style={[styles.medium, fg]}>Retry upload</Text>
                      </TouchableOpacity>
                    )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      <Modal
        visible={!!playing}
        animationType="slide"
        onRequestClose={() => setPlaying(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "black",
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }}
        >
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close playback"
            onPress={() => setPlaying(null)}
            style={[styles.button, { alignSelf: "flex-end", marginRight: 16 }]}
          >
            <Ionicons name="close" size={26} color="white" />
          </TouchableOpacity>
          {playing && <MomentPlayer key={playing} uri={playing} />}
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  button: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 21, fontFamily: "Inter_700Bold" },
  medium: { fontSize: 15, fontFamily: "Inter_500Medium" },
  caption: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  card: { padding: 18, borderRadius: 16, borderWidth: 1 },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
  action: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
});
