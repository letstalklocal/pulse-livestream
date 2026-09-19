import React, { useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppLanguage } from "@/i18n";
import { useIdleAutoClose } from "@/hooks/useIdleAutoClose";
import { videoRequest } from "@/utils/creatorVideos";
import { Avatar } from "./Avatar";
import { GoldCoinIcon } from "./GoldCoinIcon";

type Entry = { uid: number; name: string; avatarImageUrl: string | null; coins: number; gifts: number; watching?: boolean };
type Viewers = { viewers: number; coins: number; isOwner: boolean; entries: Entry[] };
export function VideoViewersSheet({ videoId, isOwner, onClose, onProfile }: {
  videoId: string; isOwner: boolean; onClose: () => void; onProfile: (uid: number, name: string) => void;
}) {
  const { getToken, userId } = useAuth();
  const { t, appLocale, localizedTextStyle } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const [searchOpen, setSearchOpen] = useState(false), [search, setSearch] = useState("");
  const resetIdle = useIdleAutoClose(onClose, false);
  const query = useQuery({
    queryKey: ["creator-video-viewers", userId, videoId, isOwner],
    queryFn: ({ signal }) => videoRequest<Viewers>(`/${videoId}/viewers`, getToken, "GET", undefined, signal),
    enabled: !!userId, refetchInterval: 5000, retry: false,
  });
  // Never render owner roster data in audience mode, even from a stale cache.
  const canSeePresence = isOwner && query.data?.isOwner;
  const entries = (query.data?.entries ?? []).map((person, index) => ({ ...person, rank: index + 1 })).filter(person =>
    (canSeePresence || person.coins > 0) && person.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const close = () => { Keyboard.dismiss(); onClose(); };
  const closeButton = <TouchableOpacity style={styles.headerButton} onPress={close} accessibilityLabel={t("Close")}><Ionicons name="close" size={24} color="#FFF" /></TouchableOpacity>;
  return <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={t("Close viewer list")} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onTouchStart={resetIdle}>
        <View style={styles.header}>
          {!isOwner && closeButton}
          <Text style={[styles.title, localizedTextStyle()]}>{t("Viewers")}</Text>
          <TouchableOpacity style={styles.headerButton} accessibilityLabel={t("Search viewers")} accessibilityState={{ expanded: searchOpen }} onPress={() => {
            resetIdle(); if (searchOpen) { setSearch(""); Keyboard.dismiss(); } setSearchOpen(value => !value);
          }}><Ionicons name="search" size={23} color={searchOpen ? "#FF1966" : "#FFF"} /></TouchableOpacity>
          {isOwner && closeButton}
        </View>
        {searchOpen && <TextInput autoFocus value={search} onChangeText={value => { setSearch(value); resetIdle(); }} placeholder={t("Search viewers")} accessibilityLabel={t("Search viewers")} placeholderTextColor="#888" style={styles.search} autoCorrect={false} autoCapitalize="none" />}
        {query.isLoading ? <ActivityIndicator color="#FF1966" style={{ padding: 24 }} /> : query.isError ?
          <TouchableOpacity style={{ paddingVertical: 24 }} onPress={() => { resetIdle(); void query.refetch(); }}><Text style={styles.secondary}>{t("Couldn't load viewers. Tap to retry.")}</Text></TouchableOpacity> :
          <FlatList data={entries} keyExtractor={person => String(person.uid)} style={{ minHeight: 120 }} keyboardShouldPersistTaps="handled" onScroll={resetIdle} scrollEventThrottle={100}
            renderItem={({ item: person }) => <TouchableOpacity style={styles.person} accessibilityLabel={person.name} onPress={() => { close(); onProfile(person.uid, person.name); }}>
              {person.coins > 0 && <Text style={styles.medal}>{person.rank <= 3 ? ["🥇", "🥈", "🥉"][person.rank - 1] : person.rank}</Text>}
              <Avatar uid={person.uid} name={person.name} avatarUri={person.avatarImageUrl ?? undefined} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.text} numberOfLines={1}>{person.name}</Text>
                {canSeePresence && <Text style={styles.secondary}>{t(person.watching ? "Watching" : "Not watching")}</Text>}
              </View>
              {person.coins > 0 && <View style={styles.coinTotal}><GoldCoinIcon size={14} /><Text style={styles.text}>{person.coins.toLocaleString(appLocale())}</Text></View>}
              <Ionicons name="chevron-forward" size={18} color="#888" />
            </TouchableOpacity>}
            ListEmptyComponent={<Text style={[styles.secondary, { paddingVertical: 24 }]}>{t(search ? "No matching viewers" : isOwner ? "No viewers right now" : "No gifts sent yet")}</Text>}
          />}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { backgroundColor: "#17171D", padding: 18, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "80%" },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: "#FFF", fontSize: 22, fontFamily: "Inter_700Bold", flex: 1 },
  headerButton: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  search: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 14, color: "#FFF", padding: 12, marginVertical: 12 },
  person: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  text: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  secondary: { color: "#999", fontSize: 12, marginTop: 4 },
  medal: { minWidth: 24, fontSize: 18, color: "#FFF", textAlign: "center" },
  coinTotal: { flexDirection: "row", alignItems: "center", gap: 5 },
});
