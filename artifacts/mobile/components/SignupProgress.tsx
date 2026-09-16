import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useAppLanguage } from "@/i18n";

const stages = ["Pulse Installed", "Create Account", "Accept Terms", "Verify Account"] as const;

type Props = { stage: 2 | 3 | 4 };

export default function SignupProgress({ stage }: Props) {
  const colors = useColors();
  const { t, appNumber, localizedTextStyle } = useAppLanguage();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t(stages[stage - 1])}
      accessibilityValue={{ min: 1, max: 4, now: stage, text: t("Step {v0} of {v1}", { v0: appNumber(stage), v1: appNumber(4) }) }}
      accessibilityLiveRegion="polite"
      style={styles.row}
    >
      {stages.map((label, index) => {
        const number = index + 1;
        const done = number < stage;
        const current = number === stage;
        const accent = done || current ? colors.primary : "rgba(255,255,255,0.4)";
        return (
          <View key={label} style={styles.stage}>
            <View style={styles.track}>
              <View style={[styles.line, { backgroundColor: index === 0 ? "transparent" : number <= stage ? colors.primary : "rgba(255,255,255,0.4)" }]} />
              <View style={[styles.circle, { borderColor: accent, borderWidth: current ? 2 : 1, backgroundColor: done ? accent : current ? "transparent" : colors.card }]}>
                {done ? <Ionicons name="checkmark" size={17} color="#FFF" /> : <Text style={[styles.number, { color: current ? "#FFFFFF" : "rgba(255,255,255,0.65)" }]}>{appNumber(number)}</Text>}
              </View>
              <View style={[styles.line, { backgroundColor: index === stages.length - 1 ? "transparent" : done ? colors.primary : "rgba(255,255,255,0.4)" }]} />
            </View>
            <Text style={[localizedTextStyle(), styles.label, { color: index === 0 || current ? colors.foreground : done ? colors.primary : colors.mutedForeground, fontFamily: index === 0 || current ? "Inter_600SemiBold" : "Inter_400Regular" }]}>{t(label)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", marginBottom: 24 },
  stage: { flex: 1, minWidth: 0, alignItems: "center" },
  track: { flexDirection: "row", alignItems: "center", width: "100%" },
  line: { flex: 1, height: 1 },
  circle: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  number: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  label: { fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 8, paddingHorizontal: 3 },
});
