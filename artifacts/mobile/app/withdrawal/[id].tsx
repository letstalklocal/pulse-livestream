import { File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppLanguage } from "@/i18n";
import { useColors } from "@/hooks/useColors";
import { useWithdrawals } from "@/hooks/useWithdrawals";
import { safeProviderLink, withdrawalStatus } from "@/utils/withdrawals";
export default function WithdrawalScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const api = useWithdrawals(id);
  const router = useRouter();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t, appLocale, localizedTextStyle } = useAppLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const owner = useRef(api.userId);
  owner.current = api.userId;
  useEffect(() => {
    setBusy(false);
    setError("");
  }, [api.userId, id]);
  useFocusEffect(
    useCallback(() => {
      if (api.userId) void api.refresh();
    }, [api.userId, api.refresh]),
  );
  const w = api.detail.data;
  const q = w?.quote;
  const link =
    w && ["awaiting_recipient", "processing"].includes(w.status)
      ? safeProviderLink(w.providerLink)
      : null;
  const money = (n: number) =>
    new Intl.NumberFormat(appLocale(), {
      style: "currency",
      currency: "USD",
    }).format(n / 100);
  const text = (value: string, muted = false) => (
    <Text
      style={[
        localizedTextStyle(),
        styles.text,
        { color: muted ? c.mutedForeground : c.foreground },
      ]}
    >
      {value}
    </Text>
  );
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    const account = api.userId;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (error) {
      if (owner.current === account)
        setError(
          error instanceof Error &&
            error.message === "Sharing is unavailable on this device."
            ? error.message
            : "Could not update withdrawal. Refresh and try again.",
        );
    } finally {
      if (owner.current === account) setBusy(false);
    }
  };
  const button = (label: string, action: () => void, disabled = false) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={action}
      style={[
        styles.button,
        { backgroundColor: c.primary, opacity: disabled ? 0.45 : 1 },
      ]}
    >
      <Text style={[localizedTextStyle(), styles.buttonText]}>{t(label)}</Text>
    </TouchableOpacity>
  );
  const download = async () => {
    const account = api.userId;
    // Older installed builds may not contain ExpoSharing. Load it only for
    // native statement export so its missing module cannot break route startup.
    let sharing: typeof import("expo-sharing") | undefined;
    if (Platform.OS !== "web") {
      try {
        sharing = await import("expo-sharing");
        if (!(await sharing.isAvailableAsync()))
          throw new Error("Sharing is unavailable on this device.");
      } catch {
        throw new Error("Sharing is unavailable on this device.");
      }
    }
    if (owner.current !== account) return;
    const content = await api.statement();
    if (owner.current !== account) return;
    if (Platform.OS === "web") {
      const url = URL.createObjectURL(
        new Blob([content], { type: "text/plain" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `pulse-withdrawal-${id}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else {
      const file = new File(
        Paths.cache,
        `pulse-statement-${Crypto.randomUUID()}.txt`,
      );
      try {
        file.create();
        file.write(content);
        if (owner.current === account)
          await sharing!.shareAsync(file.uri, {
            dialogTitle: t("Withdrawal statement"),
            mimeType: "text/plain",
            UTI: "public.plain-text",
          });
      } finally {
        if (file.exists) file.delete();
      }
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={[
          styles.header,
          {
            paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 10,
            borderColor: c.border,
          },
        ]}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("Back")}
          onPress={() => router.back()}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={24} color={c.foreground} />
        </TouchableOpacity>
        <Text
          style={[localizedTextStyle(), styles.title, { color: c.foreground }]}
        >
          {t("Withdrawal details")}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={api.detail.isRefetching}
            onRefresh={() => void api.refresh()}
            tintColor={c.primary}
          />
        }
      >
        {!api.userId ? (
          text(t("Sign in to withdraw your earnings."))
        ) : api.detail.isPending ? (
          <ActivityIndicator color={c.primary} />
        ) : api.detail.isError ? (
          <>
            {text(t("Could not load withdrawals."))}
            {button("Try again", () => void api.refresh())}
          </>
        ) : (
          w && (
            <>
              <View
                style={[
                  styles.card,
                  { backgroundColor: c.card, borderColor: c.border },
                ]}
              >
                {text(t(withdrawalStatus(w.status)))}
                {text(
                  t(
                    ["delivered", "canceled", "failed", "returned"].includes(
                      w.status,
                    )
                      ? "Requested withdrawal: {v0}"
                      : "Reserved withdrawal: {v0}",
                    { v0: money(w.grossCents) },
                  ),
                )}
                {text(new Date(w.createdAt).toLocaleString(appLocale()), true)}
                {text(
                  `${w.recipient.legalFirstName} ${w.recipient.legalLastName}`,
                )}
                {text(w.recipient.countryCode, true)}
              </View>
              {q ? (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: c.card, borderColor: c.border },
                  ]}
                >
                  {text(
                    t(
                      w.status === "awaiting_confirmation"
                        ? "Current quote"
                        : "Confirmed quote",
                    ),
                  )}
                  {text(
                    t("Amount sent: {v0}", { v0: money(q.sendAmountCents) }),
                  )}
                  {text(t("Provider fee: {v0}", { v0: money(q.feeCents) }))}
                  {text(t("Tax: {v0}", { v0: money(q.taxCents) }))}
                  {text(
                    t("Total earnings deducted: {v0}", {
                      v0: money(q.totalEarningsDeductedCents),
                    }),
                  )}
                  {text(
                    t("Recipient receives: {v0} {v1}", {
                      v0: q.receiveAmount,
                      v1: q.receiveCurrency,
                    }),
                  )}
                  {text(
                    t("Quote expires: {v0}", {
                      v0: new Date(q.expiresAt).toLocaleString(appLocale()),
                    }),
                    true,
                  )}
                  {w.status === "awaiting_confirmation" &&
                    button(
                      "Confirm this quote",
                      () => void run(() => api.approve(q.hash)),
                      busy || new Date(q.expiresAt).getTime() <= Date.now(),
                    )}
                </View>
              ) : (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: c.card, borderColor: c.border },
                  ]}
                >
                  {text(
                    t(
                      "We are checking the current fee and amount received. Your earnings remain reserved.",
                    ),
                    true,
                  )}
                </View>
              )}
              {link ? (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: c.card, borderColor: c.border },
                  ]}
                >
                  {text(
                    t(
                      "Enter your delivery details with Remitly. Returning to Pulse does not confirm completion.",
                    ),
                    true,
                  )}
                  {button(
                    "Open Remitly recipient link",
                    () => void run(() => Linking.openURL(link)),
                    busy,
                  )}
                  {text(
                    t("Recipient setup: {v0}", {
                      v0: t(
                        w.providerOnboardingStatus === "ready"
                          ? "Confirmed by provider"
                          : "Awaiting provider confirmation",
                      ),
                    }),
                    true,
                  )}
                </View>
              ) : [
                  "awaiting_quote",
                  "awaiting_confirmation",
                  "requested",
                  "preparing",
                  "awaiting_human_review",
                ].includes(w.status) ? (
                text(
                  t(
                    "You will receive a Remitly link after your withdrawal is prepared.",
                  ),
                  true,
                )
              ) : null}
              {!!error && (
                <Text
                  accessibilityRole="alert"
                  style={[localizedTextStyle(), { color: "#FF6075" }]}
                >
                  {t(error)}
                </Text>
              )}
              {button("Refresh status", () => void api.refresh(), busy)}
              {[
                "awaiting_quote",
                "awaiting_confirmation",
                "requested",
              ].includes(w.status) &&
                button(
                  "Cancel withdrawal",
                  () =>
                    Alert.alert(
                      t("Cancel withdrawal?"),
                      t(
                        "Your reserved coins will return to your wallet if payment preparation has not started.",
                      ),
                      [
                        { text: t("Keep withdrawal"), style: "cancel" },
                        {
                          text: t("Cancel withdrawal"),
                          style: "destructive",
                          onPress: () => void run(() => api.cancel()),
                        },
                      ],
                    ),
                  busy,
                )}
              {text(t("Withdrawal history"))}
              {w.history?.map((event, index) => (
                <View
                  key={index}
                  style={[
                    styles.card,
                    { backgroundColor: c.card, borderColor: c.border },
                  ]}
                >
                  {text(t(withdrawalStatus(event.action)))}
                  {text(
                    new Date(event.createdAt).toLocaleString(appLocale()),
                    true,
                  )}
                </View>
              ))}
              {button("Download statement", () => void run(download), busy)}
            </>
          )
        )}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  back: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 21, fontFamily: "Inter_700Bold", flex: 1 },
  content: { padding: 20, gap: 14 },
  text: { fontSize: 15, lineHeight: 23 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  button: {
    minHeight: 50,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
