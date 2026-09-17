import React, { useState } from "react";
import { Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAppLanguage } from "@/i18n";
import { useLivePlayback } from "@/context/LivePlaybackContext";

export default function GeneralSettingsScreen() {
  const { t, localizedTextStyle } = useAppLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const playback = useLivePlayback();
  const [error, setError] = useState(false);
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={[styles.header, { paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 10, borderColor: colors.border }]}>
      <TouchableOpacity style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityLabel={t("Back")} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={20} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={[localizedTextStyle(), styles.title, { color: colors.foreground }]}>{t("General")}</Text>
      <View style={{ width: 38 }} />
    </View>
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
      <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[localizedTextStyle(), styles.label, { color: colors.foreground }]}>{t("Picture in picture")}</Text>
          <Text style={[localizedTextStyle(), styles.detail, { color: colors.mutedForeground }]}>{t("Keep watching a live while browsing the app or opening messages.")}</Text>
        </View>
        <Switch accessibilityLabel={t("Picture in picture")} value={playback.enabled}
          disabled={!playback.preferenceReady || playback.saving}
          trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFF"
          onValueChange={async value => {
            setError(false);
            try { await playback.saveEnabled(value); } catch { setError(true); }
          }} />
      </View>
      {error ? <Text accessibilityRole="alert" style={[localizedTextStyle(), { color: "#FF4D67", marginTop: 14 }]}>{t("Could not save this setting. Please try again.")}</Text> : null}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  back: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 21, fontFamily: "Inter_700Bold" },
  row: { flexDirection: "row", alignItems: "center", gap: 16, padding: 18, borderWidth: 1, borderRadius: 16 },
  label: { fontSize: 16, fontFamily: "Inter_500Medium" }, detail: { fontSize: 13, lineHeight: 20 },
});
