import SocialSignInButton from "@/components/SocialSignInButton";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import SignupProgress from "@/components/SignupProgress";
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
      <View style={[styles.header, { marginTop: insets.top }]}>
      <TouchableOpacity
        style={[styles.backBtn, { top: 10 }]}
        accessibilityRole="button"
        accessibilityLabel={t("Back")}
        onPress={() => router.canGoBack() ? router.back() : router.replace("/(auth)/sign-in")}
      >
        <Ionicons name="chevron-back" size={22} color={colors.foreground} />
      </TouchableOpacity>
        <Text accessibilityRole="header" style={[localizedTextStyle(), styles.headerTitle, { color: colors.foreground }]}>{t("Create Account")}</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: 16, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.logoRow}>
          <View style={[styles.logoDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.logoText, { color: colors.foreground }]}>Pulse</Text>
        </View>
        <SignupProgress stage={2} />
        <Text style={[localizedTextStyle(), styles.subtitle, { textAlign: "center", color: colors.mutedForeground }]}>{t("Join Pulse and start enjoying live streams.")}</Text>

        <View style={styles.options}>
          <GoogleSignInButton signup />
          <SocialSignInButton provider="apple" signup />
          <TouchableOpacity
            testID="signup-email"
            accessibilityRole="button"
            accessibilityLabel={t("Sign up with Email")}
            onPress={() => router.push("/(auth)/sign-up-email" as Href)}
            activeOpacity={0.85}
            style={[styles.option, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Ionicons name="mail-outline" size={22} color={colors.foreground} />
            <Text style={[localizedTextStyle(), styles.optionTitle, styles.optionCopy, { color: colors.foreground }]}>{t("Sign up with Email")}</Text>
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
  header: { minHeight: 58, paddingHorizontal: 64, paddingVertical: 16, justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
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
