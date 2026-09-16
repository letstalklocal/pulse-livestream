import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useClerk } from "@clerk/expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useAppLanguage } from "@/i18n";
import SignupEligibilityFields from "./SignupEligibilityFields";
import { KeyboardAwareScrollViewCompat } from "./KeyboardAwareScrollViewCompat";
import { birthdayError, birthdayFromParts, SIGNUP_TERMS_VERSION } from "@/lib/signup-eligibility";

export default function CompleteSignup() {
  const { onboardingRequired, syncError, completeSignup } = useAuth();
  const { signOut } = useClerk();
  const colors = useColors();
  const { t, localizedTextStyle } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const [day, setDay] = useState(""); const [month, setMonth] = useState(""); const [year, setYear] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false); const [busy, setBusy] = useState(false);
  const dateOfBirth = birthdayFromParts(day, month, year);
  const canSubmit = !busy && (!onboardingRequired || (termsAccepted && !birthdayError(dateOfBirth)));
  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try { await completeSignup(onboardingRequired ? { dateOfBirth, termsAccepted, termsVersion: SIGNUP_TERMS_VERSION } : undefined); }
    finally { setBusy(false); }
  };
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <KeyboardAwareScrollViewCompat bottomOffset={32} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <Text style={[styles.brand, { color: colors.primary }]}>Pulse</Text>
      <Text style={[localizedTextStyle(), styles.title, { color: colors.foreground }]}>{t("Finish creating your account")}</Text>
      {onboardingRequired && <SignupEligibilityFields day={day} month={month} year={year} termsAccepted={termsAccepted}
        onDay={setDay} onMonth={setMonth} onYear={setYear} onTerms={setTermsAccepted} disabled={busy} />}
      {!!syncError && <Text accessibilityLiveRegion="polite" style={[localizedTextStyle(), styles.error]}>{t(syncError)}</Text>}
      <TouchableOpacity testID="complete-signup-submit" disabled={!canSubmit} onPress={submit}
        style={[styles.button, { backgroundColor: colors.primary, opacity: canSubmit ? 1 : 0.5 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={[localizedTextStyle(), styles.buttonText]}>{t(onboardingRequired ? "Continue" : "Try again")}</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => void signOut()} disabled={busy} style={styles.signOut}>
        <Text style={[localizedTextStyle(), { color: colors.mutedForeground }]}>{t("Sign out")}</Text>
      </TouchableOpacity>
    </KeyboardAwareScrollViewCompat>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { flexGrow: 1, paddingHorizontal: 24, gap: 18 },
  brand: { fontSize: 20, fontFamily: "Inter_700Bold" }, title: { fontSize: 28, fontFamily: "Inter_700Bold" },
  error: { color: "#FF4D6A", fontSize: 13, fontFamily: "Inter_400Regular" },
  button: { paddingVertical: 15, borderRadius: 12, alignItems: "center" }, buttonText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  signOut: { minHeight: 44, alignItems: "center", justifyContent: "center" },
});
