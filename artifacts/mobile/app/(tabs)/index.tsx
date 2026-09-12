import { t, useAppLanguage, localizedTextStyle } from "@/i18n";
import { FollowingActivity } from "@/components/FollowingActivity";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewabilityConfig,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetUserFollowing,
  useListStreams,
} from "@workspace/api-client-react";
import { AccountHeader } from "@/components/AccountHeader";
import { StreamCard } from "@/components/StreamCard";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const CATEGORIES = ["All", "Premium", "Gaming", "Music", "Talk", "Art"];

export default function DiscoveryScreen() {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const selectedFeed = pathname.endsWith("/following") ? "following" : "discover";
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [manualRefreshing, setManualRefreshing] = React.useState(false);
  const [visibleChannelIds, setVisibleChannelIds] = useState<Set<string>>(new Set());

  const VIEWABILITY_CONFIG = useRef<ViewabilityConfig>({
    itemVisiblePercentThreshold: 40,
  }).current;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      setVisibleChannelIds(new Set(viewableItems.map((t) => t.key as string)));
    },
    [],
  );

  const viewabilityCallbackRef = useRef(onViewableItemsChanged);
  viewabilityCallbackRef.current = onViewableItemsChanged;
  const stableOnViewableItemsChanged = useCallback(
    (info: { viewableItems: ViewToken[] }) => viewabilityCallbackRef.current(info),
    [],
  );

  const { data, isLoading, refetch } = useListStreams({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { refetchInterval: 8000 } as any,
  });
  const { data: followingData } = useGetUserFollowing(user?.uid ?? 0, {
    query: { enabled: !!user?.uid, staleTime: 30_000 } as any,
  });
  const handleManualRefresh = React.useCallback(async () => {
    setManualRefreshing(true);
    await refetch();
    setManualRefreshing(false);
  }, [refetch]);

  const streams = data?.streams ?? [];
  const followedUids = new Set((followingData?.users ?? []).map((followedUser) => followedUser.uid));
  const feedStreams =
    selectedFeed === "following"
      ? streams.filter((stream) => followedUids.has(stream.hostUid))
      : streams;
  const filtered =
    selectedCategory === "All"
      ? feedStreams
      : feedStreams.filter((s) => selectedCategory === "Premium" ? !!s.requiredGift : s.category === selectedCategory);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <AccountHeader>
        {selectedFeed === "discover" && (
          <TouchableOpacity
            testID="discover-user-search"
            style={styles.searchButton}
            onPress={() => router.push("/search-users")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t("Search usernames")}
          >
            <Ionicons name="search-outline" size={22} color="#FFFFFF" style={styles.searchIcon} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.goLiveBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/go-live" as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="radio" size={14} color="#FFF" />
          <Text style={[localizedTextStyle(), styles.goLiveBtnText]}>{t("Go Live")}</Text>
        </TouchableOpacity>
      </AccountHeader>

      {/* Category filter — fixed-height row, no layout shifts */}
      <View style={styles.categoryRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
        >
          {CATEGORIES.map((item) => {
            const active = item === selectedCategory;
            return (
              <TouchableOpacity
                key={item}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: active
                      ? colors.primary
                      : colors.secondary,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setSelectedCategory(item)}
                activeOpacity={0.8}
              >
                <Text
                  style={[localizedTextStyle(), [
                    styles.categoryChipText,
                    { color: active ? "#FFF" : colors.mutedForeground },
                  ]]}
                >
                  {t(item === "All" ? "All categories" : item)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {selectedFeed === "discover" && <FollowingActivity />}

      {/* Stream grid */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          numColumns={2}
          keyExtractor={(item) => item.channelId}
          contentContainerStyle={[
            styles.grid,
            {
              paddingBottom:
                insets.bottom + (Platform.OS === "web" ? 34 : 0) + 80,
            },
          ]}
          columnWrapperStyle={styles.row}
          refreshControl={
            <RefreshControl
              refreshing={manualRefreshing}
              onRefresh={handleManualRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name="radio-outline"
                size={48}
                color={colors.mutedForeground}
              />
              <Text style={[localizedTextStyle(), [styles.emptyTitle, { color: colors.foreground }]]}>
                {selectedFeed === "following" ? t("No followed creators are live") : t("No live streams")}
              </Text>
              <Text
                style={[localizedTextStyle(), [styles.emptyText, { color: colors.mutedForeground }]]}
              >
                {selectedFeed === "following"
                  ? t("Live streams from people you follow will appear here")
                  : t("Be the first to go live")}
              </Text>
              {selectedFeed === "discover" ? (
                <TouchableOpacity
                  style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                  onPress={() => router.push("/go-live" as any)}
                  activeOpacity={0.8}
                >
                  <Text style={[localizedTextStyle(), styles.emptyBtnText]}>{t("Go Live Now")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          onViewableItemsChanged={stableOnViewableItemsChanged}
          viewabilityConfig={VIEWABILITY_CONFIG}
          renderItem={({ item }) => (
            <StreamCard
              stream={item}
              isVisible={visibleChannelIds.has(item.channelId)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchButton: { width: 30, height: 36, alignItems: "center", justifyContent: "center", marginRight: 14, transform: [{ translateY: -3 }] },
  searchIcon: { transform: [{ translateY: 2 }] },
  goLiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
  },
  goLiveBtnText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  /* Pill row — tight vertical wrap, no layout shifts when a chip is selected */
  categoryRow: {
    flexShrink: 0,
  },
  categoryList: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignItems: "center",
    gap: 8,
  },
  categoryChip: {
    height: 28,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    lineHeight: 14,
    includeFontPadding: false,
  },
  grid: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  row: {
    justifyContent: "space-between",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  emptyBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  emptyBtnText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
});
