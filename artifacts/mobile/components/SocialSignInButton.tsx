import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useSSO } from "@clerk/expo/experimental";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useColors } from "@/hooks/useColors";
import { useAppLanguage } from "@/i18n";

WebBrowser.maybeCompleteAuthSession();

type Props = { provider?: "google" | "apple"; signup?: boolean; disabled?: boolean };

export default function SocialSignInButton({ provider = "google", signup = false, disabled = false }: Props) {
  const label = provider === "apple"
    ? (signup ? "Sign up with Apple" : "Sign in with Apple")
    : (signup ? "Sign up with Google" : "Sign in with Google");
  const errorMessage = provider === "apple"
    ? "Could not complete Apple sign-in. Please try again or use email."
    : "Could not complete Google sign-in. Please try again or use email.";
  const { isLoaded, isSignedIn } = useAuth();
  const { startSSOFlow } = useSSO();
  const colors = useColors();
  const { t, localizedTextStyle } = useAppLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const unavailable = disabled || !isLoaded || !!isSignedIn || busy;
  const start = async () => {
    if (unavailable || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    try {
      const result = await startSSOFlow({
        strategy: provider === "apple" ? "oauth_apple" : "oauth_google",
        redirectUrl: AuthSession.makeRedirectUri({ scheme: "mobile", path: "sso-callback" }),
      });
      if (result.authSessionResult?.type === "cancel" || result.authSessionResult?.type === "dismiss") return;
      // Clerk's Core 3 SSO hook activates completed/existing sessions itself.
      // AuthContext then enforces birthday/Terms for every new Pulse profile.
      if (!result.createdSessionId && !result.signIn?.existingSession && !result.signUp?.existingSession && mounted.current) setError(true);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <View style={styles.group}>
      <TouchableOpacity
        testID={`${signup ? "signup" : "signin"}-${provider}`}
        accessibilityRole="button"
        accessibilityLabel={t(label)}
        accessibilityState={{ disabled: unavailable, busy }}
        disabled={unavailable}
        onPress={start}
        style={[styles.button, { backgroundColor: colors.card, borderColor: colors.border, opacity: unavailable ? 0.6 : 1 }]}
      >
        {busy ? <ActivityIndicator color={colors.foreground} /> : <Ionicons name={provider === "apple" ? "logo-apple" : "logo-google"} size={22} color={colors.foreground} />}
        <Text style={[localizedTextStyle(), styles.label, { color: colors.foreground }]}>{t(label)}</Text>
      </TouchableOpacity>
      {error && <Text accessibilityLiveRegion="polite" style={[localizedTextStyle(), styles.error]}>{t(errorMessage)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  button: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 18, minHeight: 60 },
  label: { flex: 1, fontSize: 16, fontFamily: "Inter_700Bold" },
  error: { fontSize: 13, lineHeight: 18, color: "#FF4D6A", fontFamily: "Inter_400Regular" },
});
