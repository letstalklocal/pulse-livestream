import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { GoldCoinIcon } from "@/components/GoldCoinIcon";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppLanguage } from "@/i18n";
import { useColors } from "@/hooks/useColors";
import { useWithdrawals, type PayoutRecipient } from "@/hooks/useWithdrawals";
import { usdCents, withdrawalStatus } from "@/utils/withdrawals";
const emptyRecipient: PayoutRecipient = {
  legalFirstName: "",
  legalLastName: "",
  secondSurname: "",
  countryCode: "",
  email: "",
  phone: "",
};
export default function WithdrawMoneyScreen() {
  const { t, localizedTextStyle, appLocale } = useAppLanguage();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const api = useWithdrawals();
  const owner = useRef(api.userId);
  owner.current = api.userId;
  const [providerId, setProvider] = useState("");
  const [countryId, setCountry] = useState("");
  const [methodId, setMethod] = useState("");
  const [amount, setAmount] = useState("15.00");
  const [recipient, setRecipient] = useState(emptyRecipient);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setProvider("");
    setCountry("");
    setMethod("");
    setAmount("15.00");
    setRecipient(emptyRecipient);
    setError("");
    setBusy(false);
  }, [api.userId]);
  useEffect(() => {
    if (api.overview.data?.recipient)
      setRecipient({
        ...api.overview.data.recipient,
        secondSurname: api.overview.data.recipient.secondSurname ?? undefined,
      });
  }, [api.overview.data?.recipient]);
  useFocusEffect(
    useCallback(() => {
      if (api.userId) void api.refresh();
    }, [api.userId, api.refresh]),
  );
  useEffect(() => {
    if (!api.pending || !api.catalog.data) return;
    for (const provider of api.catalog.data.providers)
      for (const country of provider.countries)
        if (
          country.methods.some((method) => method.id === api.pending?.methodId)
        ) {
          setProvider(provider.id);
          setCountry(country.id);
          setMethod(api.pending.methodId);
          setAmount((api.pending.withdrawalCents / 100).toFixed(2));
        }
  }, [api.pending, api.catalog.data]);
  const providers = api.catalog.data?.providers.filter((p) => p.enabled) ?? [];
  const provider = providers.find((p) => p.id === providerId);
  const countries =
    provider?.countries.filter(
      (country) =>
        country.enabled &&
        country.availability === "available" &&
        country.methods.some(
          (m) => m.enabled && m.availability === "available",
        ),
    ) ?? [];
  const country = countries.find((country) => country.id === countryId);
  const methods =
    country?.methods.filter(
      (m) => m.enabled && m.availability === "available",
    ) ?? [];
  const method = methods.find((m) => m.id === methodId);
  const observed = method?.observations
    .filter((o) => o.fundingMethod === "debit_card" && o.senderCountry === "US")
    .sort(
      (a, b) =>
        Math.abs(a.sendAmountCents - 1500) - Math.abs(b.sendAmountCents - 1500),
    )[0];
  const cents = usdCents(amount);
  const overview = api.overview.data;
  const money = (value: number) =>
    new Intl.NumberFormat(appLocale(), {
      style: "currency",
      currency: "USD",
    }).format(value / 100);
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
  const card = { backgroundColor: c.card, borderColor: c.border };
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
  const options = (
    items: { id: string; name: string }[],
    selected: string,
    onSelect: (id: string) => void,
  ) =>
    items.map((item) => (
      <TouchableOpacity
        key={item.id}
        accessibilityRole="radio"
        accessibilityState={{
          selected: item.id === selected,
          disabled: busy || !!api.pending,
        }}
        disabled={busy || !!api.pending}
        onPress={() => onSelect(item.id)}
        style={[
          styles.option,
          card,
          { borderColor: item.id === selected ? c.primary : c.border },
        ]}
      >
        {text(item.name)}
        <Ionicons
          name={item.id === selected ? "radio-button-on" : "radio-button-off"}
          size={22}
          color={c.primary}
        />
      </TouchableOpacity>
    ));
  const field = (
    label: string,
    key: keyof PayoutRecipient,
    keyboard: "default" | "email-address" | "phone-pad" = "default",
  ) => (
    <View style={styles.field}>
      <Text style={[localizedTextStyle(), { color: c.mutedForeground }]}>
        {t(label)}
      </Text>
      <TextInput
        accessibilityLabel={t(label)}
        editable={!busy && !api.pending}
        value={recipient[key] ?? ""}
        onChangeText={(value) =>
          setRecipient((previous) => ({ ...previous, [key]: value }))
        }
        keyboardType={keyboard}
        autoCapitalize={keyboard === "default" ? "words" : "none"}
        autoCorrect={false}
        style={[
          localizedTextStyle(),
          styles.input,
          card,
          { color: c.foreground },
        ]}
      />
    </View>
  );
  const submit = async () => {
    if (busy || (!api.pending && (!method || !country || cents === null)))
      return;
    const submittingOwner = api.userId;
    setBusy(true);
    setError("");
    try {
      if (api.pending) {
        const withdrawal = await api.submit(
          api.pending.methodId,
          api.pending.withdrawalCents,
        );
        if (owner.current === submittingOwner)
          router.push({
            pathname: "/withdrawal/[id]",
            params: { id: withdrawal.id },
          });
        return;
      }
      if (!method || !country || cents === null) return;
      if (
        !recipient.legalFirstName.trim() ||
        !recipient.legalLastName.trim() ||
        !/^\+\d{8,15}$/.test(recipient.phone.trim()) ||
        !/^\S+@\S+\.\S+$/.test(recipient.email.trim())
      )
        throw new Error(
          "Enter your legal name, email and phone number with country code.",
        );
      if (!api.pending)
        await api.saveRecipient({
          ...recipient,
          legalFirstName: recipient.legalFirstName.trim(),
          legalLastName: recipient.legalLastName.trim(),
          secondSurname: recipient.secondSurname?.trim(),
          email: recipient.email.trim(),
          phone: recipient.phone.trim(),
          countryCode: country.countryCode,
        });
      if (owner.current !== submittingOwner) return;
      const withdrawal = await api.submit(method.id, cents);
      if (owner.current === submittingOwner)
        router.push({
          pathname: "/withdrawal/[id]",
          params: { id: withdrawal.id },
        });
    } catch (e) {
      if (owner.current === submittingOwner)
        setError(
          e instanceof Error
            ? e.message
            : "Could not update withdrawal. Refresh and try again.",
        );
    } finally {
      if (owner.current === submittingOwner) setBusy(false);
    }
  };
  const availableCents = overview
    ? Math.floor(Number(overview.balances.availableTicks) / 4)
    : 0;
  const valid =
    !!overview?.enrolled &&
    !!overview?.policy.fundingPolicyReady &&
    !!method &&
    cents !== null &&
    cents >= overview.policy.firstMinimumCents &&
    cents <= overview.policy.maxWithdrawalCents &&
    (!!api.pending || cents <= availableCents);
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: c.background }}
    >
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
          style={styles.back}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={c.foreground} />
        </TouchableOpacity>
        <Text
          style={[localizedTextStyle(), styles.title, { color: c.foreground }]}
        >
          {t("Withdraw Money")}
        </Text>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={api.overview.isRefetching}
            onRefresh={() => void api.refresh()}
            tintColor={c.primary}
          />
        }
      >
        {!api.userId ? (
          text(t("Sign in to withdraw your earnings."))
        ) : api.overview.isPending || api.catalog.isPending ? (
          <ActivityIndicator color={c.primary} />
        ) : api.overview.isError || api.catalog.isError ? (
          <View style={[styles.card, card]}>
            {text(t("Could not load withdrawals."))}
            {button("Try again", () => void api.refresh())}
          </View>
        ) : (
          <>
            {overview && (
              <View style={[styles.card, card]}>
                {text(t("Wallet available for withdrawal"))}
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <GoldCoinIcon size={24} />
                  {text(
                    t("{v0} coins", {
                      v0: Number(
                        overview.balances.availableCoins,
                      ).toLocaleString(appLocale()),
                    }),
                  )}
                </View>
                {text(
                  money(
                    Math.floor(Number(overview.balances.availableTicks) / 4),
                  ),
                )}
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <GoldCoinIcon size={16} />
                  <View style={{ flex: 1 }}>
                    {text(
                      t("Reserved for withdrawals: {v0} coins ({v1})", {
                        v0: Number(
                          overview.balances.reservedCoins,
                        ).toLocaleString(appLocale()),
                        v1: money(
                          Math.floor(
                            Number(overview.balances.reservedTicks) / 4,
                          ),
                        ),
                      }),
                      true,
                    )}
                  </View>
                </View>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <GoldCoinIcon size={16} />
                  <View style={{ flex: 1 }}>
                    {text(
                      t("On hold: {v0} coins ({v1})", {
                        v0: Number(overview.balances.heldCoins).toLocaleString(
                          appLocale(),
                        ),
                        v1: money(
                          Math.floor(Number(overview.balances.heldTicks) / 4),
                        ),
                      }),
                      true,
                    )}
                  </View>
                </View>
                {text(
                  t(
                    "400 coins = USD 1. Withdrawals use your wallet coins, including purchased coins and received gifts.",
                  ),
                  true,
                )}
              </View>
            )}
            {!overview?.enrolled && (
              <View style={[styles.card, card]}>
                {text(t("Withdrawals are not enabled for your account yet."))}
              </View>
            )}
            {text(
              t(
                "Your recipient will receive a Remitly link to enter delivery details.",
              ),
            )}
            {!!api.pending &&
              button("Request withdrawal", () => void submit(), busy)}
            {!!error && !method && (
              <Text
                accessibilityRole="alert"
                style={[localizedTextStyle(), { color: "#FF6075" }]}
              >
                {t(error)}
              </Text>
            )}
            {text(t("Provider"))}
            {options(providers, providerId, (id) => {
              setProvider(id);
              setCountry("");
              setMethod("");
            })}
            {!!provider && (
              <>
                {text(t("Recipient country"))}
                {options(countries, countryId, (id) => {
                  setCountry(id);
                  setMethod("");
                })}
                {!countries.length &&
                  text(t("No payout options are currently available."), true)}
              </>
            )}
            {!!country && (
              <>
                {text(t("Delivery method"))}
                {options(
                  methods.map((method) => {
                    const sample = method.observations
                      .filter(
                        (o) =>
                          o.fundingMethod === "debit_card" &&
                          o.senderCountry === "US",
                      )
                      .sort(
                        (a, b) =>
                          Math.abs(a.sendAmountCents - 1500) -
                          Math.abs(b.sendAmountCents - 1500),
                      )[0];
                    return {
                      id: method.id,
                      name: `${method.name} · ${method.receiveCurrency}${sample ? `\n${t("Observed fee: {v0}", { v0: money(sample.feeCents) })}` : ""}${sample?.deliveryEstimate ? `\n${t("Estimated delivery: {v0}", { v0: sample.deliveryEstimate })}` : ""}`,
                    };
                  }),
                  methodId,
                  setMethod,
                )}
              </>
            )}
            {!!method && (
              <View style={[styles.card, card]}>
                {text(
                  t("Last verified: {v0}", {
                    v0: new Date(method.lastVerifiedAt).toLocaleDateString(
                      appLocale(),
                    ),
                  }),
                  true,
                )}
                {text(
                  t("Receive currency: {v0}", { v0: method.receiveCurrency }),
                )}
                {observed &&
                  text(
                    t("Observed fee: {v0}", { v0: money(observed.feeCents) }),
                  )}
                {observed?.deliveryEstimate &&
                  text(
                    t("Estimated delivery: {v0}", {
                      v0: observed.deliveryEstimate,
                    }),
                  )}
                {text(
                  t(
                    "Saved fees are estimates. We will verify the current quote before you confirm payment.",
                  ),
                  true,
                )}
                {observed &&
                  text(
                    t(
                      "The observed fee was quoted for {v0} sent, before fees.",
                      {
                        v0: money(observed.sendAmountCents),
                      },
                    ),
                    true,
                  )}
              </View>
            )}
            {!!method && (
              <>
                <View style={styles.field}>
                  {text(t("Total earnings deducted (USD)"))}
                  {text(
                    t("Minimum withdrawal: {v0}", {
                      v0: money(overview?.policy.firstMinimumCents ?? 1500),
                    }),
                    true,
                  )}
                  <TextInput
                    accessibilityLabel={t("Total earnings deducted (USD)")}
                    value={amount}
                    editable={!busy && !api.pending}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    style={[styles.input, card, { color: c.foreground }]}
                  />
                  {text(
                    t("Maximum withdrawal: {v0}, including fees and taxes.", {
                      v0: money(overview?.policy.maxWithdrawalCents ?? 1500),
                    }),
                    true,
                  )}
                </View>
                <View style={[styles.card, card]}>
                  {text(t("Recipient contact details"))}
                  {field("Legal first name", "legalFirstName")}
                  {field("Legal last name", "legalLastName")}
                  {field("Second surname (optional)", "secondSurname")}
                  {field("Email address", "email", "email-address")}
                  {field(
                    "Phone number with country code",
                    "phone",
                    "phone-pad",
                  )}
                  {text(
                    t(
                      "Bank and delivery details are entered securely with Remitly.",
                    ),
                    true,
                  )}
                </View>
                <View style={[styles.card, card]}>
                  {text(
                    t("Total earnings deducted: {v0}", {
                      v0: cents === null ? "—" : money(cents),
                    }),
                  )}
                  {text(t("Amount sent: awaiting a current quote"))}
                  {text(t("Fee and tax: awaiting a current quote"))}
                  {text(
                    t(
                      "Your earnings are reserved when you request a withdrawal. You will review the exact quote before preparation.",
                    ),
                    true,
                  )}
                </View>
                {!!error && (
                  <Text
                    accessibilityRole="alert"
                    style={[localizedTextStyle(), { color: "#FF6075" }]}
                  >
                    {t(error)}
                  </Text>
                )}
                {!api.pending &&
                  button(
                    busy ? "Please wait…" : "Request withdrawal",
                    () => void submit(),
                    busy || !valid || !api.pendingReady,
                  )}
              </>
            )}
            {text(t("Withdrawal history"))}
            {overview?.withdrawals.length
              ? overview.withdrawals.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: "/withdrawal/[id]",
                        params: { id: w.id },
                      })
                    }
                    style={[styles.option, card]}
                  >
                    <View style={{ flex: 1 }}>
                      {text(money(w.grossCents))}
                      {text(t(withdrawalStatus(w.status)), true)}
                      {text(
                        new Date(w.createdAt).toLocaleDateString(appLocale()),
                        true,
                      )}
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={22}
                      color={c.foreground}
                    />
                  </TouchableOpacity>
                ))
              : text(t("No withdrawals yet."), true)}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  option: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  field: { gap: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 48,
    padding: 12,
    fontSize: 16,
  },
  button: {
    minHeight: 50,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
