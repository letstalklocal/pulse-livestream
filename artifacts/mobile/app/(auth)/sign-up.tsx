import { useAppLanguage } from "@/i18n";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { Link, useRouter, type Href } from "expo-router";
import React, { useEffect } from "react";
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function SignUpScreen() {
  const { t, localizedTextStyle } = useAppLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (isSignedIn) router.replace("/(tabs)/profile");
  }, [isSignedIn, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 10 }]}
        accessibilityRole="button"
        accessibilityLabel={t("Back")}
        onPress={() => router.canGoBack() ? router.back() : router.replace("/(auth)/sign-in")}
      >
        <Ionicons name="chevron-back" size={22} color={colors.foreground} />
      </TouchableOpacity>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.logoRow}>
          <View style={[styles.logoDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.logoText, { color: colors.foreground }]}>Pulse</Text>
        </View>
        <Text style={[localizedTextStyle(), styles.title, { color: colors.foreground }]}>{t("Create account")}</Text>
        <Text style={[localizedTextStyle(), styles.subtitle, { color: colors.mutedForeground }]}>{t("Join Pulse and start streaming to the world")}</Text>

        <View style={styles.options}>
          <TouchableOpacity
            testID="signup-google"
            disabled
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            accessibilityLabel={t("Sign up with Google")}
            accessibilityHint={t("Coming soon")}
            style={[styles.option, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Ionicons name="logo-google" size={22} color={colors.mutedForeground} />
            <View style={styles.optionCopy}>
              <Text style={[localizedTextStyle(), styles.optionTitle, { color: colors.mutedForeground }]}>{t("Sign up with Google")}</Text>
              <Text style={[localizedTextStyle(), styles.comingSoon, { color: colors.mutedForeground }]}>{t("Coming soon")}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            testID="signup-phone"
            disabled
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            accessibilityLabel={t("Sign up with Phone")}
            accessibilityHint={t("Coming soon")}
            style={[styles.option, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Ionicons name="call-outline" size={22} color={colors.mutedForeground} />
            <View style={styles.optionCopy}>
              <Text style={[localizedTextStyle(), styles.optionTitle, { color: colors.mutedForeground }]}>{t("Sign up with Phone")}</Text>
              <Text style={[localizedTextStyle(), styles.comingSoon, { color: colors.mutedForeground }]}>{t("Coming soon")}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            testID="signup-email"
            accessibilityRole="button"
            accessibilityLabel={t("Sign up with Email")}
            onPress={() => router.push("/(auth)/sign-up-email" as Href)}
            activeOpacity={0.85}
            style={[styles.option, { backgroundColor: colors.primary, borderColor: colors.primary }]}
          >
            <Ionicons name="mail-outline" size={22} color="#FFF" />
            <Text style={[localizedTextStyle(), styles.optionTitle, styles.optionCopy, { color: "#FFF" }]}>{t("Sign up with Email")}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.footerRow}>
          <Text style={[localizedTextStyle(), styles.footerText, { color: colors.mutedForeground }]}>{t("Already have an account? ")}</Text>
          <Link href="/(auth)/sign-in" asChild>
            <Pressable>
              <Text style={[localizedTextStyle(), styles.footerLink, { color: colors.primary }]}>{t("Sign in")}</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: { position: "absolute", left: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", zIndex: 10 },
  content: { paddingHorizontal: 24, flexGrow: 1 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 32 },
  logoDot: { width: 12, height: 12, borderRadius: 6 },
  logoText: { fontSize: 20, fontWeight: "800", fontFamily: "Inter_700Bold", letterSpacing: 1 },
  title: { fontSize: 30, fontWeight: "800", fontFamily: "Inter_700Bold", marginBottom: 8 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 32 },
  options: { gap: 14 },
  option: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 18, minHeight: 60 },
  optionCopy: { flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
  comingSoon: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 5 },
  footerRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginTop: 28 },
  footerText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  footerLink: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
});
