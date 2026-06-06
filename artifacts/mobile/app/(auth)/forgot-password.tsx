import { Ionicons } from "@expo/vector-icons";
import { useSignIn } from "@clerk/expo";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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

type Step = "email" | "code" | "password";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, fetchStatus } = useSignIn();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const extractError = (e: unknown) =>
    (e as { errors?: { message: string }[] })?.errors?.[0]?.message ??
    "Something went wrong. Please try again.";

  const handleSendCode = async () => {
    setError(null);
    const { error: createErr } = await signIn.create({ identifier: email.trim() });
    if (createErr) { setError(extractError(createErr)); return; }
    const { error: sendErr } = await signIn.resetPasswordEmailCode.sendCode();
    if (sendErr) { setError(extractError(sendErr)); return; }
    setStep("code");
  };

  const handleVerifyCode = async () => {
    setError(null);
    const { error: verifyErr } = await signIn.resetPasswordEmailCode.verifyCode({
      code: code.trim(),
    });
    if (verifyErr) { setError(extractError(verifyErr)); return; }
    setStep("password");
  };

  const handleSubmitPassword = async () => {
    setError(null);
    const { error: submitErr } = await signIn.resetPasswordEmailCode.submitPassword({
      password: newPassword,
      signOutOfOtherSessions: false,
    });
    if (submitErr) { setError(extractError(submitErr)); return; }
    if (signIn.status === "complete") {
      await signIn.finalize({ navigate: () => router.replace("/(auth)/sign-in") });
    }
    setSuccess(true);
    setTimeout(() => router.replace("/(auth)/sign-in"), 1500);
  };

  const goBack = () => {
    if (step === "code") { setStep("email"); return; }
    if (step === "password") { setStep("code"); return; }
    router.back();
  };

  if (success) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" />
        <Ionicons name="checkmark-circle" size={64} color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground, marginTop: 20, textAlign: "center" }]}>
          Password reset!
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, textAlign: "center" }]}>
          Redirecting you to sign in…
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="light-content" />
      <TouchableOpacity style={[styles.backBtn, { top: insets.top + 10 }]} onPress={goBack}>
        <Ionicons name="chevron-back" size={22} color={colors.foreground} />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 56 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoRow}>
          <View style={[styles.logoDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.logoText, { color: colors.foreground }]}>Pulse</Text>
        </View>

        {step === "email" && (
          <>
            <Text style={[styles.title, { color: colors.foreground }]}>Forgot password?</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Enter your email and we'll send you a reset code.
            </Text>
            <View style={styles.form}>
              <View style={[styles.inputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="mail-outline" size={18} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email address"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  autoFocus
                />
              </View>
              {error && <Text style={styles.errorText}>{error}</Text>}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: !email.trim() || fetchStatus === "fetching" ? 0.5 : 1 }]}
                onPress={handleSendCode}
                disabled={!email.trim() || fetchStatus === "fetching"}
                activeOpacity={0.85}
              >
                {fetchStatus === "fetching" ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Send reset code</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === "code" && (
          <>
            <Text style={[styles.title, { color: colors.foreground }]}>Check your email</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              We sent a code to {email}. Enter it below.
            </Text>
            <View style={styles.form}>
              <View style={[styles.inputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="key-outline" size={18} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  value={code}
                  onChangeText={setCode}
                  placeholder="Reset code"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  autoFocus
                />
              </View>
              {error && <Text style={styles.errorText}>{error}</Text>}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: !code.trim() || fetchStatus === "fetching" ? 0.5 : 1 }]}
                onPress={handleVerifyCode}
                disabled={!code.trim() || fetchStatus === "fetching"}
                activeOpacity={0.85}
              >
                {fetchStatus === "fetching" ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Verify code</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSendCode} style={styles.linkRow}>
                <Text style={[styles.linkText, { color: colors.primary }]}>Resend code</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === "password" && (
          <>
            <Text style={[styles.title, { color: colors.foreground }]}>New password</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Choose a strong password for your account.
            </Text>
            <View style={styles.form}>
              <View style={[styles.inputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="New password"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPassword}
                  autoFocus
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
              {error && <Text style={styles.errorText}>{error}</Text>}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: !newPassword || fetchStatus === "fetching" ? 0.5 : 1 }]}
                onPress={handleSubmitPassword}
                disabled={!newPassword || fetchStatus === "fetching"}
                activeOpacity={0.85}
              >
                {fetchStatus === "fetching" ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Reset password</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
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
  content: { paddingHorizontal: 24, flexGrow: 1 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 32 },
  logoDot: { width: 12, height: 12, borderRadius: 6 },
  logoText: { fontSize: 20, fontWeight: "800", fontFamily: "Inter_700Bold", letterSpacing: 1 },
  title: { fontSize: 30, fontWeight: "800", fontFamily: "Inter_700Bold", marginBottom: 8 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 32 },
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
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", padding: 0 },
  errorText: { color: "#FF4D6A", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: -4 },
  primaryBtn: { paddingVertical: 15, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
  primaryBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
  linkRow: { alignItems: "center", marginTop: 16 },
  linkText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
