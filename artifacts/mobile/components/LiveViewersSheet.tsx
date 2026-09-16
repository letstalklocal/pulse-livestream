import { useAppLanguage } from "@/i18n";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { getGetStreamModerationQueryKey, getGetStreamLeaderboardQueryKey, getGetStreamQueryKey, getGetStreamViewersQueryKey, useGetStreamModeration, useGetStreamLeaderboard, useModerateStreamViewer, type ModerateStreamViewerBodyAction } from "@workspace/api-client-react";
import { Avatar } from "./Avatar";
import { GoldCoinIcon } from "./GoldCoinIcon";
import { useIdleAutoClose } from "@/hooks/useIdleAutoClose";
import { mergeLiveViewers } from "@/utils/liveViewerList";

export function LiveViewersSheet({ channelId, onClose, onProfile, canManage = false, isHost = canManage }: {
  isHost?: boolean; canManage?: boolean; channelId: string; onClose: () => void; onProfile: (uid: number, name: string) => void;
}) {
  const { t, localizedTextStyle, appLocale } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const [tab, setTab] = useState<"viewers" | "restricted">("viewers");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useGetStreamModeration(channelId, { query: { queryKey: getGetStreamModerationQueryKey(channelId), enabled: canManage && !!channelId, refetchInterval: 5000 } });
  const mutation = useModerateStreamViewer();
  const leaderboard = useGetStreamLeaderboard(channelId, { query: { queryKey: getGetStreamLeaderboardQueryKey(channelId), enabled: !!channelId, refetchInterval: 10000 } });
  const merged = mergeLiveViewers(canManage ? query.data?.users ?? [] : [], leaderboard.data?.entries ?? []);
  const selected = canManage ? merged.find(user => user.uid === selectedUid) : undefined;
  const listQuery = canManage ? query : leaderboard;
  const people = merged.filter(user => (tab === "viewers" ? (user.present || user.coins > 0) && !user.removed && !user.blocked : user.muted || user.removed || user.blocked) && user.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const close = () => { if (!mutation.isPending) onClose(); };
  const resetAutoClose = useIdleAutoClose(close, !!selected || mutation.isPending);
  const act = (action: ModerateStreamViewerBodyAction) => {
    if (!canManage || !selected || mutation.isPending) return;
    const execute = () => {
      setError(null);
      mutation.mutate({ channelId, data: { viewerUid: selected.uid, action } }, {
        onSuccess: async () => {
          await Promise.all([
            client.invalidateQueries({ queryKey: getGetStreamModerationQueryKey(channelId) }),
            client.invalidateQueries({ queryKey: getGetStreamViewersQueryKey(channelId) }),
            client.invalidateQueries({ queryKey: getGetStreamQueryKey(channelId) }),
          ]);
          setSelectedUid(null);
        },
        onError: err => setError(err.message || "Couldn't update this viewer. Try again."),
      });
    };
    if (action === "block" || action === "remove") {
      Alert.alert(`${action === "block" ? "Block" : "Remove"} ${selected.name}?`, action === "block" ? t("This blocks contact and access to each other’s content and live streams across Pulse.") : t("They won't be able to rejoin this stream unless you allow them back."), [{ text: t("Cancel"), style: "cancel" }, { text: action === "block" ? t("Block") : t("Remove"), style: "destructive", onPress: execute }]);
    } else execute();
  };
  return <Modal visible transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={t("Close viewer list")} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onTouchStart={resetAutoClose}>
        <View style={styles.header}>
          {!isHost ? <TouchableOpacity style={styles.headerButton} onPress={close} disabled={mutation.isPending} accessibilityLabel={t("Close")}><Ionicons name="close" size={24} color="#FFF" /></TouchableOpacity> : null}
          <Text style={[localizedTextStyle(), styles.title]}>{t("Live Viewers")}</Text>
          {!selected ? <TouchableOpacity style={styles.headerButton} accessibilityRole="button" accessibilityLabel={t("Search viewers")} accessibilityState={{ expanded: searchOpen }} onPress={() => {
            if (searchOpen) { setSearch(""); Keyboard.dismiss(); }
            setSearchOpen(open => !open);
          }}><Ionicons name="search" size={23} color={searchOpen ? "#FF1966" : "#FFF"} /></TouchableOpacity> : null}
          {isHost ? <TouchableOpacity style={styles.headerButton} onPress={close} disabled={mutation.isPending} accessibilityLabel={t("Close")}><Ionicons name="close" size={24} color="#FFF" /></TouchableOpacity> : null}
        </View>
        {selected ? <>
          <View style={{ alignItems: "center", marginVertical: 12 }}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("View profile")} disabled={mutation.isPending} onPress={() => {
              if (mutation.isPending) return;
              onClose();
              onProfile(selected.uid, selected.name);
            }}>
              <Avatar uid={selected.uid} name={selected.name} avatarUri={selected.avatarImageUrl ?? undefined} size={60} />
            </TouchableOpacity>
            <Text style={[styles.text, { marginTop: 8 }]}>{selected.name}</Text>
          </View>
          {([
            [selected.muted ? "unmute" : "mute", selected.muted ? "Unmute chat" : "Mute chat for this stream"],
            [selected.removed ? "allow" : "remove", selected.removed ? "Allow back into this stream" : "Remove from this stream"],
            [selected.blocked ? "unblock" : "block", selected.blocked ? "Unblock from my streams" : "Block from my streams"],
          ] as [ModerateStreamViewerBodyAction, string][]).map(([action, label]) => <TouchableOpacity key={action} style={styles.action} disabled={mutation.isPending} onPress={() => act(action)}><Text style={[localizedTextStyle(), [styles.text, (action === "remove" || action === "block") && { color: "#FF6B80" }]]}>{t(label)}</Text></TouchableOpacity>)}
        </> : <>
          {canManage ? <View style={styles.tabs}>{(["viewers", "restricted"] as const).map(value => <TouchableOpacity key={value} style={[styles.tab, tab === value && { borderBottomColor: "#FF1966" }]} onPress={() => setTab(value)}><Text style={[localizedTextStyle(), styles.text]}>{value === "viewers" ? t("Viewers") : t("Restricted")}</Text></TouchableOpacity>)}</View> : null}
          {searchOpen ? <TextInput autoFocus value={search} onChangeText={value => { setSearch(value); resetAutoClose(); }} placeholder={t("Search viewers")} accessibilityLabel={t("Search viewers")} placeholderTextColor="#888" style={styles.search} autoCorrect={false} autoCapitalize="none" returnKeyType="search" /> : null}
          {canManage && leaderboard.isError ? <TouchableOpacity onPress={() => void leaderboard.refetch()}><Text style={styles.secondary}>{t("Couldn't load gift totals. Tap to retry.")}</Text></TouchableOpacity> : null}
          <ScrollView style={{ minHeight: 120 }} keyboardShouldPersistTaps="handled" onScroll={resetAutoClose} scrollEventThrottle={100}>
            {listQuery.isLoading ? <ActivityIndicator color="#FF1966" /> : listQuery.isError ? <TouchableOpacity onPress={() => void listQuery.refetch()}><Text style={[localizedTextStyle(), styles.secondary]}>{t("Couldn't load viewers. Tap to retry.")}</Text></TouchableOpacity> : people.map(person => <TouchableOpacity key={person.uid} style={styles.person} onPress={() => {
                if (canManage) { Keyboard.dismiss(); setError(null); setSelectedUid(person.uid); }
                else { onClose(); onProfile(person.uid, person.name); }
              }} accessibilityLabel={canManage ? t("Manage {v0}", { v0: person.name }) : person.name}>
              {person.rank ? <Text style={styles.medal}>{person.rank <= 3 ? ["🥇", "🥈", "🥉"][person.rank - 1] : person.rank}</Text> : null}
              <Avatar uid={person.uid} name={person.name} avatarUri={person.avatarImageUrl ?? undefined} size={40} />
              <View style={{ flex: 1 }}><Text style={styles.text} numberOfLines={1}>{person.name}</Text>{canManage ? <Text style={[localizedTextStyle(), styles.secondary]}>{[person.muted && "Chat muted", person.removed && "Removed", person.blocked && "Blocked"].filter(Boolean).join(" · ") || t(person.present ? "Watching" : "Not watching")}</Text> : null}</View>
              {person.coins > 0 ? <View style={styles.coinTotal}><GoldCoinIcon size={14} /><Text style={styles.text}>{person.coins.toLocaleString(appLocale())}</Text></View> : null}
              <Ionicons name="chevron-forward" color="#888" size={18} />
            </TouchableOpacity>)}
            {!listQuery.isLoading && !listQuery.isError && !people.length ? <Text style={[localizedTextStyle(), [styles.secondary, { paddingVertical: 24 }]]}>{search ? t("No matching viewers") : !canManage ? t("No gifts sent yet") : tab === "viewers" ? t("No viewers right now") : t("No restricted viewers")}</Text> : null}
          </ScrollView>
        </>}
        {mutation.isPending ? <ActivityIndicator color="#FF1966" /> : null}
        {error ? <Text style={{ color: "#FF6B80", marginTop: 8 }}>{t(error)}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { backgroundColor: "#17171D", padding: 18, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "80%" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, title: { color: "#FFF", fontSize: 22, fontFamily: "Inter_700Bold", flex: 1 },
  tabs: { flexDirection: "row", marginTop: 12 }, tab: { flex: 1, alignItems: "center", padding: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  headerButton: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  medal: { fontSize: 18, color: "#FFF", minWidth: 24, textAlign: "center" },
  coinTotal: { flexDirection: "row", alignItems: "center", gap: 5 },
  search: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 14, color: "#FFF", padding: 12, marginVertical: 12 },
  text: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 14 }, secondary: { color: "#999", fontSize: 12, marginTop: 4 },
  person: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }, action: { flexDirection: "row", gap: 12, paddingVertical: 15 },
});
