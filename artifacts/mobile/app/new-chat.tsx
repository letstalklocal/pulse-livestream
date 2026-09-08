import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetUserFollowing } from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function NewChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const followingQuery = useGetUserFollowing(user?.uid ?? 0, {
    query: { enabled: !!user?.uid, staleTime: 30000 } as any,
  });
  const following = followingQuery.data?.users ?? [];
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return following;
    return following.filter((contact) => contact.name.toLowerCase().includes(query));
  }, [following, search]);

  const openDm = (peerId: number, peerName: string) => {
    router.replace({
      pathname: "/dm/[peerId]",
      params: { peerId: String(peerId), peerName },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.fixedTop, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Back to messages"
          >
            <Ionicons name="chevron-back" size={26} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>New Message</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search" size={19} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search contacts"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch("")} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={19} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {followingQuery.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          style={styles.contactList}
          data={filtered}
          keyExtractor={(item) => String(item.uid)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={Keyboard.dismiss}
          contentContainerStyle={[
            styles.contactListContent,
            filtered.length === 0 && styles.emptyListContent,
            { paddingBottom: insets.bottom + 20 },
          ]}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.contactRow, { borderBottomColor: colors.border }]}
              onPress={() => openDm(item.uid, item.name)}
              activeOpacity={0.75}
            >
              <Avatar uid={item.uid} name={item.name} size={48} />
              <Text style={[styles.contactName, { color: colors.foreground }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={44} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {following.length === 0 ? "No contacts yet" : "No contacts found"}
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {following.length === 0
                  ? "Follow someone to start a conversation."
                  : "Try searching for a different name."}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fixedTop: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 14,
  },
  header: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  headerSpacer: { width: 44 },
  searchBox: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginHorizontal: 16,
    paddingHorizontal: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingVertical: 0,
  },
  contactList: { flex: 1 },
  contactListContent: { flexGrow: 1 },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    minHeight: 72,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contactName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyListContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  emptyText: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
  },
});