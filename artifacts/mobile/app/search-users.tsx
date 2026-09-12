import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSearchUsers } from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useAppLanguage } from "@/i18n";

export default function SearchUsersScreen() {
  const { t, localizedTextStyle } = useAppLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const query = search.trim();
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const results = useSearchUsers({ q: debounced }, {
    query: {
      enabled: !!debounced && query === debounced,
      // Blocking changes the visible results, so isolate the cache per account.
      queryKey: ["discover-user-search", user?.uid ?? null, debounced],
      staleTime: 0,
    },
  });
  const searching = !!query && (query !== debounced || results.isFetching);
  const users = query && query === debounced && !results.isError ? results.data?.users ?? [] : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={22} color={colors.mutedForeground} />
          <TextInput
            style={[styles.input, { color: colors.foreground }, localizedTextStyle()]}
            value={search}
            onChangeText={setSearch}
            placeholder={t("Search usernames")}
            accessibilityLabel={t("Search usernames")}
            placeholderTextColor={colors.mutedForeground}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={64}
            returnKeyType="search"
            onSubmitEditing={() => { setDebounced(query); Keyboard.dismiss(); }}
          />
          {!!search && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Clear search")} onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity accessibilityRole="button" onPress={() => { Keyboard.dismiss(); router.back(); }} style={styles.cancel}>
          <Text style={[localizedTextStyle(), { color: colors.primary }]}>{t("Cancel")}</Text>
        </TouchableOpacity>
      </View>
      {searching ? <ActivityIndicator color={colors.primary} style={styles.status} /> : (
        <FlatList
          data={users}
          keyExtractor={item => String(item.uid)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.result, { borderBottomColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={t("View {v0}'s profile", { v0: item.name })}
              onPress={() => {
                Keyboard.dismiss();
                router.push({ pathname: "/profile/[hostUid]", params: { hostUid: String(item.uid), name: item.name } });
              }}
            >
              <Avatar uid={item.uid} name={item.name} avatarUri={item.avatarImageUrl ?? undefined} size={44} />
              <Text numberOfLines={1} style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.status}>
              <Text style={[styles.empty, localizedTextStyle(), { color: colors.mutedForeground }]}>
                {!query ? t("Search usernames") : results.isError ? t("Check your connection and try again.") : t("No users found")}
              </Text>
              {!!query && results.isError && (
                <TouchableOpacity accessibilityRole="button" onPress={() => void results.refetch()} style={styles.cancel}>
                  <Text style={[localizedTextStyle(), { color: colors.primary }]}>{t("Try again")}</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 14, minHeight: 46 },
  input: { flex: 1, fontSize: 16, paddingVertical: 10, fontFamily: "Inter_400Regular" },
  cancel: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  result: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  status: { padding: 32, alignItems: "center" },
  empty: { textAlign: "center", fontSize: 15 },
});
