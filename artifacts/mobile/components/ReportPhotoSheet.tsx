import React, { useState } from "react";
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReportPost, type ReportPostBodyReason } from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
const reasons: [ReportPostBodyReason, string][] = [["harassment", "Harassment or bullying"], ["spam", "Spam or scam"], ["sexual_content", "Sexual content"], ["violence", "Violence or threats"], ["child_safety", "Child safety"], ["other", "Other"]];
export function ReportPhotoSheet({ postId, onClose }: { postId: number; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<ReportPostBodyReason | null>(null);
  const [details, setDetails] = useState("");
  const mutation = useReportPost();
  const close = () => { if (!mutation.isPending) onClose(); };
  return <Modal visible transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
    <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" }}>
      <View style={{ backgroundColor: "#17171D", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: "85%" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: "#FFF", fontSize: 22, fontWeight: "700" }}>Report photo</Text><TouchableOpacity onPress={close} disabled={mutation.isPending} accessibilityLabel="Close"><Ionicons name="close" size={24} color="#FFF" /></TouchableOpacity></View>
        <ScrollView keyboardShouldPersistTaps="handled">
          {reasons.map(([value, label]) => <TouchableOpacity key={value} onPress={() => setReason(value)} disabled={mutation.isPending} accessibilityRole="radio" accessibilityState={{ selected: reason === value }} style={{ flexDirection: "row", gap: 12, paddingVertical: 13 }}><Ionicons name={reason === value ? "radio-button-on" : "radio-button-off"} color={reason === value ? "#FF1966" : "#888"} size={22} /><Text style={{ color: "#FFF" }}>{label}</Text></TouchableOpacity>)}
          <TextInput value={details} onChangeText={setDetails} editable={!mutation.isPending} multiline maxLength={2000} placeholder="Additional details (optional)" placeholderTextColor="#888" style={{ color: "#FFF", backgroundColor: "#22222A", borderRadius: 14, padding: 12, minHeight: 80 }} />
        </ScrollView>
        {mutation.isError ? <Text style={{ color: "#FF6B80", paddingVertical: 10 }}>{mutation.error.message || "Couldn't submit. Please try again."}</Text> : null}
        <TouchableOpacity disabled={!reason || mutation.isPending} style={{ marginTop: 16, padding: 16, borderRadius: 28, alignItems: "center", backgroundColor: "#FF1966", opacity: !reason || mutation.isPending ? 0.5 : 1 }} onPress={() => mutation.mutate({ postId, data: { reason: reason!, details } }, { onSuccess: () => { onClose(); Alert.alert("Report submitted", "Your report has been saved for review."); } })}>
          {mutation.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: "#FFF", fontWeight: "700" }}>Submit report</Text>}
        </TouchableOpacity>
      </View>
    </View>
  </Modal>;
}
