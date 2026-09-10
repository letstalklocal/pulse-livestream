import React, { useRef, useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getPostActivity, setPostReaction } from "@workspace/api-client-react";
import { PostCommentsSheet } from "./PostCommentsSheet";

export function PostFooter({ postId, ownerUid, caption }: {
  postId: number;
  ownerUid: number;
  caption: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [hasMore, setHasMore] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const { user } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const busy = useRef(false);
  const key = ["post-activity", postId, user?.uid];
  const activity = useQuery({ queryKey: key, queryFn: () => getPostActivity(postId), staleTime: 10000, retry: 1 });
  const reaction = useMutation({ mutationFn: (data: { kind: "like" | "save"; active: boolean }) => setPostReaction(postId, data) });
  const liked = activity.data?.liked ?? false;
  const saved = activity.data?.saved ?? false;
  const react = async (kind: "like" | "save") => {
    if (!user) { router.push("/(auth)/sign-in"); return; }
    if (busy.current) return;
    busy.current = true;
    try {
      const current = activity.data ?? (await activity.refetch()).data;
      if (!current) throw new Error("Couldn't load post activity. Try again.");
      const active = !(kind === "like" ? current.liked : current.saved);
      await reaction.mutateAsync({ kind, active });
      client.setQueryData(key, { ...current, liked: kind === "like" ? active : current.liked, saved: kind === "save" ? active : current.saved, likeCount: current.likeCount + (kind === "like" ? active ? 1 : -1 : 0) });
      await client.invalidateQueries({ queryKey: ["post-activity", postId] });
      if (kind === "save") await client.invalidateQueries({ queryKey: ["saved-posts"] });
    } catch (error) { Alert.alert("Post action failed", error instanceof Error ? error.message : "Please try again."); }
    finally { busy.current = false; }
  };
  return <>
    <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.iconButton} accessibilityRole="button" accessibilityLabel={`${liked ? "Unlike post" : "Like post"}, ${activity.data?.likeCount ?? 0} likes`} accessibilityState={{ selected: liked, disabled: reaction.isPending }} disabled={reaction.isPending} onPress={() => void react("like")}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={26} color={liked ? colors.primary : colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.count, { color: liked ? colors.primary : colors.foreground }]}>{activity.data && activity.data.likeCount > 0 ? activity.data.likeCount >= 1000 ? `${(activity.data.likeCount / 1000).toFixed(1)}k` : activity.data.likeCount : ""}</Text>
        <TouchableOpacity style={styles.iconButton} accessibilityRole="button" accessibilityLabel={`Comments, ${activity.data?.commentCount ?? 0}`} onPress={() => setShowComments(true)}>
          <Ionicons name="chatbubble-outline" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.count, { color: colors.foreground }]}>{activity.data && activity.data.commentCount > 0 ? activity.data.commentCount >= 1000 ? `${(activity.data.commentCount / 1000).toFixed(1)}k` : activity.data.commentCount : ""}</Text>
        <View style={styles.spacer} />
        <TouchableOpacity style={styles.iconButton} accessibilityRole="button" accessibilityLabel={saved ? "Unsave post" : "Save post"} accessibilityState={{ selected: saved, disabled: reaction.isPending }} disabled={reaction.isPending} onPress={() => void react("save")}>
          <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={25} color={colors.foreground} />
        </TouchableOpacity>
      </View>
      <View style={styles.captionArea}>
        <Text style={[styles.caption, styles.measureCaption]} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" onTextLayout={event => setHasMore(event.nativeEvent.lines.length > 2)}>{caption}</Text>
        <Text style={[styles.caption, { color: colors.foreground }]} numberOfLines={2}>{caption}</Text>
        {hasMore ? <TouchableOpacity style={styles.more} hitSlop={4} accessibilityRole="button" accessibilityLabel="Read full caption" onPress={() => setExpanded(true)}>
          <Text style={[styles.moreText, { color: colors.mutedForeground }]}>More</Text>
        </TouchableOpacity> : null}
      </View>
    </View>
    {showComments ? <PostCommentsSheet postId={postId} ownerUid={ownerUid} onClose={() => setShowComments(false)} /> : null}
    <Modal visible={expanded} transparent animationType="slide" onRequestClose={() => setExpanded(false)}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} accessibilityLabel="Close caption" onPress={() => setExpanded(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Caption</Text>
            <TouchableOpacity style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Close caption" onPress={() => setExpanded(false)}><Ionicons name="close" size={24} color={colors.foreground} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.fullCaption}><Text selectable style={[styles.caption, { color: colors.foreground }]}>{caption}</Text></ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  footer: { flexShrink: 0, height: 108, paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth },
  actions: { height: 44, flexDirection: "row", alignItems: "center", gap: 0 },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  spacer: { flex: 1 },
  count: { minWidth: 12, flexShrink: 0, fontSize: 13, fontFamily: "Inter_500Medium" },
  captionArea: { height: 60, marginHorizontal: 8, overflow: "hidden" },
  caption: { fontSize: 14, lineHeight: 20, fontFamily: "Inter_400Regular" },
  measureCaption: { position: "absolute", top: 0, left: 0, right: 0, opacity: 0 },
  more: { height: 20, alignSelf: "flex-start", justifyContent: "center", paddingRight: 16 },
  moreText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { maxHeight: "65%", borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 20, paddingRight: 8, height: 52 },
  sheetTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  fullCaption: { paddingHorizontal: 20, paddingBottom: 16 },
});
