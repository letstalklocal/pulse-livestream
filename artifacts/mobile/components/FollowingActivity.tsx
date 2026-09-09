import React, { useCallback } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { getGetUserFollowingQueryKey, useGetUserFollowing, useListStreams } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useSeenPosts } from "@/hooks/useSeenPosts";
import { Avatar } from "./Avatar";

export function FollowingActivity() {
  const { user } = useAuth();
  const colors = useColors();
  const router = useRouter();
  const { seen, ready } = useSeenPosts();
  const following = useGetUserFollowing(user?.uid ?? 0, {
    query: { queryKey: getGetUserFollowingQueryKey(user?.uid ?? 0), enabled: !!user?.uid, refetchInterval: 15000 },
  });
  const streams = useListStreams({ query: { enabled: !!user?.uid, refetchInterval: 15000 } as any });
  useFocusEffect(useCallback(() => {
    if (user?.uid) { void following.refetch(); void streams.refetch(); }
  }, [user?.uid, following.refetch, streams.refetch]));
  if (!user || !ready) return null;
  const seenIds = new Set(seen);
  const people = (following.data?.users ?? []).map(person => ({
    ...person,
    live: streams.data?.streams.find(stream => stream.hostUid === person.uid && !stream.channelId.endsWith("-demo")),
    unseen: person.postIds?.[0] != null && !seenIds.has(person.postIds[0]),
  })).filter(person => person.live || person.unseen).sort((a, b) =>
    Number(!!b.live) - Number(!!a.live) || (b.postIds?.[0] ?? 0) - (a.postIds?.[0] ?? 0) || a.uid - b.uid);
  if (!people.length) return null;
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {people.map(person => {
          const label = person.live ? person.live.requiredGift ? "PREMIUM" : "LIVE" : null;
          const ringColor = label === "PREMIUM" ? "#FFD700" : colors.primary;
          return (
            <TouchableOpacity key={person.uid} style={styles.person} accessibilityRole="button"
              accessibilityLabel={`${person.name}, ${label ?? "new posts"}`} onPress={() => {
                if (person.live) router.push({ pathname: "/stream/[channelId]", params: { channelId: person.live.channelId } });
                else router.push({ pathname: "/posts/[uid]", params: { uid: String(person.uid), name: person.name } });
              }}>
              <View style={[styles.ring, { borderColor: ringColor }]}>
                <Avatar uid={person.uid} name={person.name} avatarUri={person.avatarImageUrl ?? undefined} size={44} />
              </View>
              {label ? <View style={[styles.badge, { backgroundColor: ringColor }]}><Text style={[styles.badgeText, { color: label === "PREMIUM" ? "#111" : "#FFF" }]}>{label}</Text></View> : null}
              <Text numberOfLines={1} style={[styles.name, { color: colors.foreground }]}>{person.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 10 },
  person: { width: 64, alignItems: "center" },
  ring: { width: 54, height: 54, borderRadius: 27, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 42, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontWeight: "800" },
  name: { fontSize: 11, marginTop: 10 },
});
