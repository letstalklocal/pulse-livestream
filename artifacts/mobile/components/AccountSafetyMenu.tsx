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
    if (!result.data || result.isError) { Alert.alert("Couldn't load account options", "Please try again."); return; }
    const blocked = result.data.blockedByMe;
    Alert.alert("User options", undefined, [
      { text: "Report user", onPress: () => setReporting(true) },
      { text: blocked ? "Unblock user" : "Block user", style: blocked ? "default" : "destructive", onPress: () => {
        Alert.alert(blocked ? "Unblock this user?" : "Block this user?", blocked ? "You can contact each other again unless they have also blocked you." : "This blocks contact and access to each other’s content and live streams across Pulse. Existing messages remain available for reporting.", [
          { text: "Cancel", style: "cancel" },
          { text: blocked ? "Unblock" : "Block", style: blocked ? "default" : "destructive", onPress: () => mutation.mutate({ uid, data: { blocked: !blocked } }, {
            onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["account-safety"] }); },
            onError: () => Alert.alert("Couldn't update block", "Please try again."),
          }) },
        ]);
      } },
      { text: "Cancel", style: "cancel" },
    ]);
  };
  return <>
    <TouchableOpacity onPress={() => void open()} disabled={mutation.isPending || safety.isFetching} hitSlop={10} accessibilityLabel="User options">
      {mutation.isPending ? <ActivityIndicator color={color} size="small" /> : <Ionicons name="ellipsis-horizontal" size={23} color={color} />}
    </TouchableOpacity>
    {reporting ? <ReportUserSheet uid={uid} source={source} onClose={() => setReporting(false)} /> : null}
  </>;
}

export function ReportMessageButton({ uid, messageId, color }: { uid: number; messageId: string; color: string }) {
  const [reporting, setReporting] = useState(false);
  const id = Number(messageId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return <>
    <TouchableOpacity hitSlop={8} accessibilityLabel="Message options" onPress={() => Alert.alert("Message options", undefined, [
      { text: "Report message", onPress: () => setReporting(true) }, { text: "Cancel", style: "cancel" },
    ])}><Ionicons name="ellipsis-horizontal" size={16} color={color} /></TouchableOpacity>
    {reporting ? <ReportUserSheet uid={uid} source="dm" messageId={id} onClose={() => setReporting(false)} /> : null}
  </>;
}
