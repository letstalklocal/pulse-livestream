import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getGetStreamViewersQueryKey, useGetStreamViewers } from "@workspace/api-client-react";
import { Avatar } from "./Avatar";
import { GIFTS } from "./GiftPicker";

export function LivePremiumSheet({ channelId, onClose, onConfirm }: {
  channelId: string; onClose: () => void;
  onConfirm: (giftId: string, freeViewerIds: number[]) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"gift" | "viewers">("gift");
  const [giftId, setGiftId] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewers = useGetStreamViewers(channelId, { query: { queryKey: getGetStreamViewersQueryKey(channelId), refetchInterval: busy ? false : 10000 } });
  useEffect(() => {
    if (!busy && viewers.data) setSelected(previous => previous.filter(uid => viewers.data.users.some(viewer => viewer.uid === uid)));
  }, [viewers.data, busy]);
  const noViewers = viewers.isSuccess && viewers.data.users.length === 0;
  const showViewers = step === "viewers" && !noViewers;
  const nextIsViewers = !showViewers && !noViewers;
  const checkingViewers = !!giftId && !showViewers && viewers.isLoading;
  const gift = GIFTS.find(item => item.id === giftId);
  const close = () => { if (!busy) onClose(); };
  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={close} disabled={busy} accessibilityLabel="Close Premium setup" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{!showViewers ? "Choose an entry gift" : "Free entry · optional"}</Text>
              <Text style={styles.subtitle}>{!showViewers ? "Viewers send this gift to enter your Premium live." : `${gift?.emoji} ${gift?.name} · ${gift?.coins} coins to enter. Choose anyone you'd like to let in free, or continue without selecting.`}</Text>
            </View>
            <TouchableOpacity onPress={close} disabled={busy} accessibilityLabel="Close" style={styles.close}><Ionicons name="close" size={20} color="#FFF" /></TouchableOpacity>
          </View>
          {!showViewers ? (
            <ScrollView contentContainerStyle={styles.grid}>
              {GIFTS.map(item => <TouchableOpacity key={item.id} style={[styles.option, giftId === item.id && styles.selected]} onPress={() => setGiftId(item.id)} accessibilityRole="radio" accessibilityState={{ selected: giftId === item.id }}>
                {giftId === item.id ? <Ionicons name="checkmark-circle" color="#FF1966" size={20} style={{ position: "absolute", top: 6, right: 6 }} /> : null}
                <Text style={{ fontSize: 31 }}>{item.emoji}</Text><Text style={styles.giftName}>{item.name}</Text><Text style={styles.cost}>🪙 {item.coins}</Text>
              </TouchableOpacity>)}
            </ScrollView>
          ) : <>
            <TextInput value={search} onChangeText={setSearch} placeholder="Search viewers" placeholderTextColor="#888" style={styles.search} editable={!busy} />
            <Text style={styles.subtitle}>{selected.length ? `${selected.length} selected for free entry` : "Nobody selected — all viewers will need the entry gift"}</Text>
            <ScrollView style={{ minHeight: 80 }}>
              {viewers.isLoading ? <ActivityIndicator color="#FF1966" /> : viewers.isError ? <TouchableOpacity onPress={() => void viewers.refetch()}><Text style={styles.subtitle}>Couldn't load viewers. Tap to retry, or continue without free entry.</Text></TouchableOpacity> : (viewers.data?.users ?? []).filter(viewer => viewer.name.toLowerCase().includes(search.toLowerCase())).map(viewer => (
                <TouchableOpacity key={viewer.uid} disabled={busy} style={styles.viewer} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(viewer.uid) }} onPress={() => setSelected(current => current.includes(viewer.uid) ? current.filter(uid => uid !== viewer.uid) : [...current, viewer.uid])}>
                  <Avatar uid={viewer.uid} name={viewer.name} avatarUri={viewer.avatarImageUrl ?? undefined} size={36} /><Text style={[styles.giftName, { flex: 1 }]}>{viewer.name}</Text><Ionicons name={selected.includes(viewer.uid) ? "checkbox" : "square-outline"} size={24} color={selected.includes(viewer.uid) ? "#FF1966" : "#888"} />
                </TouchableOpacity>
              ))}
              {viewers.data?.users.length === 0 ? <Text style={styles.subtitle}>No current viewers. You can still go Premium.</Text> : null}
            </ScrollView>
          </>}
          {error ? <Text style={{ color: "#FF879E", marginTop: 10 }}>{error}</Text> : null}
          <TouchableOpacity style={[styles.submit, (!giftId || busy || checkingViewers) && { opacity: 0.5 }]} disabled={!giftId || busy || checkingViewers} onPress={() => {
            if (nextIsViewers) { setStep("viewers"); return; }
            setBusy(true); setError(null);
            void onConfirm(giftId!, noViewers ? [] : selected).catch(err => setError(err instanceof Error ? err.message : "Couldn't go Premium. Try again.")).finally(() => setBusy(false));
          }}>
            {busy || checkingViewers ? <ActivityIndicator color="#FFF" /> : <><Ionicons name={nextIsViewers ? "arrow-forward" : "lock-closed"} size={18} color="#FFF" /><Text style={styles.submitText}>{!giftId ? "Choose a gift" : nextIsViewers ? "Next" : "Go Premium"}</Text></>}
          </TouchableOpacity>
          {showViewers ? <TouchableOpacity disabled={busy} onPress={() => setStep("gift")} style={{ padding: 12, alignItems: "center" }}><Text style={styles.giftName}>Change gift</Text></TouchableOpacity> : null}
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { maxHeight: "80%", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingHorizontal: 18, backgroundColor: "#17171D" },
  grabber: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, marginBottom: 17, backgroundColor: "rgba(255,255,255,0.22)" },
  header: { flexDirection: "row", gap: 8, marginBottom: 16 }, title: { color: "#FFF", fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { color: "rgba(255,255,255,0.58)", fontSize: 12, marginTop: 4, marginBottom: 8, fontFamily: "Inter_400Regular" },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingBottom: 8 },
  option: { width: "31%", minHeight: 112, borderRadius: 18, alignItems: "center", justifyContent: "center", padding: 10, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  selected: { backgroundColor: "rgba(255,25,102,0.16)", borderColor: "#FF1966", borderWidth: 2 },
  giftName: { color: "#FFF", fontSize: 12, fontFamily: "Inter_600SemiBold" }, cost: { color: "#FFD76A", fontSize: 11, marginTop: 4, fontFamily: "Inter_600SemiBold" },
  search: { color: "#FFF", backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 14, padding: 12, marginBottom: 8 },
  viewer: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  submit: { minHeight: 56, marginTop: 14, borderRadius: 28, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FF1966" },
  submitText: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 16 },
});
