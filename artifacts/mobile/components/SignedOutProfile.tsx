import React from "react";
import { StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAppLanguage } from "@/i18n";
import { useColors } from "@/hooks/useColors";
import SocialSignInButton from "./SocialSignInButton";

export default function SignedOutProfile() {
  const router = useRouter();
  const colors = useColors();
  const { t, localizedTextStyle } = useAppLanguage();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />
      <Ionicons name="person-circle-outline" size={64} color={colors.mutedForeground} />
      <Text accessibilityRole="header" style={[localizedTextStyle(), styles.title, { color: colors.foreground }]}>{t("Sign In")}</Text>
      <Text style={[localizedTextStyle(), styles.description, { color: colors.mutedForeground }]}>{t("Sign in to build your profile, go live, and grow your audience on Pulse.")}</Text>
        <View style={styles.options}>
          <SocialSignInButton provider="google" />
          <SocialSignInButton provider="apple" />
          <TouchableOpacity testID="signin-email" accessibilityRole="button" accessibilityLabel={t("Sign in with Email")}
            onPress={() => router.push("/(auth)/sign-in")}
            style={[styles.option, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="mail-outline" size={22} color={colors.foreground} />
            <Text style={[localizedTextStyle(), styles.optionLabel, { color: colors.foreground }]}>{t("Sign in with Email")}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity testID="signin-signup" accessibilityRole="button" onPress={() => router.push("/(auth)/sign-up")} style={styles.footer}>
          <Text style={[localizedTextStyle(), styles.footerText, { color: colors.mutedForeground }]}>{t("No account? ")}<Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{t("Sign up")}</Text></Text>
        </TouchableOpacity>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 },
  title: { fontSize: 28, fontWeight: "700", fontFamily: "Inter_700Bold", marginTop: 16, marginBottom: 8 },
  description: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 32 },
  options: { gap: 14, width: "100%" },
  option: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 18, minHeight: 60 },
  optionLabel: { flex: 1, fontSize: 16, fontFamily: "Inter_700Bold" },
  footer: { marginTop: 14, alignItems: "center", justifyContent: "center" },
  footerText: { fontSize: 13, lineHeight: 20, fontFamily: "Inter_400Regular", textAlign: "center" },
});
