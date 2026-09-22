import { PostGiftTotal } from "@/components/PostGiftTotal";
import { usePurchases } from "@/context/PurchasesContext";
import { t, useAppLanguage, localizedTextStyle, appLocale } from "@/i18n";
import { AccountSafetyMenu } from "@/components/AccountSafetyMenu";
import { PhotoOptions } from "@/components/PhotoOptions";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AccessibilityInfo,
  Animated,
  Dimensions,
  Image,
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
  getGetUserQueryKey,
  getGetFollowStatusQueryKey,
  getGetUserFollowingQueryKey,
  getGetUserFollowersQueryKey,
  useGetUser,
  useGetUserPosts,
  getGetUserPostsQueryKey,
  useGetUserStreams,
  useFollowUser,
  useUnfollowUser,
  useGetFollowStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { useColors } from "@/hooks/useColors";
import { POST_ASPECT_RATIO } from "@/utils/postLayout";
import { PostFooter } from "@/components/PostFooter";
import { useAuth } from "@/context/AuthContext";

const { width } = Dimensions.get("window");
const GRID_CELL = (width - 4) / 3;

function formatDate(iso: string, locale: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function fmtCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

export default function PublicProfileScreen() {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const colors = useColors();
  const [historyView, setHistoryView] = useState<"grid" | "feed">("grid");
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

  const { data: userData, isLoading: userLoading, refetch: refetchUser } = useGetUser(uid, {
    query: { refetchOnWindowFocus: false, retry: false } as any,
  });
  const { data: historyData } = useGetUserStreams(uid, {
    query: { refetchOnWindowFocus: false } as any,
  });

  const { data: postsData, isLoading: postsLoading, isError: postsError, error: postsFailure, refetch: refetchPosts } = useGetUserPosts(uid, {
    query: { queryKey: getGetUserPostsQueryKey(uid), enabled: uid > 0 },
  });
  const posts = postsError ? [] : postsData?.posts ?? [];

  const followerUid = currentUser?.uid;
  const canFollow = !!followerUid && followerUid !== uid;
  const { isPro } = usePurchases();
  const canViewConnections = !!currentUser && (followerUid === uid || isPro);
  const vipFloat = useRef(new Animated.Value(0)).current;
  const openingConnections = useRef(false);
  const [showVipUnlocked, setShowVipUnlocked] = useState<"followers" | "following" | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; listener.remove(); };
  }, []);
  useFocusEffect(useCallback(() => {
    openingConnections.current = false;
    setShowVipUnlocked(null);
    vipFloat.setValue(0);
    return () => { vipFloat.stopAnimation(); openingConnections.current = false; };
  }, [vipFloat, uid, followerUid, isPro]));

  const { data: followStatusData, refetch: refetchFollowStatus } = useGetFollowStatus(
    uid,
    { followerUid: followerUid ?? 0 },
    { query: { enabled: canFollow, refetchOnWindowFocus: false } as any },
  );

  useFocusEffect(useCallback(() => {
    void refetchUser();
    if (uid > 0) void refetchPosts();
    if (canFollow) void refetchFollowStatus();
  }, [uid, canFollow, refetchUser, refetchFollowStatus, refetchPosts]));

  const isFollowing = followStatusData?.isFollowing ?? false;

  const followMutation = useFollowUser();
  const unfollowMutation = useUnfollowUser();

  const profile = userData?.user;
  const displayName = profile?.name ?? paramName ?? "Unknown";
  const bio = profile?.bio ?? "Streaming live on Pulse";
  const followersCount = profile?.followersCount ?? 0;
  const followingCount = profile?.followingCount ?? 0;
  const streamHistory = historyData?.streams ?? [];

  const openConnections = (tab: 'followers' | 'following') => {
    if (!canViewConnections || openingConnections.current) return;
    const open = () => router.push({ pathname: '/connections/[uid]', params: { uid: String(uid), tab, name: displayName } });
    if (!isPro) { open(); return; }
    openingConnections.current = true;
    vipFloat.setValue(0);
    setShowVipUnlocked(tab);
    Animated.timing(vipFloat, { toValue: 1, duration: 1300, useNativeDriver: true }).start(({ finished }) => {
      if (finished) { setShowVipUnlocked(null); open(); }
    });
  };

  const invalidateUser = () => {
    if (followerUid) {
      void queryClient.invalidateQueries({ queryKey: getGetUserFollowingQueryKey(followerUid) });
      void queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(followerUid), exact: true });
    }
    void queryClient.invalidateQueries({ queryKey: getGetUserFollowersQueryKey(uid) });
    void queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(uid), exact: true });
    void queryClient.invalidateQueries({ queryKey: getGetFollowStatusQueryKey(uid, { followerUid: followerUid ?? 0 }) });
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
      <View style={{ position: "absolute", right: 20, top: topInset + 16, zIndex: 10 }}>
        <AccountSafetyMenu uid={uid} source="profile" color="#FFF" />
      </View>
      <TouchableOpacity
        style={[styles.backBtn, { top: topInset + 10 }]}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Ionicons name="chevron-back" size={22} color="#FFF" />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.cover}>
          <Image
            source={profile?.profileBackgroundImageUrl
              ? { uri: profile.profileBackgroundImageUrl }
              : require("@/assets/images/profile-cover-sunset.png")}
            style={styles.absoluteFill}
            resizeMode="cover"
          />
          <View style={styles.coverShade} />
          {profile?.country ? (
            <View style={styles.coverLocation}>
              <Ionicons name="location" size={16} color="#FFF" />
              <Text style={styles.coverLocationText}>{profile.country}</Text>
            </View>
          ) : null}
        </View>

        {userLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : (
          <>
            {/* Profile info */}
            <View style={styles.profileBlock}>
              <Avatar uid={uid} name={displayName} avatarUri={profile?.avatarImageUrl ?? paramAvatarUri} size={120} />

              <Text style={[styles.displayName, { color: colors.foreground }]}>
                {displayName}
              </Text>
              {bio ? (
                <Text style={[styles.bio, { color: colors.mutedForeground }]}>{bio}</Text>
              ) : null}

              {/* Stats */}
              <View style={styles.statsRow}>

                <TouchableOpacity disabled={!canViewConnections} style={styles.stat} accessibilityRole="button" accessibilityLabel={t("View followers")}
                  onPress={() => openConnections("followers")}>
                {showVipUnlocked === "followers" && <Animated.View pointerEvents="none" accessibilityLiveRegion="polite"
                  style={[styles.vipUnlocked, {
                    opacity: vipFloat.interpolate({ inputRange: [0, 0.15, 0.65, 1], outputRange: [0, 1, 1, 0] }),
                    transform: [{ translateY: reduceMotion ? 0 : vipFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -32] }) }],
                  }]}>
                  <Text style={[styles.vipUnlockedText, localizedTextStyle(), { color: "#FFD700" }]}>{t("VIP Unlocked")}</Text>
                </Animated.View>}
                  <Text style={[styles.statValue, { color: colors.foreground }]}>
                    {fmtCount(followersCount)}
                  </Text>
                  <Text style={[localizedTextStyle(), [styles.statLabel, { color: colors.mutedForeground }]]}>{t("Followers")}</Text>
                </TouchableOpacity>
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity disabled={!canViewConnections} style={styles.stat} accessibilityRole="button" accessibilityLabel={t("View following")}
                  onPress={() => openConnections("following")}>
                {showVipUnlocked === "following" && <Animated.View pointerEvents="none" accessibilityLiveRegion="polite"
                  style={[styles.vipUnlocked, {
                    opacity: vipFloat.interpolate({ inputRange: [0, 0.15, 0.65, 1], outputRange: [0, 1, 1, 0] }),
                    transform: [{ translateY: reduceMotion ? 0 : vipFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -32] }) }],
                  }]}>
                  <Text style={[styles.vipUnlockedText, localizedTextStyle(), { color: "#FFD700" }]}>{t("VIP Unlocked")}</Text>
                </Animated.View>}
                  <Text style={[styles.statValue, { color: colors.foreground }]}>
                    {fmtCount(followingCount)}
                  </Text>
                  <Text style={[localizedTextStyle(), [styles.statLabel, { color: colors.mutedForeground }]]}>{t("Following")}</Text>
                </TouchableOpacity>
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: colors.foreground }]}>
                    {streamHistory.length}
                  </Text>
                  <Text style={[localizedTextStyle(), [styles.statLabel, { color: colors.mutedForeground }]]}>{t("Streams")}</Text>
                </View>
              </View>

              {/* Follow + Message buttons — show for any user viewing another person's profile */}
              {uid !== 0 && uid !== followerUid && (
                <View style={styles.actionRow}>
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
                      <Text style={[localizedTextStyle(), [styles.followBtnText, { color: isFollowing ? colors.foreground : "#FFF" }]]}>
                        {followPending ? "…" : isFollowing ? t("Following") : t("Follow")}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.messageBtn,
                      { borderColor: colors.border, flex: canFollow ? undefined : 1 },
                    ]}
                    onPress={() => {
                      if (!followerUid) {
                        router.push("/(auth)/sign-in");
                        return;
                      }
                      router.push({ pathname: "/dm/[peerId]", params: { peerId: hostUid, peerName: displayName } });
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="chatbubble-outline" size={16} color={colors.foreground} style={{ marginRight: 6 }} />
                    <Text style={[localizedTextStyle(), [styles.followBtnText, { color: colors.foreground }]]}>{t("Message")}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

        {/* Grid divider */}
        <View style={[styles.gridHeader, { borderColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.viewOption,
              historyView === "grid" && { borderBottomColor: colors.primary },
            ]}
            onPress={() => setHistoryView("grid")}
            activeOpacity={0.7}
            accessibilityLabel={t("Grid view")}
          >
            <Ionicons
              name={historyView === "grid" ? "grid" : "grid-outline"}
              size={20}
              color={historyView === "grid" ? colors.primary : colors.mutedForeground}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.viewOption,
              historyView === "feed" && { borderBottomColor: colors.primary },
            ]}
            onPress={() => setHistoryView("feed")}
            activeOpacity={0.7}
            accessibilityLabel={t("Feed view")}
          >
            <Ionicons
              name={historyView === "feed" ? "list" : "list-outline"}
              size={22}
              color={historyView === "feed" ? colors.primary : colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>

        {/* Photo posts */}
        {postsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : postsError && (postsFailure as { status?: number } | null)?.status === 403 ? (
          <View style={styles.emptyGrid}><Text style={[localizedTextStyle(), [styles.emptyText, { color: colors.mutedForeground }]]}>{t("Posts are shared with friends. Follow each other to view.")}</Text></View>
        ) : postsError ? (
          <TouchableOpacity style={styles.emptyGrid} onPress={() => void refetchPosts()} accessibilityRole="button">
            <Text style={[localizedTextStyle(), [styles.emptyText, { color: colors.mutedForeground }]]}>{t("Could not load posts. Tap to retry.")}</Text>
          </TouchableOpacity>
        ) : posts.length === 0 ? (
          <View style={styles.emptyGrid}>
            <Ionicons name="images-outline" size={36} color={colors.mutedForeground} />
            <Text style={[localizedTextStyle(), [styles.emptyText, { color: colors.mutedForeground }]]}>{t("No posts yet")}</Text>
          </View>
        ) : historyView === "grid" ? (
          <View style={styles.grid}>
            {posts.map((post) => (
              <TouchableOpacity key={post.id} style={styles.gridCell} activeOpacity={0.85} accessibilityLabel={t("Open photo")}
                onPress={() => router.push({ pathname: "/posts/[uid]", params: { uid: String(uid), name: displayName, postId: String(post.id) } })}>
                <Image source={{ uri: post.imageUrl }} style={styles.absoluteFill} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.feed}>
            {posts.map((post) => (
                <View
                  key={post.id}
                  style={[styles.feedCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.feedPostHeader}>
                    <Avatar
                      uid={uid}
                      name={displayName}
                      avatarUri={profile?.avatarImageUrl ?? paramAvatarUri}
                      size={34}
                      borderWidth={1}
                    />
                    <View style={styles.feedPostIdentity}>
                      <Text style={[styles.feedUserName, { color: colors.foreground }]}>
                        {displayName}
                      </Text>
                      <Text style={[styles.feedDate, { color: colors.mutedForeground }]}>{formatDate(post.createdAt, appLocale())}</Text>
                    </View>
                    <PhotoOptions postId={post.id} ownerUid={uid} color={colors.mutedForeground} />
                  </View>

                  <View style={styles.feedMedia}>
                    <Image source={{ uri: post.imageUrl }} style={styles.absoluteFill} resizeMode="contain" />
                    <PostGiftTotal postId={post.id} />
                  </View>

                  <PostFooter postId={post.id} ownerUid={post.ownerUserId} caption={post.caption} />
                </View>
            ))}
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
  absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  cover: { height: 232, position: "relative", overflow: "hidden", borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  coverShade: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(3,5,12,0.28)" },
  coverLocation: { position: "absolute", right: 16, bottom: 16, flexDirection: "row", alignItems: "center", gap: 4 },
  coverLocationText: { color: "#FFF", fontSize: 10, fontFamily: "Inter_600SemiBold" },
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
    gap: 8,
    paddingBottom: 8,
    marginTop: -60,
  },
  displayName: {
    fontSize: 20,
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
  vipUnlocked: { position: 'absolute', top: -28, left: -55, right: -55, alignItems: 'center', zIndex: 20 },
  vipUnlockedText: { fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statDivider: { width: 1, height: 30, marginHorizontal: 12 },
  statValue: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  followBtn: {
    paddingHorizontal: 28,
    paddingVertical: 11,
    borderRadius: 24,
  },
  messageBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 24,
    borderWidth: 1,
  },
  followBtnText: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  gridHeader: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 32,
    marginTop: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  viewOption: {
    width: 52,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  emptyGrid: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyText: { fontSize: 15, fontWeight: "600", fontFamily: "Inter_500Medium" },
  emptySubText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  gridCell: {
    width: GRID_CELL,
    height: GRID_CELL / POST_ASPECT_RATIO,
    flexShrink: 0,
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
  feed: {
    paddingTop: 14,
    gap: 18,
  },
  feedCard: {
    width: "100%",
    borderWidth: 1,
  },
  feedPostHeader: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
  },
  feedPostIdentity: {
    flex: 1,
    gap: 2,
  },
  feedUserName: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  feedDate: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  feedMedia: {
    width: "100%",
    aspectRatio: POST_ASPECT_RATIO,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  feedActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 13,
    paddingTop: 12,
    paddingBottom: 9,
  },
  feedPrimaryActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 17,
  },
  feedCaption: {
    paddingHorizontal: 13,
    paddingBottom: 14,
    gap: 6,
  },
  feedViewerText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  feedCategory: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_400Regular",
  },
  feedCaptionName: {
    fontFamily: "Inter_700Bold",
  },
});
