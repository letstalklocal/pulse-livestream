import { t, useAppLanguage } from "@/i18n";
import React, { useState } from "react";
import { Alert, ActivityIndicator, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSetUserBlock } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useAccountSafety } from "@/hooks/useAccountSafety";
import { ReportUserSheet } from "./ReportUserSheet";

export function AccountSafetyMenu({ uid, source, color }: { uid: number; source: "profile" | "dm"; color: string }) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const safety = useAccountSafety(uid);
  const queryClient = useQueryClient();
  const mutation = useSetUserBlock();
  const [reporting, setReporting] = useState(false);
  if (!uid || uid === user?.uid) return null;
  const open = async () => {
    if (!user) { router.push("/(auth)/sign-in"); return; }
    const result = await safety.refetch();
    if (!result.data || result.isError) { Alert.alert(t("Couldn't load account options"), t("Please try again.")); return; }
    const blocked = result.data.blockedByMe;
    Alert.alert(t("User options"), undefined, [
      { text: t("Report user"), onPress: () => setReporting(true) },
      { text: blocked ? t("Unblock user") : t("Block user"), style: blocked ? "default" : "destructive", onPress: () => {
        Alert.alert(blocked ? t("Unblock this user?") : t("Block this user?"), blocked ? t("You can contact each other again unless they have also blocked you.") : t("This blocks contact and access to each other’s content and live streams across Pulse. Existing messages remain available for reporting."), [
          { text: t("Cancel"), style: "cancel" },
          { text: blocked ? t("Unblock") : t("Block"), style: blocked ? "default" : "destructive", onPress: () => mutation.mutate({ uid, data: { blocked: !blocked } }, {
            onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["account-safety"] }); },
            onError: () => Alert.alert(t("Couldn't update block"), t("Please try again.")),
          }) },
        ]);
      } },
      { text: t("Cancel"), style: "cancel" },
    ]);
  };
  return <>
    <TouchableOpacity onPress={() => void open()} disabled={mutation.isPending || safety.isFetching} hitSlop={10} accessibilityLabel={t("User options")}>
      {mutation.isPending ? <ActivityIndicator color={color} size="small" /> : <Ionicons name="ellipsis-horizontal" size={23} color={color} />}
    </TouchableOpacity>
    {reporting ? <ReportUserSheet uid={uid} source={source} onClose={() => setReporting(false)} /> : null}
  </>;
}

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
