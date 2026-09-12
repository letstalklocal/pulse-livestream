import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "@clerk/expo";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAppLanguage } from "@/i18n";

const base = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
type Status = { isVerified: boolean; status: string; available: boolean };
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
  const request = async (path: string, method = "GET") => {
    const token = await getToken();
    if (!token) throw new Error("Please sign in again.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${base}/api/account/verification${path}`, { method, signal: controller.signal, headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Verification request failed");
      return await response.json();
    } finally { clearTimeout(timeout); }
  };
  const status = useQuery<Status>({ queryKey: ["identity-verification", userId], enabled: !!userId, retry: false, queryFn: () => request(""), refetchInterval: query => query.state.data?.status === "pending" ? 15_000 : false });
  const { refetch } = status;
  useFocusEffect(useCallback(() => { if (userId) void refetch(); }, [userId, refetch]));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", next => { if (next === "active" && userId) void refetch(); });
    return () => subscription.remove();
  }, [userId, refetch]);
  const openWebsite = async () => {
    if (openingRef.current) return;
    openingRef.current = true; setOpening(true); setError(false);
    try {
      const { url } = await request("/handoff", "POST");
      if (typeof url !== "string" || new URL(url).protocol !== "https:") throw new Error("Invalid verification link");
      // A browser return never grants access: reload authoritative server state.
      await WebBrowser.openBrowserAsync(url);
      await refetch();
    } catch { setError(true); }
    finally { openingRef.current = false; setOpening(false); }
  };
  if (!isLoaded) return <ActivityIndicator />;
  if (!userId) return <Redirect href="/(auth)/sign-in" />;
  const label = status.data?.isVerified ? t("Verified") : status.data?.status === "pending" ? t("Verification in progress") : status.data?.status === "review_needed" ? t("Verification needs review") : status.data?.status === "failed" ? t("Verification not approved") : t("Not verified");
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 20, paddingBottom: insets.bottom + 32, gap: 20 }}>
      <TouchableOpacity accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace("/account")}><Text style={[localizedTextStyle(), { color: colors.primary }]}>{t("Back")}</Text></TouchableOpacity>
      <Text style={[localizedTextStyle(), styles.title, { color: colors.foreground }]}>{t("Age verification")}</Text>
      <Text style={[localizedTextStyle(), { color: colors.mutedForeground }]}>{t("Confirm you are 18+ on our website using an identity document and a selfie.")}</Text>
      {status.isPending ? <ActivityIndicator color={colors.primary} /> : !status.isError && <Text accessibilityLiveRegion="polite" style={[localizedTextStyle(), styles.status, { color: colors.foreground }]}>{label}</Text>}
      {(status.isError || error) && <Text accessibilityRole="alert" style={[localizedTextStyle(), { color: "#FF637F" }]}>{t("Could not load verification. Please try again.")}</Text>}
      {status.data && !status.data.available && <Text style={[localizedTextStyle(), { color: colors.mutedForeground }]}>{t("Verification is not available yet. Please try again later.")}</Text>}
      <TouchableOpacity accessibilityRole="button" disabled={opening || !status.data?.available} onPress={() => void openWebsite()} style={[styles.button, { backgroundColor: colors.primary, opacity: opening || !status.data?.available ? 0.5 : 1 }]}>
        {opening ? <ActivityIndicator color="#fff" /> : <Text style={[localizedTextStyle(), styles.buttonText]}>{status.data?.isVerified ? t("Manage verification on website") : t("Verify now")}</Text>}
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ busy: status.isFetching, disabled: status.isFetching }} disabled={status.isFetching} onPress={async () => { setError(false); setChecked(false); const result = await refetch(); setChecked(!result.isError); }} style={[styles.button, { borderWidth: 1, borderColor: colors.primary, flexDirection: "row", justifyContent: "center", gap: 10 }]}>
        {status.isFetching && <ActivityIndicator color={colors.primary} />}
        <Text style={[localizedTextStyle(), { color: colors.primary }]}>{status.isFetching ? t("Loading…") : t("Check verification status")}</Text>
      </TouchableOpacity>
      {checked && !status.isFetching && !status.isError && <Text accessibilityLiveRegion="polite" style={[localizedTextStyle(), { color: colors.mutedForeground }]}>{t("Verification status checked.")}</Text>}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({ title: { fontSize: 28, fontWeight: "700" }, status: { fontSize: 20, fontWeight: "600" }, button: { padding: 16, borderRadius: 14, alignItems: "center" }, buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" } });
