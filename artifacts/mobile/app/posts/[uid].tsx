import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getGetUserPostsQueryKey, useGetUserPosts } from "@workspace/api-client-react";
import { useSeenPosts } from "@/hooks/useSeenPosts";
import { useColors } from "@/hooks/useColors";
import { PhotoOptions } from "@/components/PhotoOptions";

type Photo = { id: number; imageUrl: string; caption: string };

// Mount only after data arrives, so initialScrollIndex opens the chosen photo without a visible jump.
function PhotoGallery({ posts, initialIndex, ownerUid }: { posts: Photo[]; initialIndex: number; ownerUid: number }) {
  const colors = useColors();
  const { ready, markSeen } = useSeenPosts();
  const [activeIndex, setActiveIndex] = useState<number | null>(initialIndex);
  const [visibleIndex, setVisibleIndex] = useState(initialIndex);
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set());
  const [size, setSize] = useState({ width: 0, height: 0 });
  const markRef = useRef(markSeen);
  markRef.current = markSeen;
  const activeId = activeIndex === null ? undefined : posts[activeIndex]?.id;
  useFocusEffect(useCallback(() => {
    if (!ready || !size.height || activeId === undefined || !loaded.has(activeId)) return;
    const timer = setTimeout(() => markRef.current([activeId]), 500);
    return () => clearTimeout(timer);
  }, [ready, size.height, activeId, loaded]));
  return <>
    {posts.length > 1 ? <Text style={{ color: colors.mutedForeground, textAlign: "center", paddingBottom: 8 }}>
      {visibleIndex + 1} of {posts.length}{visibleIndex === 0 ? " · Swipe left for older posts" : ""}
    </Text> : null}
    <View style={{ flex: 1 }} onLayout={({ nativeEvent: { layout } }) => setSize(current => current.width === layout.width && current.height === layout.height ? current : { width: layout.width, height: layout.height })}>
      {size.width > 0 && size.height > 0 ? <FlatList
        data={posts} keyExtractor={post => String(post.id)} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: size.width, offset: size.width * index, index })}
        scrollEventThrottle={16}
        onScroll={({ nativeEvent }) => {
          const page = Math.max(0, nativeEvent.contentOffset.x / size.width);
          const nearest = Math.min(posts.length - 1, Math.round(page));
          setVisibleIndex(Math.max(0, nearest));
          setActiveIndex(Math.abs(page - nearest) <= 0.4 ? nearest : null);
        }}
        renderItem={({ item }) => <View style={{ width: size.width, height: size.height, paddingBottom: 16 }}>
          <View style={{ paddingHorizontal: 20, paddingVertical: 8, alignItems: "flex-end" }}>
            <PhotoOptions postId={item.id} ownerUid={ownerUid} color={colors.foreground} />
          </View>
          <Image source={{ uri: item.imageUrl }} resizeMode="contain" style={{ flex: 1, width: "100%" }} onLoad={() => setLoaded(current => current.has(item.id) ? current : new Set([...current, item.id]))} />
          {item.caption ? <Text numberOfLines={4} style={{ color: colors.foreground, padding: 16 }}>{item.caption}</Text> : null}
        </View>} /> : null}
    </View>
  </>;
}

export default function PostsScreen() {
  const { uid, name, postId } = useLocalSearchParams<{ uid: string; name: string; postId?: string }>();
  const ownerUid = Number(uid);
  const validOwner = Number.isInteger(ownerUid) && ownerUid > 0;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const query = useGetUserPosts(ownerUid, { query: { queryKey: getGetUserPostsQueryKey(ownerUid), enabled: validOwner } });
  const posts = useMemo(() => [...(query.data?.posts ?? [])].sort((a, b) => b.id - a.id), [query.data]);
  const initialIndex = postId ? posts.findIndex(post => post.id === Number(postId)) : 0;
  return <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
    <View style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 14 }}>
      <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back" hitSlop={12}><Ionicons name="chevron-back" size={26} color={colors.foreground} /></TouchableOpacity>
      <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "600", flex: 1 }} numberOfLines={1}>{name || "Posts"}</Text>
    </View>
    {!validOwner ? <Text style={{ color: colors.foreground, padding: 24 }}>Profile not found.</Text> : query.isLoading ? <ActivityIndicator color={colors.primary} /> : query.isError ?
      <TouchableOpacity onPress={() => void query.refetch()}><Text style={{ color: colors.foreground, padding: 24 }}>Could not load posts. Tap to retry.</Text></TouchableOpacity> : initialIndex < 0 ?
      <Text style={{ color: colors.mutedForeground, padding: 24 }}>This photo is no longer available.</Text> : posts.length ?
      <PhotoGallery key={`${uid}:${postId ?? "latest"}`} posts={posts} initialIndex={initialIndex} ownerUid={ownerUid} /> :
      <Text style={{ color: colors.mutedForeground, padding: 24 }}>No posts available.</Text>}
  </View>;
}
