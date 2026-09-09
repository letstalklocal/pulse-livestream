import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getGetUserPostsQueryKey, useGetUserPosts } from "@workspace/api-client-react";
import { useSeenPosts } from "@/hooks/useSeenPosts";
import { useColors } from "@/hooks/useColors";

export default function PostsScreen() {
  const { uid, name } = useLocalSearchParams<{ uid: string; name: string }>();
  const ownerUid = Number(uid);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { ready, markSeen } = useSeenPosts();
  const query = useGetUserPosts(ownerUid, { query: { queryKey: getGetUserPostsQueryKey(ownerUid), enabled: Number.isInteger(ownerUid) && ownerUid > 0 } });
  const [activeIndex, setActiveIndex] = useState<number | null>(0);
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set());
  const markRef = useRef(markSeen);
  markRef.current = markSeen;
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(0);
  const [visibleIndex, setVisibleIndex] = useState(0);
  // Open newest first, with older posts available by swiping sideways.
  const posts = useMemo(() =>
    [...(query.data?.posts ?? [])].sort((a, b) => b.id - a.id),
  [query.data]);
  const activeId = activeIndex === null ? undefined : posts[activeIndex]?.id;
  // Track the actual full-screen page, including the first page without a swipe.
  // Background pages and unloaded/failed images must never clear a ring.
  useFocusEffect(useCallback(() => {
    if (!ready || !height || activeId === undefined || !loaded.has(activeId)) return;
    const timer = setTimeout(() => markRef.current([activeId]), 500);
    return () => clearTimeout(timer);
  }, [ready, height, activeId, loaded]));
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 14 }}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back" hitSlop={12}><Ionicons name="chevron-back" size={26} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "600" }}>{name || "Posts"}</Text>
      </View>
      {posts.length > 1 ? (
        <Text style={{ color: colors.mutedForeground, textAlign: "center", paddingBottom: 8 }}>
          {visibleIndex + 1} of {posts.length}{visibleIndex === 0 ? " · Swipe left for older posts" : ""}
        </Text>
      ) : null}
      <View style={{ flex: 1 }} onLayout={({ nativeEvent }) => {
        setHeight(nativeEvent.layout.height);
        setWidth(nativeEvent.layout.width);
      }}>
        {query.isLoading || !ready ? <ActivityIndicator color={colors.primary} /> : query.isError ? (
          <TouchableOpacity onPress={() => void query.refetch()}><Text style={{ color: colors.foreground, padding: 24 }}>Could not load posts. Tap to retry.</Text></TouchableOpacity>
        ) : height > 0 && width > 0 ? (
          <FlatList data={posts} keyExtractor={post => String(post.id)} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            scrollEventThrottle={16}
            onScroll={({ nativeEvent }) => {
              const page = Math.max(0, nativeEvent.contentOffset.x / width);
              const nearest = Math.min(posts.length - 1, Math.round(page));
              setVisibleIndex(Math.max(0, nearest));
              setActiveIndex(Math.abs(page - nearest) <= 0.4 ? nearest : null);
            }}
            ListEmptyComponent={<Text style={{ color: colors.mutedForeground, padding: 24 }}>No posts available.</Text>}
            renderItem={({ item }) => (
              <View style={{ width, height, paddingBottom: 16 }}>
                <Image source={{ uri: item.imageUrl }} resizeMode="contain" style={{ flex: 1, width: "100%" }} onLoad={() => {
                  setLoaded(current => current.has(item.id) ? current : new Set([...current, item.id]));
                }} />
                {item.caption ? <Text numberOfLines={4} style={{ color: colors.foreground, padding: 16 }}>{item.caption}</Text> : null}
              </View>
            )} />
        ) : null}
      </View>
    </View>
  );
}
