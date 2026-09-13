import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "@clerk/expo";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAppLanguage } from "@/i18n";

WebBrowser.maybeCompleteAuthSession();

const base = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
type Status = { isVerified: boolean; verificationType: "selfie" | "id" | null; upgradeStatus: string; canUpgrade: boolean; status: string; available: boolean; privacyUrl: string | null; consentVersion: string };
export default function VerificationScreen() {
  const { userId, isLoaded, getToken } = useAuth();
  const { t, localizedTextStyle } = useAppLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
  const [error, setError] = useState(false);
  const [checked, setChecked] = useState(false);
  const [consent, setConsent] = useState(false);
  useEffect(() => { setConsent(false); }, [userId]);
  const request = async (path: string, method = "GET", body?: Record<string, unknown>) => {
    const token = await getToken();
    if (!token) throw new Error("Please sign in again.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${base}/api/account/verification${path}`, { method, signal: controller.signal, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!response.ok) throw new Error("Verification request failed");
      return await response.json();
    } finally { clearTimeout(timeout); }
  };
  const status = useQuery<Status>({ queryKey: ["identity-verification", userId], enabled: !!userId, retry: false, queryFn: async () => {
    const snapshot = await request("");
    if (snapshot.available && (snapshot.status === "pending" || snapshot.upgradeStatus === "pending")) {
      try { return await request("/refresh", "POST"); } catch { return snapshot; }
    }
    return snapshot;
  }, refetchInterval: query => (query.state.data?.status === "pending" || query.state.data?.upgradeStatus === "pending") ? 15_000 : false });
  const needsReview = !status.data?.isVerified && (status.data?.status === "review_needed" || status.data?.upgradeStatus === "review_needed");
  const { refetch } = status;
  useFocusEffect(useCallback(() => { if (userId) void refetch(); }, [userId, refetch]));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", next => { if (next === "active" && userId) void refetch(); });
    return () => subscription.remove();
  }, [userId, refetch]);
  const refreshResult = async () => {
    try { await request("/refresh", "POST"); } finally { await refetch(); }
  };
  const openWebsite = async () => {
    if (openingRef.current || needsReview || (!status.data?.isVerified && !consent)) return;
    openingRef.current = true; setOpening(true); setError(false);
    try {
      if (status.data?.isVerified) {
        const { url } = await request("/handoff", "POST");
        if (typeof url !== "string" || new URL(url).protocol !== "https:") throw new Error("Invalid verification link");
        await WebBrowser.openBrowserAsync(url);
      } else {
        const { url, returnUrl } = await request("/start", "POST", {
          consent: true, consentVersion: status.data?.consentVersion,
          platform: Platform.OS === "web" ? "web" : "native",
        });
        const provider = new URL(url);
        if (provider.protocol !== "https:" || provider.hostname !== "verify.didit.me" || provider.username || provider.password) throw new Error("Invalid verification link");
        // Return parameters never grant access. Only a server-fetched provider decision does.
        await WebBrowser.openAuthSessionAsync(url, returnUrl);
      }
      await refreshResult();
    } catch { setError(true); await refetch(); }
    finally { openingRef.current = false; setOpening(false); }
  };
  const openPrivacy = async (url: string | null | undefined) => {
    try {
      if (!url || new URL(url).protocol !== "https:") throw new Error("Privacy notice unavailable");
      await Linking.openURL(url);
    } catch { setError(true); }
  };
  if (!isLoaded) return <ActivityIndicator />;
  if (!userId) return <Redirect href="/(auth)/sign-in" />;
  const label = status.data?.isVerified ? t("You’re Verified") : status.data?.status === "pending" ? t("Verification in progress") : status.data?.status === "review_needed" ? t("Verification needs review") : status.data?.status === "failed" ? t("Verification not approved") : t("Not verified");
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={[styles.header, { paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 10, borderColor: colors.border, backgroundColor: colors.background }]}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Back")} onPress={() => router.canGoBack() ? router.back() : router.replace("/account")} style={[styles.back, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Ionicons name="chevron-back" size={20} color={colors.foreground} />
      </TouchableOpacity>
      <Text numberOfLines={1} style={[localizedTextStyle(), styles.headerTitle, { color: colors.foreground }]}>{t("Age verification")}</Text>
      <View style={{ width: 38 }} />
    </View>
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 24, paddingBottom: insets.bottom + 32, gap: 20 }}>
      {!status.data?.isVerified && <Text style={[localizedTextStyle(), styles.title, { color: colors.foreground }]}>{t("Help Keep our Community Safe.")}</Text>}
      {!status.data?.isVerified && <View style={{ gap: 12 }}>
        <Text style={[localizedTextStyle(), { color: colors.mutedForeground }]}>{t("You must be 18+ to use Pulse.")}</Text>
        <Text style={[localizedTextStyle(), { color: colors.mutedForeground }]}>{t("Age verification helps protect you and our community.")}</Text>
        {!needsReview && <Text style={[localizedTextStyle(), { color: colors.mutedForeground }]}>{t("Start with a selfie. Our verification service Didit will ask for ID if needed.")}</Text>}
      </View>}
      {status.isPending ? <ActivityIndicator color={colors.primary} /> : !status.isError && <Text accessibilityLiveRegion="polite" style={[localizedTextStyle(), styles.status, status.data?.isVerified && styles.title, { color: status.data?.isVerified ? "#4ade80" : colors.foreground }]}>{label}</Text>}
      {!status.isError && status.data?.isVerified && <View style={{ gap: 12 }}>
        {status.data.verificationType === "selfie" && <Text style={[localizedTextStyle(), { color: colors.foreground }]}>{t("Your age was verified with a selfie.")}</Text>}
        <Text style={[localizedTextStyle(), { color: colors.mutedForeground }]}>{t("Thank you for verifying your age. Verification helps protect you and keep our community safe.")}</Text>
      </View>}
      {(status.isError || error) && <Text accessibilityRole="alert" style={[localizedTextStyle(), { color: "#FF637F" }]}>{t("Could not load verification. Please try again.")}</Text>}
      {status.data && !status.data.available && <Text style={[localizedTextStyle(), { color: colors.mutedForeground }]}>{t("Verification is not available yet. Please try again later.")}</Text>}
      {!status.data?.isVerified && !needsReview && <View style={{ gap: 16 }}>
        <Text style={[localizedTextStyle(), { color: colors.mutedForeground }]}>{t("Pulse does not store your ID or selfie.")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
          <TouchableOpacity accessibilityRole="link" onPress={() => void openPrivacy(status.data?.privacyUrl)}><Text style={[localizedTextStyle(), { color: colors.primary, textDecorationLine: "underline" }]}>{t("Our Privacy Policy")}</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="link" onPress={() => void openPrivacy("https://didit.me/terms/privacy-policy/")}><Text style={[localizedTextStyle(), { color: colors.primary, textDecorationLine: "underline" }]}>{t("Didit's Privacy Policy")}</Text></TouchableOpacity>
        </View>
        <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: consent, disabled: opening }} disabled={opening} onPress={() => setConsent(value => !value)} style={{ flexDirection: "row", gap: 12, alignItems: "center", minHeight: 48 }}>
          <Text accessible={false} style={{ fontSize: 26, color: consent ? colors.primary : colors.mutedForeground }}>{consent ? "☑" : "☐"}</Text>
          <Text style={[localizedTextStyle(), { color: colors.foreground, flex: 1 }]}>{t("I agree to let Didit use my ID and selfie to verify my age.")}</Text>
        </TouchableOpacity>
      </View>}
      {!needsReview && <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: opening || !status.data?.available || (!status.data?.isVerified && !consent), busy: opening }} disabled={opening || !status.data?.available || (!status.data?.isVerified && !consent)} onPress={() => void openWebsite()} style={[styles.button, { backgroundColor: colors.primary, opacity: opening || !status.data?.available || (!status.data?.isVerified && !consent) ? 0.5 : 1 }]}>
        {opening ? <ActivityIndicator color="#fff" /> : <Text style={[localizedTextStyle(), styles.buttonText]}>{status.data?.isVerified ? t("Manage verification on website") : t("Verify now")}</Text>}
      </TouchableOpacity>}
      {(status.isError || status.data?.status === "pending" || status.data?.status === "review_needed" || status.data?.upgradeStatus === "pending" || status.data?.upgradeStatus === "review_needed") && <TouchableOpacity accessibilityRole="button" accessibilityState={{ busy: status.isFetching, disabled: status.isFetching }} disabled={status.isFetching} onPress={async () => { setError(false); setChecked(false); try { await refreshResult(); setChecked(true); } catch { setError(true); } }} style={[styles.button, { borderWidth: 1, borderColor: colors.primary, flexDirection: "row", justifyContent: "center", gap: 10 }]}>
        {status.isFetching && <ActivityIndicator color={colors.primary} />}
        <Text style={[localizedTextStyle(), { color: colors.primary }]}>{status.isFetching ? t("Loading…") : t("Check verification status")}</Text>
      </TouchableOpacity>}
      {checked && !status.isFetching && !status.isError && <Text accessibilityLiveRegion="polite" style={[localizedTextStyle(), { color: colors.mutedForeground }]}>{t("Verification status checked.")}</Text>}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  back: { width: 38, height: 38, borderWidth: 1, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 21, fontFamily: "Inter_700Bold" },
  title: { fontSize: 28, fontWeight: "700" }, status: { fontSize: 20, fontWeight: "600" }, button: { padding: 16, borderRadius: 14, alignItems: "center" }, buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" } });
