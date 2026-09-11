import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { APP_LANGUAGES, phoneAppLanguage, setAppLanguage, t, useAppLanguage, localizedTextStyle } from "@/i18n";
import type { AppLanguagePreference } from "@/i18n";
export function AppLanguageSheet({ onClose }: { onClose: () => void }) {
  const { preference, ready, t, localizedTextStyle } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const select = async (value: AppLanguagePreference) => {
    if (saving) return;
    setSaving(true); setError(false);
    try { await setAppLanguage(value); onClose(); }
    catch { setError(true); }
    finally { setSaving(false); }
  };
  const choices = [["device", t("Phone language ({v0})", { v0: APP_LANGUAGES.find(([code]) => code === phoneAppLanguage())?.[1] ?? "English" })], ...APP_LANGUAGES] as const;
  return <Modal transparent visible animationType="slide" statusBarTranslucent onRequestClose={() => { if (!saving) onClose(); }}>
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => { if (!saving) onClose(); }} accessibilityLabel={t("Close")} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.heading}><Text style={[localizedTextStyle(), styles.title]}>{t("App language")}</Text><Pressable style={styles.close} onPress={onClose} disabled={saving} accessibilityLabel={t("Close")}><Ionicons name="close" size={24} color="#FFF" /></Pressable></View>
        <Text style={[localizedTextStyle(), styles.detail]}>{t("Changes the app interface. Chat translation has its own language setting.")}</Text>
        <ScrollView>
          {choices.map(([code, name]) => <Pressable key={code} style={styles.row} disabled={!ready || saving} accessibilityRole="radio" accessibilityState={{ selected: preference === code }} onPress={() => void select(code as AppLanguagePreference)}>
            <Text style={styles.label}>{name}</Text>{preference === code ? <Ionicons name="checkmark" size={22} color="#FF1966" /> : null}
          </Pressable>)}
        </ScrollView>
        {saving ? <ActivityIndicator color="#FF1966" /> : null}
        {error ? <Text style={[localizedTextStyle(), styles.error]} accessibilityRole="alert">{t("Couldn't save language")}. {t("Please try again.")}</Text> : null}
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { backgroundColor: "#19191F", padding: 20, borderTopLeftRadius: 12, borderTopRightRadius: 12, maxHeight: "85%" },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#FFF", fontSize: 20, fontFamily: "Inter_700Bold", flexShrink: 1 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  detail: { color: "#B6B6BF", fontSize: 13, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 },
  label: { color: "#FFF", fontSize: 16, flexShrink: 1 },
  error: { color: "#FF759A", fontSize: 13, marginTop: 12 },
});
