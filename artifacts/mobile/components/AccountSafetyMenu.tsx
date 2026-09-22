import { t, useAppLanguage } from "@/i18n";
import React, { useState } from "react";
import { Alert, ActivityIndicator, Modal, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSetUserBlock } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useAccountSafety } from "@/hooks/useAccountSafety";
import { ReportUserSheet } from "./ReportUserSheet";
import { TranslationToggle } from "./TranslationToggle";

export function AccountSafetyMenu({ uid, source, color, peerId }: { uid: number; source: "profile" | "dm"; color: string; peerId?: string }) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const safety = useAccountSafety(uid);
  const queryClient = useQueryClient();
  const mutation = useSetUserBlock();
  const [reporting, setReporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  if (!uid || uid === user?.uid) return null;
  const open = async () => {
    if (!user) { router.push("/(auth)/sign-in"); return; }
    const result = await safety.refetch();
    if (!result.data || result.isError) { Alert.alert(t("Couldn't load account options"), t("Please try again.")); return; }
    setBlockedByMe(result.data.blockedByMe);
    setMenuOpen(true);
  };
  const toggleBlock = () => {
    setMenuOpen(false);
    Alert.alert(blockedByMe ? t("Unblock this user?") : t("Block this user?"), blockedByMe ? t("You can contact each other again unless they have also blocked you.") : t("This blocks contact and access to each other’s content and live streams across Pulse. Existing messages remain available for reporting."), [
      { text: t("Cancel"), style: "cancel" },
      { text: blockedByMe ? t("Unblock") : t("Block"), style: blockedByMe ? "default" : "destructive", onPress: () => mutation.mutate({ uid, data: { blocked: !blockedByMe } }, {
        onSuccess: () => {
          setBlockedByMe(!blockedByMe);
          void queryClient.invalidateQueries({ queryKey: ["account-safety"] });
        },
        onError: () => Alert.alert(t("Couldn't update block"), t("Please try again.")),
      }) },
    ]);
  };
  return <>
    <TouchableOpacity onPress={() => void open()} disabled={mutation.isPending || safety.isFetching} hitSlop={10} accessibilityLabel={t("User options")}>
      {mutation.isPending ? <ActivityIndicator color={color} size="small" /> : <Ionicons name="ellipsis-horizontal" size={23} color={color} />}
    </TouchableOpacity>
    <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)} statusBarTranslucent>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.dismiss} onPress={() => setMenuOpen(false)} accessibilityLabel={t("Close")} />
        <View style={styles.sheet}>
          <Text style={[localizedTextStyle(), styles.title]}>{t("User options")}</Text>
          {peerId ? <><TranslationToggle peerId={peerId} menu menuLabel="Translate chat" /><View style={styles.divider} /></> : null}
          <TouchableOpacity style={styles.row} accessibilityRole="button" onPress={() => { setMenuOpen(false); setReporting(true); }}>
            <Ionicons name="flag-outline" size={21} color="#FFF" />
            <Text style={[localizedTextStyle(), styles.label]}>{t("Report user")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} accessibilityRole="button" onPress={toggleBlock}>
            <Ionicons name={blockedByMe ? "person-add-outline" : "ban-outline"} size={21} color="#FF6B80" />
            <Text style={[localizedTextStyle(), [styles.label, styles.destructive]]}>{blockedByMe ? t("Unblock user") : t("Block user")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    {reporting ? <ReportUserSheet uid={uid} source={source} onClose={() => setReporting(false)} /> : null}
  </>;
}

const styles = {
  backdrop: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, paddingHorizontal: 24, backgroundColor: "rgba(0,0,0,0.55)" },
  dismiss: { ...({ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const) },
  sheet: { width: "100%" as const, maxWidth: 340, backgroundColor: "#22222A", borderRadius: 18, paddingHorizontal: 20, paddingVertical: 16 },
  title: { color: "#FFF", fontSize: 17, fontFamily: "Inter_700Bold", marginBottom: 4, textAlign: "center" as const },
  divider: { height: 1, backgroundColor: "#2B2B33", marginHorizontal: 20 },
  row: { flexDirection: "row" as const, alignItems: "center" as const, gap: 14, paddingHorizontal: 20, paddingVertical: 18 },
  label: { color: "#FFF", fontSize: 16, fontFamily: "Inter_500Medium" },
  destructive: { color: "#FF6B80" },
};

export function ReportMessageButton({ uid, messageId, color }: { uid: number; messageId: string; color: string }) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const [reporting, setReporting] = useState(false);
  const id = Number(messageId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return <>
    <TouchableOpacity hitSlop={8} accessibilityLabel={t("Message options")} onPress={() => Alert.alert(t("Message options"), undefined, [
      { text: t("Report message"), onPress: () => setReporting(true) }, { text: t("Cancel"), style: "cancel" },
    ])}><Ionicons name="ellipsis-horizontal" size={16} color={color} /></TouchableOpacity>
    {reporting ? <ReportUserSheet uid={uid} source="dm" messageId={id} onClose={() => setReporting(false)} /> : null}
  </>;
}
