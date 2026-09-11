import { t, useAppLanguage, localizedTextStyle } from "@/i18n";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReportStream, type ReportStreamBodyReason } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
const reasons: [ReportStreamBodyReason, string][] = [["harassment", "Harassment or bullying"], ["spam", "Spam or scam"], ["sexual_content", "Sexual content"], ["violence", "Violence or threats"], ["child_safety", "Child safety"], ["other", "Other"]];
export function ReportStreamSheet({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<ReportStreamBodyReason | null>(null);
  const [details, setDetails] = useState("");
  const mutation = useReportStream();
  const close = () => { if (!mutation.isPending) onClose(); };
  return <Modal visible transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
    <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" }}>
      <View style={{ backgroundColor: "#17171D", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: "85%" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={[localizedTextStyle(), { color: "#FFF", fontSize: 22, fontWeight: "700" }]}>{t("Report stream")}</Text><TouchableOpacity onPress={close} disabled={mutation.isPending} accessibilityLabel={t("Close")}><Ionicons name="close" size={24} color="#FFF" /></TouchableOpacity></View>
        <ScrollView keyboardShouldPersistTaps="handled">
          {reasons.map(([value, label]) => <TouchableOpacity key={value} onPress={() => setReason(value)} disabled={mutation.isPending} accessibilityRole="radio" accessibilityState={{ selected: reason === value }} style={{ flexDirection: "row", gap: 12, paddingVertical: 13 }}><Ionicons name={reason === value ? "radio-button-on" : "radio-button-off"} color={reason === value ? "#FF1966" : "#888"} size={22} /><Text style={[localizedTextStyle(), { color: "#FFF" }]}>{t(label)}</Text></TouchableOpacity>)}
          <TextInput value={details} onChangeText={setDetails} editable={!mutation.isPending} multiline maxLength={2000} placeholder={t("Additional details (optional)")} placeholderTextColor="#888" style={{ color: "#FFF", backgroundColor: "#22222A", borderRadius: 14, padding: 12, minHeight: 80 }} />
        </ScrollView>
        {mutation.isError ? <Text style={[localizedTextStyle(), { color: "#FF6B80", paddingVertical: 10 }]}>{mutation.error.message || t("Couldn't submit. Please try again.")}</Text> : null}
        <TouchableOpacity disabled={!reason || mutation.isPending} style={{ marginTop: 16, padding: 16, borderRadius: 28, alignItems: "center", backgroundColor: "#FF1966", opacity: !reason || mutation.isPending ? 0.5 : 1 }} onPress={() => mutation.mutate({ channelId, data: { reason: reason!, details } }, { onSuccess: () => { onClose(); Alert.alert(t("Report submitted"), t("Your report has been saved for review.")); } })}>
          {mutation.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={[localizedTextStyle(), { color: "#FFF", fontWeight: "700" }]}>{t("Submit report")}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  </Modal>;
}
