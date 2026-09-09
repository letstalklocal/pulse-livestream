import React, { useState } from "react";
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { getGetStreamModerationQueryKey, getGetStreamQueryKey, getGetStreamViewersQueryKey, useGetStreamModeration, useModerateStreamViewer, type ModerateStreamViewerBodyAction } from "@workspace/api-client-react";
import { Avatar } from "./Avatar";

export function ViewerManagementSheet({ channelId, onClose, onProfile }: {
  channelId: string; onClose: () => void; onProfile: (uid: number, name: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const [tab, setTab] = useState<"viewers" | "restricted">("viewers");
  const [search, setSearch] = useState("");
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useGetStreamModeration(channelId, { query: { queryKey: getGetStreamModerationQueryKey(channelId), refetchInterval: 5000 } });
  const mutation = useModerateStreamViewer();
  const selected = query.data?.users.find(user => user.uid === selectedUid);
  const people = (query.data?.users ?? []).filter(user => (tab === "viewers" ? user.present && !user.removed && !user.blocked : user.muted || user.removed || user.blocked) && user.name.toLowerCase().includes(search.toLowerCase()));
  const close = () => { if (!mutation.isPending) onClose(); };
  const act = (action: ModerateStreamViewerBodyAction) => {
    if (!selected || mutation.isPending) return;
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
      Alert.alert(`${action === "block" ? "Block" : "Remove"} ${selected.name}?`, action === "block" ? "They won't be able to enter your live streams until you unblock them." : "They won't be able to rejoin this stream unless you allow them back.", [{ text: "Cancel", style: "cancel" }, { text: action === "block" ? "Block" : "Remove", style: "destructive", onPress: execute }]);
    } else execute();
  };
  return <Modal visible transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
    <View style={styles.backdrop}>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close viewer list" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{selected ? selected.name : "Manage viewers"}</Text>
          <TouchableOpacity onPress={close} disabled={mutation.isPending} accessibilityLabel="Close"><Ionicons name="close" size={24} color="#FFF" /></TouchableOpacity>
        </View>
        {selected ? <>
          <View style={{ alignItems: "center", marginVertical: 12 }}><Avatar uid={selected.uid} name={selected.name} avatarUri={selected.avatarImageUrl ?? undefined} size={60} /></View>
          <TouchableOpacity disabled={mutation.isPending} style={styles.action} onPress={() => { onClose(); onProfile(selected.uid, selected.name); }}><Ionicons name="person-outline" color="#FFF" size={20} /><Text style={styles.text}>View profile</Text></TouchableOpacity>
          {([
            [selected.muted ? "unmute" : "mute", selected.muted ? "Unmute chat" : "Mute chat for this stream"],
            [selected.removed ? "allow" : "remove", selected.removed ? "Allow back into this stream" : "Remove from this stream"],
            [selected.blocked ? "unblock" : "block", selected.blocked ? "Unblock from my streams" : "Block from my streams"],
          ] as [ModerateStreamViewerBodyAction, string][]).map(([action, label]) => <TouchableOpacity key={action} style={styles.action} disabled={mutation.isPending} onPress={() => act(action)}><Text style={[styles.text, (action === "remove" || action === "block") && { color: "#FF6B80" }]}>{label}</Text></TouchableOpacity>)}
          <TouchableOpacity disabled={mutation.isPending} onPress={() => setSelectedUid(null)} style={styles.action}><Text style={styles.secondary}>Back to viewers</Text></TouchableOpacity>
        </> : <>
          <View style={styles.tabs}>{(["viewers", "restricted"] as const).map(value => <TouchableOpacity key={value} style={[styles.tab, tab === value && { borderBottomColor: "#FF1966" }]} onPress={() => setTab(value)}><Text style={styles.text}>{value === "viewers" ? "Viewers" : "Restricted"}</Text></TouchableOpacity>)}</View>
          <TextInput value={search} onChangeText={setSearch} placeholder="Search viewers" placeholderTextColor="#888" style={styles.search} />
          <ScrollView style={{ minHeight: 120 }}>
            {query.isLoading ? <ActivityIndicator color="#FF1966" /> : query.isError ? <TouchableOpacity onPress={() => void query.refetch()}><Text style={styles.secondary}>Couldn't load viewers. Tap to retry.</Text></TouchableOpacity> : people.map(person => <TouchableOpacity key={person.uid} style={styles.person} onPress={() => { setError(null); setSelectedUid(person.uid); }} accessibilityLabel={`Manage ${person.name}`}>
              <Avatar uid={person.uid} name={person.name} avatarUri={person.avatarImageUrl ?? undefined} size={40} />
              <View style={{ flex: 1 }}><Text style={styles.text}>{person.name}</Text><Text style={styles.secondary}>{[person.muted && "Chat muted", person.removed && "Removed", person.blocked && "Blocked"].filter(Boolean).join(" · ") || "Watching"}</Text></View>
              <Ionicons name="chevron-forward" color="#888" size={18} />
            </TouchableOpacity>)}
            {!query.isLoading && !query.isError && !people.length ? <Text style={[styles.secondary, { paddingVertical: 24 }]}>{search ? "No matching viewers" : tab === "viewers" ? "No viewers right now" : "No restricted viewers"}</Text> : null}
          </ScrollView>
        </>}
        {mutation.isPending ? <ActivityIndicator color="#FF1966" /> : null}
        {error ? <Text style={{ color: "#FF6B80", marginTop: 8 }}>{error}</Text> : null}
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { backgroundColor: "#17171D", padding: 18, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "80%" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, title: { color: "#FFF", fontSize: 22, fontFamily: "Inter_700Bold", flex: 1 },
  tabs: { flexDirection: "row", marginTop: 12 }, tab: { flex: 1, alignItems: "center", padding: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  search: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 14, color: "#FFF", padding: 12, marginVertical: 12 },
  text: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 14 }, secondary: { color: "#999", fontSize: 12, marginTop: 4 },
  person: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }, action: { flexDirection: "row", gap: 12, paddingVertical: 15 },
});
