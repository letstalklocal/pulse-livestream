import React, { useRef } from "react";
import { Alert, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppLanguage } from "@/i18n";
import { useColors } from "@/hooks/useColors";
import { birthdayDigits, birthdayError, birthdayFromParts } from "@/lib/signup-eligibility";

type Props = {
  day: string; month: string; year: string; termsAccepted: boolean;
  onDay: (value: string) => void; onMonth: (value: string) => void; onYear: (value: string) => void;
  onTerms: (value: boolean) => void; disabled?: boolean;
};
export default function SignupEligibilityFields(props: Props) {
  const { t, localizedTextStyle } = useAppLanguage();
  const colors = useColors();
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);
  const error = props.day && props.month && props.year.length === 4
    ? birthdayError(birthdayFromParts(props.day, props.month, props.year)) : null;
  const openTerms = async () => {
    const base = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
    try { await Linking.openURL(`${base}/api/site/terms`); }
    catch { Alert.alert(t("Terms of Service"), t("Could not open the Terms of Service.")); }
  };
  return (
    <View testID="signup-eligibility-fields" style={styles.group}>
      <Text style={[localizedTextStyle(), styles.label, { color: colors.foreground }]}>{t("Birthday")}</Text>
      <Text style={[localizedTextStyle(), styles.notice, { color: colors.mutedForeground }]}>{t("You must be 18 or older to use Pulse.")}</Text>
      <View style={styles.dateRow}>
        {([
          ["Day", props.day, props.onDay, 2],
          ["Month", props.month, props.onMonth, 2],
          ["Year", props.year, props.onYear, 4],
        ] as const).map(([label, value, onChange, length]) => (
          <View key={label} style={styles.dateField}>
            <Text style={[localizedTextStyle(), styles.dateLabel, { color: colors.mutedForeground }]}>{t(label)}</Text>
            <TextInput testID={`birthday-${label.toLowerCase()}`} accessibilityLabel={t(label)} value={value}
              ref={label === "Month" ? monthRef : label === "Year" ? yearRef : undefined}
              onChangeText={text => {
                const digits = birthdayDigits(text);
                onChange(digits);
                if (digits.length === 2 && value.length < 2) {
                  if (label === "Day") monthRef.current?.focus();
                  if (label === "Month") yearRef.current?.focus();
                }
              }} maxLength={length} keyboardType="number-pad"
              editable={!props.disabled} placeholder={label === "Year" ? "YYYY" : label === "Month" ? "MM" : "DD"}
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
          </View>
        ))}
      </View>
      {!!error && <Text accessibilityLiveRegion="polite" style={[localizedTextStyle(), styles.error]}>{t(error)}</Text>}
      <View style={styles.termsRow}>
        <TouchableOpacity testID="signup-terms-checkbox" accessibilityRole="checkbox"
          accessibilityLabel={t("I agree to the Terms of Service.")}
          accessibilityState={{ checked: props.termsAccepted, disabled: !!props.disabled }}
          disabled={props.disabled} onPress={() => props.onTerms(!props.termsAccepted)} style={styles.checkTarget}>
          <Ionicons name={props.termsAccepted ? "checkbox" : "square-outline"} size={25} color={props.termsAccepted ? colors.primary : colors.mutedForeground} />
        </TouchableOpacity>
        <View style={styles.termsText}>
          <Text style={[localizedTextStyle(), styles.notice, { color: colors.foreground }]}>{t("I agree to the")}</Text>
          <TouchableOpacity testID="signup-terms-link" accessibilityRole="link" onPress={openTerms} style={styles.termsLink}>
            <Text style={[localizedTextStyle(), styles.link, { color: colors.primary }]}>{t("Terms of Service")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  group: { gap: 8, marginTop: 8 },
  label: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  notice: { fontSize: 13, lineHeight: 20, fontFamily: "Inter_400Regular" },
  dateRow: { flexDirection: "row", gap: 10 },
  dateField: { flex: 1, gap: 5 },
  dateLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 14, fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", writingDirection: "ltr" },
  error: { color: "#FF4D6A", fontSize: 12, fontFamily: "Inter_400Regular" },
  termsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  checkTarget: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  termsText: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 4 },
  termsLink: { minHeight: 44, justifyContent: "center" },
  link: { fontSize: 13, lineHeight: 20, fontFamily: "Inter_600SemiBold", textDecorationLine: "underline" },
});
