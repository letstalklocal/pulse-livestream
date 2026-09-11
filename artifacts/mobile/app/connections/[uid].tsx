import { t, useAppLanguage, localizedTextStyle } from "@/i18n";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetFollowStatusQueryKey, getGetUserFollowersQueryKey, getGetUserFollowingQueryKey,
  getGetUserQueryKey, useFollowUser, useGetUser, useGetUserFollowers,
  useGetUserFollowing, useUnfollowUser, type FollowingUser,
} from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

type Tab = "followers" | "following";

export default function ConnectionsScreen() {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const params = useLocalSearchParams<{ uid: string; tab?: Tab; name?: string }>();
  const uid = Number(params.uid);
  const validUid = Number.isInteger(uid) && uid > 0;
  const [tab, setTab] = useState<Tab>(params.tab === "following" ? "following" : "followers");
  const [search, setSearch] = useState("");
  const [pendingUid, setPendingUid] = useState<number | null>(null);
  const pendingRef = useRef(false);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const profile = useGetUser(uid, { query: { queryKey: getGetUserQueryKey(uid), enabled: validUid } });
  const followers = useGetUserFollowers(uid, { query: { queryKey: getGetUserFollowersQueryKey(uid), enabled: validUid } });
  const following = useGetUserFollowing(uid, { query: { queryKey: getGetUserFollowingQueryKey(uid), enabled: validUid } });
  const myFollowing = useGetUserFollowing(user?.uid ?? 0, { query: { queryKey: getGetUserFollowingQueryKey(user?.uid ?? 0), enabled: !!user } });
  const follow = useFollowUser();
  const unfollow = useUnfollowUser();
  const active = tab === "followers" ? followers : following;
  const followedIds = new Set(myFollowing.data?.users.map(person => person.uid) ?? []);
  const term = search.trim().toLocaleLowerCase();
  const people = (active.data?.users ?? []).filter(person =>
    person.name.toLocaleLowerCase().includes(term) || String(person.uid).includes(term),
  );
  const title = profile.data?.user.name ?? params.name ?? t("Connections");

  useFocusEffect(useCallback(() => {
    if (!validUid) return;
    void followers.refetch();
    void following.refetch();
    void profile.refetch();
    if (user) void myFollowing.refetch();
  }, [validUid, uid, user?.uid, followers.refetch, following.refetch, profile.refetch, myFollowing.refetch]));

  const toggleFollow = async (person: FollowingUser) => {
    if (!user || person.uid === user.uid || pendingRef.current || !myFollowing.data) return;
    pendingRef.current = true;
    setPendingUid(person.uid);
    try {
      const mutation = followedIds.has(person.uid) ? unfollow : follow;
      await mutation.mutateAsync({ uid: person.uid, data: { followerUid: user.uid } });
      // Keep both tabs, relationship buttons, and profile counts consistent.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetUserFollowingQueryKey(user.uid) }),
        queryClient.invalidateQueries({ queryKey: getGetUserFollowersQueryKey(person.uid) }),
        queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(user.uid), exact: true }),
        queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(person.uid), exact: true }),
        queryClient.invalidateQueries({ queryKey: getGetFollowStatusQueryKey(person.uid, { followerUid: user.uid }) }),
      ]);
    } catch (error) {
      Alert.alert(t("Couldn't update follow"), error instanceof Error ? error.message : t("Please try again."));
    } finally {
      pendingRef.current = false;
      setPendingUid(null);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Back")} onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={25} color={colors.foreground} />
        </TouchableOpacity>
        <Text numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        <View style={styles.back} />
      </View>
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(["followers", "following"] as const).map(value => {
          const count = (value === "followers" ? followers : following).data?.users.length;
          const selected = tab === value;
          return (
            <TouchableOpacity key={value} accessibilityRole="tab" accessibilityState={{ selected }}
              onPress={() => { setTab(value); setSearch(""); }}
              style={[styles.tab, { borderBottomColor: selected ? colors.primary : "transparent" }]}>
              <Text style={[localizedTextStyle(), [styles.tabText, { color: selected ? colors.foreground : colors.mutedForeground }]]}>
                {count !== undefined ? `${count} ` : ""}{value === "followers" ? t("Followers") : t("Following")}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={[styles.search, { backgroundColor: colors.card }]}>
        <Ionicons name="search" size={19} color={colors.mutedForeground} />
        <TextInput value={search} onChangeText={setSearch} placeholder={t("Search")} accessibilityLabel={t("Search {v0}", { v0: tab })}
          placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false} returnKeyType="search"
          style={[styles.searchInput, { color: colors.foreground }]} />
        {!!search && <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Clear search")} onPress={() => setSearch("")} hitSlop={10}>
          <Ionicons name="close-circle" size={19} color={colors.mutedForeground} />
        </TouchableOpacity>}
      </View>
      <FlatList data={people} keyExtractor={person => String(person.uid)} keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        refreshing={active.isRefetching} onRefresh={() => { void active.refetch(); if (user) void myFollowing.refetch(); }}
        ListEmptyComponent={<View style={styles.empty}>
          {!validUid ? <Text style={[localizedTextStyle(), { color: colors.mutedForeground }]}>{t("Profile not found.")}</Text>
            : active.isLoading ? <ActivityIndicator color={colors.primary} />
            : active.isError ? <>
              <Text style={[localizedTextStyle(), { color: colors.mutedForeground }]}>{t("Couldn't load {v0}.", { v0: tab })}</Text>
              <TouchableOpacity accessibilityRole="button" onPress={() => void active.refetch()} style={styles.retry}>
                <Text style={[localizedTextStyle(), { color: colors.primary }]}>{t("Try again")}</Text>
              </TouchableOpacity>
            </> : <>
              <Ionicons name={term ? "search-outline" : "people-outline"} size={36} color={colors.mutedForeground} />
              <Text style={[localizedTextStyle(), [styles.emptyTitle, { color: colors.foreground }]]}>{term ? t("No results") : tab === "followers" ? t("No followers yet") : t("Not following anyone yet")}</Text>
              {term && <Text style={[localizedTextStyle(), { color: colors.mutedForeground }]}>{t("Try another name or user ID.")}</Text>}
            </>}
        </View>}
        renderItem={({ item }) => {
          const isFollowing = followedIds.has(item.uid);
          return (
            <View style={styles.row}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("View {v0}'s profile", { v0: item.name })}
                style={styles.person} onPress={() => router.push(item.uid === user?.uid ? "/(tabs)/profile" : {
                  pathname: "/profile/[hostUid]", params: { hostUid: String(item.uid), name: item.name, avatarUri: item.avatarImageUrl ?? "" },
                })}>
                <Avatar uid={item.uid} name={item.name} avatarUri={item.avatarImageUrl ?? undefined} size={50} />
                <View style={styles.personText}>
                  <Text numberOfLines={1} style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
                  <Text numberOfLines={1} style={[localizedTextStyle(), [styles.bio, { color: colors.mutedForeground }]]}>{item.bio || t("ID: {v0}", { v0: item.uid })}</Text>
                </View>
              </TouchableOpacity>
              {!!user && item.uid !== user.uid && myFollowing.data && <TouchableOpacity
                accessibilityRole="button" accessibilityLabel={`${isFollowing ? "Unfollow" : "Follow"} ${item.name}`}
                disabled={pendingUid !== null} onPress={() => void toggleFollow(item)}
                style={[styles.followButton, { backgroundColor: isFollowing ? colors.card : colors.primary, borderColor: isFollowing ? colors.border : colors.primary, opacity: pendingUid !== null && pendingUid !== item.uid ? 0.5 : 1 }]}>
                {pendingUid === item.uid ? <ActivityIndicator size="small" color={isFollowing ? colors.foreground : "#FFF"} />
                  : <Text style={[localizedTextStyle(), [styles.followText, { color: isFollowing ? colors.foreground : "#FFF" }]]}>{isFollowing ? t("Following") : t("Follow")}</Text>}
              </TouchableOpacity>}
            </View>
          );
        }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, height: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontFamily: "Inter_600SemiBold", fontSize: 17 },
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: "center", paddingVertical: 15, borderBottomWidth: 2 },
  tabText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, margin: 16, paddingHorizontal: 12, borderRadius: 10 },
  searchInput: { flex: 1, height: 42, fontFamily: "Inter_400Regular", fontSize: 15 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  person: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  personText: { flex: 1 },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  bio: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 },
  followButton: { minWidth: 96, height: 34, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  followText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  emptyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17, textAlign: "center" },
  retry: { padding: 12 },
});
