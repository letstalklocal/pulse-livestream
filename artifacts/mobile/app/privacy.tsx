import { usePrivacyPreferences } from "@/hooks/usePrivacyPreferences";
import { useAuth } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { useColors } from "@/hooks/useColors";

type BlockedAccount = { uid: number; name: string; avatarImageUrl: string | null };
type Page = { accounts: BlockedAccount[]; total: number; nextCursor: number | null };
const base = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
export default function PrivacyScreen() {
  const { userId, isLoaded, getToken } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const client = useQueryClient();
  const privacy = usePrivacyPreferences();
  const [choice, setChoice] = useState<"partyInvites" | "postsVisibility" | null>(null);
  const [showBlocked, setShowBlocked] = useState(false);
  const [selected, setSelected] = useState<BlockedAccount | null>(null);
  const request = async (path: string, method = "GET") => {
    const token = await getToken();
    if (!token) throw new Error("Please sign in again.");
    const response = await fetch(`${base}/api${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(method === "DELETE" ? "Couldn’t unblock this account. Please try again." : "Couldn’t load blocked accounts. Please try again.");
    return response.json();
  };
  const list = useInfiniteQuery({ queryKey: ["privacy-blocks", userId], enabled: !!userId,
    initialPageParam: null as number | null, queryFn: ({ pageParam }): Promise<Page> => request(`/privacy/blocks${pageParam ? `?after=${pageParam}` : ""}`), getNextPageParam: page => page.nextCursor ?? undefined });
  const unblock = useMutation({ mutationFn: (account: BlockedAccount) => request(`/privacy/blocks/${account.uid}`, "DELETE"),
    onSuccess: async () => {
      setSelected(null);
      await Promise.all([client.invalidateQueries({ queryKey: ["privacy-blocks", userId] }), client.invalidateQueries({ queryKey: ["account-safety"] }), client.invalidateQueries({ predicate: query => typeof query.queryKey[0] === "string" && (query.queryKey[0].includes("/streams") || query.queryKey[0].includes("/users") || query.queryKey[0].includes("/posts")) })]);
    },
  });
  if (!isLoaded) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  if (!userId) return <Redirect href="/(auth)/sign-in" />;
  const people = list.data?.pages.flatMap(page => page.accounts) ?? [];
  const total = list.data?.pages[0]?.total;
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={[styles.header, { paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 10, borderColor: colors.border }]}><TouchableOpacity accessibilityLabel="Back" onPress={() => showBlocked ? setShowBlocked(false) : router.back()} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}><Ionicons name="chevron-back" size={20} color={colors.foreground} /></TouchableOpacity><Text style={[styles.title, { color: colors.foreground }]}>{showBlocked ? "Blocked accounts" : "Privacy"}</Text><View style={{ width: 38 }} /></View>
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
      {!showBlocked ? <>
        {privacy.isPending && <ActivityIndicator color={colors.primary} />}
        {privacy.isError && <TouchableOpacity accessibilityRole="button" onPress={() => { void privacy.refetch(); }}><Text style={styles.error}>Couldn’t load privacy settings. Tap to retry.</Text></TouchableOpacity>}
        {privacy.save.isError && <Text accessibilityRole="alert" style={styles.error}>{privacy.save.error.message}</Text>}
        {privacy.save.isPending && <Text accessibilityLiveRegion="polite" style={[styles.detail, { color: colors.mutedForeground }]}>Saving…</Text>}
        <Text style={[styles.heading, { color: colors.mutedForeground }]}>PROFILE</Text>
        <View style={[styles.menuRow, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={{ flex: 1, gap: 5 }}><Text style={[styles.label, { color: colors.foreground }]}>Hide Location</Text><Text style={[styles.detail, { color: colors.mutedForeground }]}>Hide your country from your profile</Text></View><Switch accessibilityLabel="Hide Location" value={privacy.preferences.hideLocation} disabled={!privacy.isSuccess || privacy.save.isPending} onValueChange={hideLocation => privacy.save.mutate({ hideLocation })} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFF" /></View>
        <View style={[styles.menuRow, { backgroundColor: colors.card, borderColor: colors.border, opacity: 0.55 }]}><View style={{ flex: 1, gap: 5 }}><Text style={[styles.label, { color: colors.foreground }]}>Hide VIP Level</Text><Text style={[styles.detail, { color: colors.mutedForeground }]}>Coming later</Text></View><Switch accessibilityLabel="Hide VIP Level, coming later" disabled value={false} trackColor={{ false: colors.border }} /></View>
        <Text style={[styles.heading, { color: colors.mutedForeground }]}>INVITES</Text>
        <TouchableOpacity accessibilityRole="button" disabled={!privacy.isSuccess || privacy.save.isPending} style={[styles.menuRow, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setChoice("partyInvites")}><Text style={[styles.label, { color: colors.foreground, flex: 1 }]}>Who can invite Party</Text><Text style={{ color: colors.mutedForeground }}>{privacy.preferences.partyInvites === "friends" ? "Friends" : "Everyone"}</Text><Ionicons name="chevron-forward" size={17} color={colors.mutedForeground} /></TouchableOpacity>
        <Text style={[styles.heading, { color: colors.mutedForeground }]}>POSTS</Text>
        <TouchableOpacity accessibilityRole="button" disabled={!privacy.isSuccess || privacy.save.isPending} style={[styles.menuRow, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setChoice("postsVisibility")}><Text style={[styles.label, { color: colors.foreground, flex: 1 }]}>Who can see Posts</Text><Text style={{ color: colors.mutedForeground }}>{privacy.preferences.postsVisibility === "friends" ? "Friends" : "Everyone"}</Text><Ionicons name="chevron-forward" size={17} color={colors.mutedForeground} /></TouchableOpacity>
        <Text style={[styles.detail, { color: colors.mutedForeground, marginBottom: 12 }]}>Friends are people you follow who follow you back.</Text>
        <Text style={[styles.heading, { color: colors.mutedForeground }]}>BLOCKED ACCOUNTS</Text>
        <TouchableOpacity accessibilityRole="button" style={[styles.menuRow, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => { setShowBlocked(true); void list.refetch(); }}><Ionicons name="person-remove-outline" size={22} color={colors.primary} /><View style={{ flex: 1, gap: 5 }}><Text style={[styles.label, { color: colors.foreground }]}>Blocked accounts</Text><Text style={[styles.detail, { color: colors.mutedForeground }]}>Blocks apply across the app</Text></View>{total !== undefined && <Text style={{ color: colors.mutedForeground }}>{total}</Text>}<Ionicons name="chevron-forward" size={17} color={colors.mutedForeground} /></TouchableOpacity>
        <Text style={[styles.description, { color: colors.mutedForeground, marginTop: 14 }]}>Blocking stops contact, gifts, invitations, and access to each other’s profiles, posts, and live streams while signed in. You can block someone from their profile, chat, or your live viewer controls.</Text>
      </> : <>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>These accounts are blocked across Pulse. Unblocking here clears the block everywhere. Existing messages are kept for reporting.</Text>
        {list.isPending && <ActivityIndicator color={colors.primary} />}
        {list.isError && <TouchableOpacity accessibilityRole="button" onPress={() => { void list.refetch(); }}><Text style={styles.error}>Couldn’t load this list. Tap to retry.</Text></TouchableOpacity>}
        {list.isSuccess && !people.length && <View style={styles.empty}><Ionicons name="shield-checkmark-outline" size={42} color={colors.mutedForeground} /><Text style={[styles.label, { color: colors.foreground }]}>No blocked accounts</Text></View>}
        {people.map(person => <View key={person.uid} style={[styles.person, { backgroundColor: colors.card, borderColor: colors.border }]}><Avatar uid={person.uid} name={person.name} avatarUri={person.avatarImageUrl ?? undefined} /><View style={{ flex: 1, gap: 4 }}><Text style={[styles.label, { color: colors.foreground }]}>{person.name}</Text><Text style={[styles.detail, { color: colors.mutedForeground }]}>ID {person.uid}</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Unblock ${person.name}`} disabled={unblock.isPending} onPress={() => { unblock.reset(); setSelected(person); }} style={[styles.unblock, { borderColor: colors.border }]}><Text style={{ color: colors.primary, fontWeight: "600" }}>Unblock</Text></TouchableOpacity></View>)}
        {list.hasNextPage && <TouchableOpacity accessibilityRole="button" disabled={list.isFetchingNextPage} onPress={() => { void list.fetchNextPage(); }} style={{ padding: 20, alignItems: "center" }}><Text style={{ color: colors.primary }}>{list.isFetchingNextPage ? "Loading…" : "Load more"}</Text></TouchableOpacity>}
      </>}
    </ScrollView>
    <Modal visible={!!choice} transparent animationType="fade" onRequestClose={() => { if (!privacy.save.isPending) setChoice(null); }}>
      <View style={styles.scrim}><View style={[styles.modal, { backgroundColor: colors.card }]}><Text style={[styles.title, { color: colors.foreground }]}>{choice === "partyInvites" ? "Who can invite Party" : "Who can see Posts"}</Text><Text style={[styles.description, { color: colors.mutedForeground, marginTop: 14 }]}>Friends are people you follow who follow you back. Blocked accounts remain blocked.</Text>
        {privacy.save.isError && <Text accessibilityRole="alert" style={styles.error}>{privacy.save.error.message}</Text>}
        {(["everyone", "friends"] as const).map(value => <TouchableOpacity key={value} accessibilityRole="radio" accessibilityState={{ selected: !!choice && privacy.preferences[choice] === value }} disabled={privacy.save.isPending} style={[styles.choice, { borderColor: colors.border }]} onPress={() => { if (choice) privacy.save.mutate({ [choice]: value }, { onSuccess: () => setChoice(null) }); }}><Text style={[styles.label, { color: colors.foreground }]}>{value === "everyone" ? "Everyone" : "Friends"}</Text>{choice && privacy.preferences[choice] === value && <Ionicons name="checkmark" size={21} color={colors.primary} />}</TouchableOpacity>)}
        <TouchableOpacity accessibilityRole="button" disabled={privacy.save.isPending} onPress={() => setChoice(null)} style={{ padding: 18, alignItems: "center" }}><Text style={{ color: colors.foreground }}>Cancel</Text></TouchableOpacity>
      </View></View>
    </Modal>
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => { if (!unblock.isPending) setSelected(null); }}>
      <View style={styles.scrim}><View style={[styles.modal, { backgroundColor: colors.card }]}><Text style={[styles.title, { color: colors.foreground }]}>Unblock {selected?.name}?</Text><Text style={[styles.description, { color: colors.mutedForeground, marginTop: 14 }]}>This removes your block across Pulse. You can interact again unless they have also blocked you. Temporary live-room restrictions still apply.</Text>{unblock.isError && <Text accessibilityRole="alert" style={styles.error}>{unblock.error.message}</Text>}<TouchableOpacity accessibilityRole="button" disabled={unblock.isPending} onPress={() => { if (selected) unblock.mutate(selected); }} style={[styles.button, { backgroundColor: colors.primary }]}>{unblock.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: "#FFF", fontWeight: "600", fontSize: 15 }}>Unblock</Text>}</TouchableOpacity><TouchableOpacity accessibilityRole="button" disabled={unblock.isPending} onPress={() => setSelected(null)} style={{ padding: 18, alignItems: "center" }}><Text style={{ color: colors.foreground }}>Cancel</Text></TouchableOpacity></View></View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  heading: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.2, marginTop: 18, marginBottom: 10, marginLeft: 4 },
  choice: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 18, borderBottomWidth: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 }, back: { width: 38, height: 38, borderWidth: 1, borderRadius: 19, alignItems: "center", justifyContent: "center" }, title: { fontSize: 21, fontFamily: "Inter_700Bold" }, label: { fontSize: 15, fontFamily: "Inter_500Medium" }, detail: { fontSize: 12, lineHeight: 18 }, description: { fontSize: 14, lineHeight: 22, marginBottom: 20 }, menuRow: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12, minHeight: 82, flexDirection: "row", gap: 12, alignItems: "center" }, person: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 }, unblock: { paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: 10 }, empty: { alignItems: "center", gap: 18, paddingVertical: 50 }, error: { color: "#FF4D67", lineHeight: 22, marginBottom: 16 }, scrim: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.6)" }, modal: { borderRadius: 20, padding: 24 }, button: { padding: 16, alignItems: "center", borderRadius: 12 },
});
