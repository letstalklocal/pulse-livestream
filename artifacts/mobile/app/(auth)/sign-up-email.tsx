import { t, useAppLanguage, localizedTextStyle } from "@/i18n";
import { Ionicons } from "@expo/vector-icons";
import { useSignUp, useAuth } from "@clerk/expo";
import { Link, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function EmailSignUpScreen() {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { signUp, errors, fetchStatus } = useSignUp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");

  useEffect(() => {
    if (isSignedIn) router.replace("/(tabs)/profile");
  }, [isSignedIn]);

  const passwordsMatch = password === confirmPassword;
  const canSubmit = Boolean(email && password && confirmPassword && passwordsMatch) && fetchStatus !== "fetching";

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const { error } = await signUp.password({ emailAddress: email, password });
    if (error) return;
    if (!error) await signUp.verifications.sendEmailCode();
  };

  const handleVerify = async () => {
    await signUp.verifications.verifyEmailCode({ code: verifyCode });
    if (signUp.status === "complete") {
      await signUp.finalize({
        navigate: () => router.replace("/(tabs)"),
      });
    }
  };

  const needsEmailVerification =
    signUp.status === "missing_requirements" &&
    signUp.unverifiedFields.includes("email_address") &&
    signUp.missingFields.length === 0;

  if (needsEmailVerification) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" />
        <TouchableOpacity style={[styles.backBtn, { top: insets.top + 10 }]} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 56 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.logoRow}>
            <View style={[styles.logoDot, { backgroundColor: colors.primary }]} />
            <Text style={[styles.logoText, { color: colors.foreground }]}>Pulse</Text>
          </View>

          <Text style={[localizedTextStyle(), [styles.title, { color: colors.foreground }]]}>{t("Check your email")}</Text>
          <Text style={[localizedTextStyle(), [styles.subtitle, { color: colors.mutedForeground }]]}>{t("We sent a 6-digit code to {v0}", { v0: email })}</Text>

          <View style={styles.form}>
            <View style={[styles.inputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="key-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                value={verifyCode}
                onChangeText={setVerifyCode}
                placeholder={t("Enter 6-digit code")}
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                autoFocus
              />
            </View>
            {errors?.fields?.code && (
              <Text style={styles.errorText}>{errors.fields.code.message}</Text>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: fetchStatus === "fetching" ? 0.6 : 1 }]}
              onPress={handleVerify}
              disabled={fetchStatus === "fetching"}
              activeOpacity={0.85}
            >
              {fetchStatus === "fetching" ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={[localizedTextStyle(), styles.primaryBtnText]}>{t("Verify email")}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => signUp.verifications.sendEmailCode()} style={styles.linkRow}>
              <Text style={[localizedTextStyle(), [styles.linkText, { color: colors.primary }]]}>{t("Resend code")}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="light-content" />
      <TouchableOpacity style={[styles.backBtn, { top: insets.top + 10 }]} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={22} color={colors.foreground} />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 56 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.logoRow}>
          <View style={[styles.logoDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.logoText, { color: colors.foreground }]}>Pulse</Text>
        </View>

        <Text style={[localizedTextStyle(), [styles.title, { color: colors.foreground }]]}>{t("Create account")}</Text>
        <Text style={[localizedTextStyle(), [styles.subtitle, { color: colors.mutedForeground }]]}>{t("Join Pulse and start streaming to the world")}</Text>

        <View style={styles.form}>
          <View style={[styles.inputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="mail-outline" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              value={email}
              onChangeText={setEmail}
              placeholder={t("Email address")}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
          </View>
          {errors?.fields?.emailAddress && (
            <Text style={styles.errorText}>{errors.fields.emailAddress.message}</Text>
          )}

          <View style={[styles.inputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              value={password}
              onChangeText={setPassword}
              placeholder={t("Password")}
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          {errors?.fields?.password && (
            <Text style={styles.errorText}>{errors.fields.password.message}</Text>
          )}

          <View testID="confirm-password-field" style={[styles.inputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t("Confirm password")}
              accessibilityLabel={t("Confirm password")}
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
            />
            <TouchableOpacity
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              accessibilityRole="button"
              accessibilityLabel={t(showConfirmPassword ? "Hide password" : "Show password")}
            >
              <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          {confirmPassword.length > 0 && !passwordsMatch && (
            <Text accessibilityLiveRegion="polite" style={[localizedTextStyle(), styles.errorText]}>{t("Passwords don't match.")}</Text>
          )}

          <TouchableOpacity
            style={[
              styles.primaryBtn,
              { backgroundColor: colors.primary, opacity: canSubmit ? 1 : 0.5 },
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {fetchStatus === "fetching" ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={[localizedTextStyle(), styles.primaryBtnText]}>{t("Create account")}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footerRow}>
          <Text style={[localizedTextStyle(), [styles.footerText, { color: colors.mutedForeground }]]}>{t("Already have an account? ")}</Text>
          <Link href="/(auth)/sign-in" asChild>
            <Pressable>
              <Text style={[localizedTextStyle(), [styles.footerLink, { color: colors.primary }]]}>{t("Sign in")}</Text>
            </Pressable>
          </Link>
        </View>

        {/* Required for Clerk bot protection */}
        <View nativeID="clerk-captcha" />

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: {
    position: "absolute",
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  content: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 32,
  },
  logoDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  logoText: {
    fontSize: 20,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginBottom: 32,
  },
  form: { gap: 12 },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  errorText: {
    color: "#FF4D6A",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: -4,
  },
  primaryBtn: {
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  primaryBtnText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 28,
  },
  footerText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  footerLink: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  linkRow: { alignItems: "center", marginTop: 16 },
  linkText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
