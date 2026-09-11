import { t, useAppLanguage, localizedTextStyle } from "@/i18n";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { getPartyCandidates, type LiveParty, type PartyAction } from "@workspace/api-client-react";
import { Avatar } from "./Avatar";

export function PartySheet({ channelId, party, uid, onAction, onClose }: {
  channelId: string; party: LiveParty | null; uid: number;
  onAction: (action: PartyAction) => Promise<unknown>; onClose: () => void;
}) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candidates = useQuery({ queryKey: ["party-candidates", channelId], queryFn: () => getPartyCandidates(channelId), enabled: !party, refetchInterval: 5000 });
  const candidateStatus = candidates.error && "status" in candidates.error ? candidates.error.status : undefined;
  const candidateError = candidateStatus === 403 || candidateStatus === 404
    ? "Your live session is unavailable. End this live and start again."
    : candidateStatus === 401 ? "Sign in again to load live hosts." : "Couldn't load live hosts. Tap to retry.";
  const peer = party?.participants.find(p => p.channelId !== channelId);
  const incoming = party?.status === "pending" && party.participants[1]?.uid === uid;
  const battle = party?.battle;
  const act = async (action: PartyAction["action"], targetChannelId?: string) => {
    setBusy(true); setError(null);
    try {
      await onAction({ action, targetChannelId, partyId: party?.id, battleId: battle?.id });
      if (action === "accept" || action === "battle_accept" || action === "battle_end" || action === "leave") onClose();
    }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update Party. Try again."); }
    finally { setBusy(false); }
  };
  const button = (label: string, icon: React.ComponentProps<typeof Ionicons>["name"], action: PartyAction["action"], disabled = false) => (
    <TouchableOpacity style={[styles.action, disabled && { opacity: 0.4 }]} disabled={busy || disabled} onPress={() => void act(action)} accessibilityRole="button">
      <Ionicons name={icon} color="#FFF" size={21} /><Text style={[localizedTextStyle(), styles.actionText]}>{t(label)}</Text>
    </TouchableOpacity>
  );
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t("Close Party")} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.heading}><Text style={[localizedTextStyle(), styles.title]}>{t("Party")}</Text><TouchableOpacity onPress={onClose} accessibilityLabel={t("Close Party")} style={styles.close}><Ionicons name="close" size={24} color="#FFF" /></TouchableOpacity></View>
          {party && peer ? <>
            <View style={styles.person}><Avatar uid={peer.uid} name={peer.name} avatarUri={peer.avatarUrl ?? undefined} size={42} /><Text style={styles.personName} numberOfLines={1}>{peer.name}</Text></View>
            {party.status === "pending" ? <>
              <Text style={[localizedTextStyle(), styles.status]}>{incoming ? t("Invited you to Party") : t("Waiting for their response")}</Text>
              {incoming ? button("Accept Party", "people", "accept") : null}
              {button(incoming ? "Decline" : "Cancel invitation", "close-circle-outline", incoming ? "decline" : "cancel")}
            </> : <>
              <Text style={[localizedTextStyle(), styles.status]}>{party.ready ? t("Party connected") : t("Connecting both hosts...")}</Text>
              {battle?.status === "pending" ? <>
                <Text style={[localizedTextStyle(), styles.status]}>{battle.requesterUid === uid ? t("Waiting for VS acceptance") : t("Your partner invited you to a 3-minute VS")}</Text>
                {battle.requesterUid !== uid ? button("Accept VS", "flash", "battle_accept", !party.ready) : null}
                {button(battle.requesterUid === uid ? "Cancel VS request" : "Decline VS", "close-circle-outline", "battle_decline")}
              </> : battle?.status === "active" ? <>
                <Text style={[localizedTextStyle(), styles.status]}>{t("VS in progress")}</Text>
                <TouchableOpacity style={styles.action} disabled={busy} accessibilityRole="button" onPress={() => Alert.alert(t("End VS early?"), t("This round will end without a winner. Party and both lives will continue. Gifts already sent stay with their recipients."), [{ text: t("Keep battling"), style: "cancel" }, { text: t("End VS"), style: "destructive", onPress: () => void act("battle_end") }])}>
                  <Ionicons name="stop-circle-outline" color="#FF759A" size={21} /><Text style={[localizedTextStyle(), [styles.actionText, { color: "#FF759A" }]]}>{t("End VS")}</Text>
                </TouchableOpacity>
              </> : button("Start VS · 3 minutes", "flash", "battle_request", !party.ready)}
              <TouchableOpacity style={styles.action} disabled={busy} onPress={() => Alert.alert(t("Leave Party?"), t("Both lives will continue separately. Any unfinished VS round will be cancelled."), [{ text: t("Stay"), style: "cancel" }, { text: t("Leave Party"), style: "destructive", onPress: () => void act("leave") }])}><Ionicons name="exit-outline" color="#FF759A" size={21} /><Text style={[localizedTextStyle(), [styles.actionText, { color: "#FF759A" }]]}>{t("Leave Party")}</Text></TouchableOpacity>
            </>}
          </> : <ScrollView style={{ maxHeight: 340 }}>
            {candidates.isLoading ? <ActivityIndicator color="#FF1966" /> : candidates.isError ? <TouchableOpacity onPress={() => void candidates.refetch()}><Text style={styles.status}>{t(candidateError)}</Text></TouchableOpacity> : candidates.data?.users.length ? candidates.data.users.map(person => (
              <TouchableOpacity key={person.channelId} disabled={busy} style={styles.person} onPress={() => void act("invite", person.channelId)} accessibilityLabel={t("Invite {v0} to Party", { v0: person.name })}>
                <Avatar uid={person.uid} name={person.name} avatarUri={person.avatarUrl ?? undefined} size={42} />
                <Text style={styles.personName} numberOfLines={1}>{person.name}</Text><Ionicons name="person-add-outline" color="#FF4E86" size={23} />
              </TouchableOpacity>
            )) : <Text style={[localizedTextStyle(), styles.status]}>{t("No live hosts available right now")}</Text>}
          </ScrollView>}
          {busy ? <ActivityIndicator color="#FF1966" style={{ marginTop: 12 }} /> : null}
          {error ? <Text style={styles.error}>{t(error)}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { padding: 20, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: "#19191F", maxHeight: "80%" },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 20, color: "#FFF", fontFamily: "Inter_700Bold" },
  close: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  person: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  personName: { flex: 1, fontSize: 16, color: "#FFF", fontFamily: "Inter_600SemiBold" },
  status: { color: "#B6B6BF", fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 12 },
  action: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#3A3A42" },
  actionText: { color: "#FFF", fontSize: 15, fontFamily: "Inter_500Medium" },
  error: { color: "#FF759A", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 12 },
});
