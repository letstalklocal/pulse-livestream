import React, { useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { addPostComment, deletePostComment, getPostComments } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "./Avatar";

export function PostCommentsSheet({ postId, ownerUid, onClose }: { postId: number; ownerUid: number; onClose: () => void }) {
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const client = useQueryClient();
  const [text, setText] = useState("");
  const request = useRef({ text: "", id: Crypto.randomUUID() });
  const comments = useInfiniteQuery({
    queryKey: ["post-comments", postId, user?.uid],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => getPostComments(postId, pageParam ? { before: pageParam } : undefined),
    getNextPageParam: page => page.nextCursor ?? undefined,
    retry: 1,
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["post-comments", postId] }),
      client.invalidateQueries({ queryKey: ["post-activity", postId] }),
    ]);
  };
  const send = useMutation({
    mutationFn: async () => {
      const value = text.trim();
      if (request.current.text !== value) request.current = { text: value, id: Crypto.randomUUID() };
      return addPostComment(postId, { text: value, requestId: request.current.id });
    },
    onSuccess: async () => { setText(""); request.current = { text: "", id: Crypto.randomUUID() }; await refresh(); },
  });
  const remove = useMutation({ mutationFn: (commentId: number) => deletePostComment(postId, commentId), onSuccess: refresh,
    onError: error => Alert.alert("Comment not deleted", error.message) });
  const rows = [...new Map(comments.data?.pages.flatMap(page => page.comments).map(row => [row.id, row]) ?? []).values()];
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.header}><Text style={[styles.title, { color: colors.foreground }]}>Comments</Text><TouchableOpacity style={styles.icon} accessibilityLabel="Close comments" onPress={onClose}><Ionicons name="close" size={24} color={colors.foreground} /></TouchableOpacity></View>
        <FlatList data={rows} keyExtractor={row => String(row.id)} keyboardShouldPersistTaps="handled" style={styles.list}
          refreshing={comments.isRefetching && !comments.isFetchingNextPage} onRefresh={() => void comments.refetch()}
          ListEmptyComponent={comments.isPending ? <ActivityIndicator color={colors.primary} /> : comments.isError ? <TouchableOpacity onPress={() => void comments.refetch()}><Text style={[styles.empty, { color: colors.foreground }]}>Couldn't load comments. Retry</Text></TouchableOpacity> : <Text style={[styles.empty, { color: colors.mutedForeground }]}>No comments yet</Text>}
          ListFooterComponent={comments.hasNextPage ? <TouchableOpacity style={styles.loadMore} disabled={comments.isFetchingNextPage} onPress={() => void comments.fetchNextPage()}><Text style={{ color: colors.primary }}>{comments.isFetchingNextPage ? "Loading..." : comments.isFetchNextPageError ? "Retry loading comments" : "Load more"}</Text></TouchableOpacity> : null}
          renderItem={({ item }) => <View style={styles.comment}>
            <Avatar uid={item.uid} name={item.name} size={32} />
            <View style={styles.commentBody}><Text style={[styles.author, { color: colors.foreground }]}>{item.name}</Text><Text style={[styles.commentText, { color: colors.foreground }]}>{item.text}</Text></View>
            {user && (item.uid === user.uid || ownerUid === user.uid) ? <TouchableOpacity style={styles.icon} disabled={remove.isPending} accessibilityLabel="Delete comment" onPress={() => Alert.alert("Delete comment?", undefined, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => remove.mutate(item.id) }])}><Ionicons name="trash-outline" size={18} color={colors.mutedForeground} /></TouchableOpacity> : null}
          </View>} />
        {send.isError ? <Text style={[styles.error, { color: colors.primary }]}>{send.error.message || "Couldn't post comment. Try again."}</Text> : null}
        {user ? <View style={[styles.composer, { borderTopColor: colors.border }]}>
          <TextInput value={text} onChangeText={setText} editable={!send.isPending} maxLength={1000} multiline placeholder="Add a comment..." placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
          <TouchableOpacity style={styles.icon} accessibilityRole="button" accessibilityLabel="Post comment" accessibilityState={{ disabled: !text.trim() || send.isPending, busy: send.isPending }} disabled={!text.trim() || send.isPending} onPress={() => send.mutate()}>
            {send.isPending ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="arrow-up-circle" size={32} color={text.trim() ? colors.primary : colors.mutedForeground} />}
          </TouchableOpacity>
        </View> : <TouchableOpacity style={styles.loadMore} onPress={() => { onClose(); router.push("/(auth)/sign-in"); }}><Text style={{ color: colors.primary }}>Sign in to comment</Text></TouchableOpacity>}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { height: "75%", borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  header: { height: 52, flexShrink: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 20, paddingRight: 8 },
  title: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  list: { flex: 1 },
  empty: { padding: 24, textAlign: "center" },
  loadMore: { padding: 16, alignItems: "center" },
  comment: { flexDirection: "row", gap: 10, paddingLeft: 16, paddingRight: 4, paddingVertical: 12 },
  commentBody: { flex: 1, gap: 4 },
  author: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  commentText: { fontSize: 14, lineHeight: 20, fontFamily: "Inter_400Regular" },
  composer: { flexDirection: "row", alignItems: "center", padding: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, flexShrink: 0 },
  input: { flex: 1, minHeight: 44, maxHeight: 100, padding: 10, borderWidth: 1, borderRadius: 8, fontSize: 14 },
  error: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 13 },
});
