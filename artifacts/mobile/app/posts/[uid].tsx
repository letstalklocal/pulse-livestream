import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getGetUserPostsQueryKey, useGetUserPosts, getSavedPosts } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useSeenPosts } from "@/hooks/useSeenPosts";
import { useColors } from "@/hooks/useColors";
import { PhotoOptions } from "@/components/PhotoOptions";
import { PostFooter } from "@/components/PostFooter";

type Photo = { id: number; imageUrl: string; caption: string; ownerUserId: number };

// Mount only after data arrives, so initialScrollIndex opens the chosen photo without a visible jump.
function PhotoGallery({ posts, initialIndex, onIndexChange }: { posts: Photo[]; initialIndex: number; onIndexChange: (index: number) => void }) {
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
          onIndexChange(Math.max(0, nearest));
          setActiveIndex(Math.abs(page - nearest) <= 0.4 ? nearest : null);
        }}
        renderItem={({ item }) => <View style={{ width: size.width, height: size.height }}>
          <Image source={{ uri: item.imageUrl }} resizeMode="contain" style={{ flex: 1, width: "100%" }} onLoad={() => setLoaded(current => current.has(item.id) ? current : new Set([...current, item.id]))} />
        </View>} /> : null}
    </View>
    {posts[visibleIndex] ? <PostFooter key={posts[visibleIndex].id} postId={posts[visibleIndex].id} ownerUid={posts[visibleIndex].ownerUserId} caption={posts[visibleIndex].caption} /> : null}
  </>;
}

export default function PostsScreen() {
  const { uid, name, postId, saved } = useLocalSearchParams<{ uid: string; name: string; postId?: string; saved?: string }>();
  const { user } = useAuth();
  const ownerUid = Number(uid);
  const validOwner = Number.isInteger(ownerUid) && ownerUid > 0;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const ownQuery = useGetUserPosts(ownerUid, { query: { queryKey: getGetUserPostsQueryKey(ownerUid), enabled: validOwner && saved !== "1" } });
  const savedQuery = useQuery({ queryKey: ["saved-posts", user?.uid], queryFn: () => getSavedPosts(), enabled: saved === "1" && !!user });
  const query = saved === "1" ? savedQuery : ownQuery;
  // Keep a saved gallery stable while a bookmark is removed from inside it.
  const savedSnapshot = useRef<{ uid: number; posts: Photo[] } | null>(null);
  if (savedSnapshot.current?.uid !== user?.uid) savedSnapshot.current = null;
  if (saved === "1" && user && savedQuery.data && !savedSnapshot.current) savedSnapshot.current = { uid: user.uid, posts: savedQuery.data.posts };
  const posts = useMemo(() => saved === "1" ? savedSnapshot.current?.posts ?? [] : [...(ownQuery.data?.posts ?? [])].sort((a, b) => b.id - a.id), [saved, user?.uid, savedQuery.data, ownQuery.data]);
  const initialIndex = postId ? posts.findIndex(post => post.id === Number(postId)) : 0;
  const [position, setPosition] = useState<{ route: string; index: number } | null>(null);
  const route = `${uid}:${postId ?? "latest"}:${saved ?? "0"}`;
  const visibleIndex = position?.route === route ? position.index : Math.max(0, initialIndex);
  return <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
    <View style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 12 }}>
      <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back" hitSlop={12}><Ionicons name="chevron-back" size={26} color={colors.foreground} /></TouchableOpacity>
      <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "600", flex: 1 }} numberOfLines={1}>{saved === "1" ? "Saved posts" : name || "Posts"}</Text>
      {posts.length ? <Text style={{ color: colors.mutedForeground, fontSize: 13, minWidth: 64, textAlign: "right" }}>{Math.min(visibleIndex + 1, posts.length)} of {posts.length}</Text> : null}
      {posts[visibleIndex] && initialIndex >= 0 && !query.isError ? <PhotoOptions key={posts[visibleIndex].id} postId={posts[visibleIndex].id} ownerUid={posts[visibleIndex].ownerUserId} color={colors.foreground} /> : null}
    </View>
    {!validOwner ? <Text style={{ color: colors.foreground, padding: 24 }}>Profile not found.</Text> : query.isLoading ? <ActivityIndicator color={colors.primary} /> : query.isError ?
      (query.error as { status?: number } | null)?.status === 403 ? <Text style={{ color: colors.foreground, padding: 24 }}>Posts are shared with friends. Follow each other to view.</Text> : <TouchableOpacity onPress={() => void query.refetch()}><Text style={{ color: colors.foreground, padding: 24 }}>Could not load posts. Tap to retry.</Text></TouchableOpacity> : initialIndex < 0 ?
      <Text style={{ color: colors.mutedForeground, padding: 24 }}>This photo is no longer available.</Text> : posts.length ?
      <PhotoGallery key={route} posts={posts} initialIndex={initialIndex} onIndexChange={index => setPosition({ route, index })} /> :
      <Text style={{ color: colors.mutedForeground, padding: 24 }}>No posts available.</Text>}
  </View>;
}
