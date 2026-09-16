import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useColors } from "@/hooks/useColors";
import { useAppLanguage } from "@/i18n";

WebBrowser.maybeCompleteAuthSession();

// The browser session/Clerk SDK validates the callback. URL parameters never
// grant access or verification status. This route also handles a cold return.
export default function SSOCallback() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const { t, localizedTextStyle } = useAppLanguage();
  useEffect(() => {
    if (isSignedIn) router.replace("/(tabs)/profile");
  }, [isSignedIn, router]);
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <ActivityIndicator color={colors.primary} />
    <Text style={[localizedTextStyle(), { color: colors.foreground }]}>{t("Completing sign-in…")}</Text>
    <TouchableOpacity onPress={() => router.replace("/(auth)/sign-in")} style={styles.button}>
      <Text style={[localizedTextStyle(), { color: colors.primary }]}>{t("Back to sign in")}</Text>
    </TouchableOpacity>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  button: { minHeight: 44, justifyContent: "center" },
});
