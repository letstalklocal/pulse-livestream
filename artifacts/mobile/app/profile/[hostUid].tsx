import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetUser,
  useGetUserStreams,
  useFollowUser,
  useUnfollowUser,
  useGetFollowStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

const { width } = Dimensions.get("window");
const GRID_CELL = (width - 4) / 3;

const CATEGORY_COLORS: Record<string, [string, string]> = {
  Gaming: ["#7B4FFF", "#3D1FA8"],
  Music:  ["#FF1966", "#8B0030"],
  Talk:   ["#00C896", "#006B51"],
  Art:    ["#FF8C00", "#8B4700"],
  Dance:  ["#FF1966", "#8B0030"],
  Other:  ["#4FC3F7", "#1565C0"],
};

function catColors(cat: string): [string, string] {
  return CATEGORY_COLORS[cat] ?? ["#4FC3F7", "#1565C0"];
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

export default function PublicProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  const { hostUid, name: paramName, avatarUri: paramAvatarUri } = useLocalSearchParams<{
    hostUid: string;
    name: string;
    avatarUri?: string;
  }>();

  const uid = parseInt(hostUid ?? "0", 10);
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const { data: userData, isLoading: userLoading } = useGetUser(uid, {
    query: { refetchOnWindowFocus: false, retry: false } as any,
  });
  const { data: historyData } = useGetUserStreams(uid, {
    query: { refetchOnWindowFocus: false } as any,
  });

  const followerUid = currentUser?.uid;
  const canFollow = !!followerUid && followerUid !== uid;

  const { data: followStatusData } = useGetFollowStatus(
    uid,
    { followerUid: followerUid ?? 0 },
    { query: { enabled: canFollow, refetchOnWindowFocus: false } as any },
  );

  const isFollowing = followStatusData?.isFollowing ?? false;

  const followMutation = useFollowUser();
  const unfollowMutation = useUnfollowUser();

  const profile = userData?.user;
  const displayName = profile?.name ?? paramName ?? "Unknown";
  const bio = profile?.bio ?? "Streaming live on Pulse";
  const followersCount = profile?.followersCount ?? 0;
  const followingCount = profile?.followingCount ?? 0;
  const streamHistory = historyData?.streams ?? [];

  const invalidateUser = () => {
    void queryClient.invalidateQueries({ queryKey: ["getUser", uid] });
    void queryClient.invalidateQueries({ queryKey: ["getFollowStatus", uid] });
  };

  const toggleFollow = () => {
    if (!canFollow) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isFollowing) {
      unfollowMutation.mutate(
        { uid, data: { followerUid: followerUid! } },
        { onSettled: invalidateUser },
      );
    } else {
      followMutation.mutate(
        { uid, data: { followerUid: followerUid! } },
        { onSettled: invalidateUser },
      );
    }
  };

  const followPending = followMutation.isPending || unfollowMutation.isPending;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Back button */}
      <TouchableOpacity
        style={[styles.backBtn, { top: topInset + 10 }]}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Ionicons name="chevron-back" size={22} color={colors.foreground} />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header space */}
        <View style={{ height: topInset + 56 }} />

        {userLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : (
          <>
            {/* Profile info */}
            <View style={styles.profileBlock}>
              <Avatar uid={uid} name={displayName} avatarUri={paramAvatarUri} size={88} borderWidth={2} />

              <Text style={[styles.displayName, { color: colors.foreground }]}>
                {displayName}
              </Text>
              {bio ? (
                <Text style={[styles.bio, { color: colors.mutedForeground }]}>{bio}</Text>
              ) : null}

              {/* Stats */}
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: colors.foreground }]}>
                    {fmtCount(followersCount)}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Followers</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: colors.foreground }]}>
                    {fmtCount(followingCount)}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Following</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: colors.foreground }]}>
                    {streamHistory.length}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Streams</Text>
                </View>
              </View>

              {/* Follow button — only shown to signed-in users viewing someone else */}
              {canFollow && (
                <TouchableOpacity
                  style={[
                    styles.followBtn,
                    {
                      backgroundColor: isFollowing ? "transparent" : colors.primary,
                      borderColor: isFollowing ? colors.border : colors.primary,
                      borderWidth: 1,
                      opacity: followPending ? 0.6 : 1,
                    },
                  ]}
                  onPress={toggleFollow}
                  activeOpacity={0.8}
                  disabled={followPending}
                >
                  <Text style={[styles.followBtnText, { color: isFollowing ? colors.foreground : "#FFF" }]}>
                    {followPending ? "…" : isFollowing ? "Following" : "Follow"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Grid header */}
            <View style={[styles.gridHeader, { borderColor: colors.border }]}>
              <Ionicons name="grid-outline" size={20} color={colors.primary} />
            </View>

            {/* 3-column past streams grid */}
            {streamHistory.length === 0 ? (
              <View style={styles.emptyGrid}>
                <Ionicons name="radio-outline" size={36} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No past streams yet
                </Text>
              </View>
            ) : (
              <View style={styles.grid}>
                {streamHistory.map((item) => {
                  const [c1, c2] = catColors(item.category);
                  return (
                    <View key={item.id} style={[styles.gridCell, { backgroundColor: c2 }]}>
                      <View style={[StyleSheet.absoluteFill, { backgroundColor: c1, opacity: 0.5 }]} />
                      <Text style={styles.gridCellLabel}>{item.category.slice(0, 2).toUpperCase()}</Text>
                      <Text style={styles.gridCellDate}>{formatDate(item.startedAt)}</Text>
                      <View style={styles.gridCellViewers}>
                        <Ionicons name="eye-outline" size={10} color="rgba(255,255,255,0.7)" />
                        <Text style={styles.gridCellViewersText}>{item.peakViewers}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: {
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
  profileBlock: {
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 10,
    paddingBottom: 4,
  },
  displayName: {
    fontSize: 22,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  bio: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statDivider: { width: 1, height: 30, marginHorizontal: 12 },
  statValue: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  followBtn: {
    marginTop: 6,
    paddingHorizontal: 48,
    paddingVertical: 11,
    borderRadius: 24,
  },
  followBtnText: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  gridHeader: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  emptyGrid: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyText: { fontSize: 15, fontWeight: "600", fontFamily: "Inter_500Medium" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  gridCell: {
    width: GRID_CELL,
    height: GRID_CELL,
    margin: 0.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    padding: 6,
  },
  gridCellLabel: {
    fontSize: 22,
    fontWeight: "800",
    color: "rgba(255,255,255,0.25)",
    fontFamily: "Inter_700Bold",
  },
  gridCellDate: {
    fontSize: 9,
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  gridCellViewers: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    position: "absolute",
    bottom: 6,
    right: 6,
  },
  gridCellViewersText: {
    fontSize: 9,
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_400Regular",
  },
});
