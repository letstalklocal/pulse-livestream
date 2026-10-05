import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
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
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppLanguage } from "@/i18n";
import { useColors } from "@/hooks/useColors";
import { useWithdrawals, type PayoutRecipient } from "@/hooks/useWithdrawals";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { GoldCoinIcon } from "@/components/GoldCoinIcon";
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
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [coinAmount, setCoinAmount] = useState("6000");
  const [moreView, setMoreView] = useState<"menu" | "history" | null>(null);
  useEffect(() => {
    setProvider("");
    setCountry("");
    setMethod("");
    setAmount("15.00");
    setCoinAmount("6000");
    setStep(0);
    setRecipient(emptyRecipient);
    setError("");
    setBusy(false);
    setCountryMenuOpen(false);
    setMoreView(null);
  }, [api.userId]);
  useEffect(() => {
    const saved = api.overview.data?.recipient;
    if (saved)
      setRecipient({
        legalFirstName: saved.legalFirstName,
        legalLastName: saved.legalLastName,
        countryCode: saved.countryCode,
        email: saved.email,
        phone: saved.phone,
        ...(saved.secondSurname ? { secondSurname: saved.secondSurname } : {}),
      });
  }, [api.overview.data?.recipient]);
  useFocusEffect(
    useCallback(() => {
      if (api.userId) void api.refresh();
      return () => {
        setCountryMenuOpen(false);
        setMoreView(null);
      };
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
          setCoinAmount(String(api.pending.withdrawalCents * 4));
          setStep(3);
        }
  }, [api.pending, api.catalog.data]);
  const providers = api.catalog.data?.providers.filter((p) => p.enabled) ?? [];
  const provider = providers.find((p) => p.id === providerId);
  const isRemitly =
    !!provider &&
    (provider.id === "remitly" || /^remitly_[a-f0-9]{24}$/.test(provider.id));
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
  const overview = api.overview.data;
  const firstWithdrawal = !overview?.withdrawals.some(
    (w) => w.status === "delivered" || w.status === "returned",
  );
  const amountReadOnly = busy || !!api.pending || firstWithdrawal;
  const cents = usdCents(firstWithdrawal && !api.pending ? "15.00" : amount);
  const money = (value: number, compact = false) =>
    new Intl.NumberFormat(appLocale(), {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: compact ? 0 : 2,
      maximumFractionDigits: compact ? 0 : 2,
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
          legalFirstName: recipient.legalFirstName.trim(),
          legalLastName: recipient.legalLastName.trim(),
          ...(recipient.secondSurname?.trim()
            ? { secondSurname: recipient.secondSurname.trim() }
            : {}),
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
  const amountValid =
    !!overview?.enrolled &&
    !!overview?.policy.fundingPolicyReady &&
    cents !== null &&
    cents >= overview.policy.firstMinimumCents &&
    cents <= overview.policy.maxWithdrawalCents &&
    (!!api.pending || cents <= availableCents);
  const valid = amountValid && !!method;
  const remainingCoins =
    cents !== null && cents <= availableCents
      ? Number(overview?.balances.availableCoins ?? 0) - cents * 4
      : null;
  const remaining = () => (
    <View style={styles.amountLabel}>
      <GoldCoinIcon size={20} />
      {text(
        t("Remaining coins: {v0}", {
          v0:
            remainingCoins === null
              ? "—"
              : remainingCoins.toLocaleString(appLocale()),
        }),
      )}
    </View>
  );
  const next = () => {
    Keyboard.dismiss();
    setError("");
    setStep(step + 1);
  };
  const feeSample = (item: (typeof methods)[number]) =>
    item.observations
      .filter(
        (o) =>
          o.fundingMethod === "debit_card" &&
          o.senderCountry === "US" &&
          o.feeCents > 0,
      )
      .sort(
        (a, b) =>
          Math.abs(a.sendAmountCents - 1500) -
          Math.abs(b.sendAmountCents - 1500),
      )[0];
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
          style={styles.back}
          onPress={() => {
            Keyboard.dismiss();
            setCountryMenuOpen(false);
            if (step > 0 && !api.pending) setStep(step - 1);
            else router.back();
          }}
        >
          <Ionicons name="chevron-back" size={24} color={c.foreground} />
        </TouchableOpacity>
        <Text
          style={[localizedTextStyle(), styles.title, { color: c.foreground }]}
        >
          {t("Withdraw Money")}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("More")}
          accessibilityState={{
            expanded: moreView !== null,
            disabled: busy || !api.userId || !overview || api.overview.isError,
          }}
          disabled={busy || !api.userId || !overview || api.overview.isError}
          onPress={() => {
            Keyboard.dismiss();
            setCountryMenuOpen(false);
            setMoreView("menu");
          }}
          style={styles.back}
        >
          <Ionicons name="ellipsis-horizontal" size={24} color={c.foreground} />
        </TouchableOpacity>
      </View>
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        bottomOffset={32}
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
                {text(t("Available to withdraw"))}
                <View style={styles.balanceRow}>
                  <Text
                    style={[
                      localizedTextStyle(),
                      styles.balance,
                      { color: c.foreground },
                    ]}
                  >
                    {money(availableCents)}
                  </Text>
                  <View style={styles.balanceCoins}>
                    <GoldCoinIcon size={20} />
                    {text(
                      Number(overview.balances.availableCoins).toLocaleString(
                        appLocale(),
                      ),
                    )}
                  </View>
                </View>
                {Number(overview.balances.reservedTicks) > 0 &&
                  text(
                    t("Reserved: {v0} = {v1}", {
                      v0: Number(
                        overview.balances.reservedCoins,
                      ).toLocaleString(appLocale()),
                      v1: money(
                        Math.floor(Number(overview.balances.reservedTicks) / 4),
                      ),
                    }),
                    true,
                  )}
                {Number(overview.balances.heldTicks) > 0 &&
                  text(
                    t("On hold: {v0} = {v1}", {
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
            )}
            {overview && (
              <View style={styles.conversion}>
                {text(
                  t("Conversion: {v0} coins = {v1}", {
                    v0: (400).toLocaleString(appLocale()),
                    v1: money(100, true),
                  }),
                  true,
                )}
              </View>
            )}
            {step > 0 &&
              isRemitly &&
              text(
                t(
                  "After completing your request, you will receive a link to confirm your preferred payment method.",
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
            {step === 0 && !api.pending && (
              <>
                {text(t("How much would you like to withdraw?"))}
                <View style={styles.amountRow}>
                  <View style={styles.amountBox}>
                    <View style={styles.amountLabel}>
                      <GoldCoinIcon size={20} />
                      {text(t("Coins"))}
                    </View>
                    <TextInput
                      accessibilityLabel={t("Coins")}
                      value={firstWithdrawal ? "6000" : coinAmount}
                      editable={!amountReadOnly}
                      keyboardType="number-pad"
                      onChangeText={(value) => {
                        if (amountReadOnly) return;
                        setCoinAmount(value);
                        const coins = /^\d+$/.test(value) ? Number(value) : NaN;
                        setAmount(
                          Number.isSafeInteger(coins) && coins % 4 === 0
                            ? (coins / 400).toFixed(2)
                            : "",
                        );
                      }}
                      style={[styles.input, card, { color: c.foreground }]}
                    />
                  </View>
                  <View style={styles.amountBox}>
                    {text(t("Dollars (USD)"))}
                    <TextInput
                      accessibilityLabel={t("Dollars (USD)")}
                      value={firstWithdrawal ? "15.00" : amount}
                      editable={!amountReadOnly}
                      keyboardType="decimal-pad"
                      onChangeText={(value) => {
                        if (amountReadOnly) return;
                        setAmount(value);
                        const valueCents = usdCents(value);
                        setCoinAmount(
                          valueCents === null ? "" : String(valueCents * 4),
                        );
                      }}
                      style={[styles.input, card, { color: c.foreground }]}
                    />
                  </View>
                </View>
                {text(
                  t(
                    "Your first withdrawal must be {v0}. After your first withdrawal, the minimum is {v1}. Fees are deducted from the withdrawal amount based on the delivery method you select next.",
                    { v0: money(1500, true), v1: money(2500, true) },
                  ),
                  true,
                )}
                {remaining()}
                {button(
                  "Next",
                  next,
                  busy || !amountValid || !api.pendingReady,
                )}
                {!overview?.enrolled &&
                  text(t("Withdrawals have not been Enabled"), true)}
              </>
            )}
            {step === 1 && (
              <>
                {text(t("Provider"))}
                {options(providers, providerId, (id) => {
                  setProvider(id);
                  setCountry("");
                  setMethod("");
                })}
                {!!provider && (
                  <>
                    {text(t("Country"))}
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t("Select country")}
                      accessibilityState={{
                        disabled: busy || !!api.pending || !countries.length,
                        expanded: countryMenuOpen,
                      }}
                      disabled={busy || !!api.pending || !countries.length}
                      onPress={() => {
                        Keyboard.dismiss();
                        setCountryMenuOpen(true);
                      }}
                      style={[styles.option, card]}
                    >
                      {text(country?.name || t("Select country"))}
                      <Ionicons
                        name="chevron-down"
                        size={22}
                        color={c.foreground}
                      />
                    </TouchableOpacity>
                    {!countries.length &&
                      text(
                        t("No payout options are currently available."),
                        true,
                      )}
                  </>
                )}
                {button("Next", next, busy || !country || !amountValid)}
              </>
            )}
            {step === 2 && (
              <>
                {text(t("Payment method"))}
                {methods.map((item) => {
                  const sample = feeSample(item);
                  const delivery = sample?.deliveryEstimate;
                  const minutes = delivery?.match(/^(\d+) minutes?$/i);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      accessibilityRole="radio"
                      accessibilityState={{
                        selected: item.id === methodId,
                        disabled: busy || !!api.pending,
                      }}
                      disabled={busy || !!api.pending}
                      onPress={() => setMethod(item.id)}
                      style={[
                        styles.option,
                        card,
                        {
                          borderColor:
                            item.id === methodId ? c.primary : c.border,
                        },
                      ]}
                    >
                      <View style={styles.methodRow}>
                        <View style={styles.methodName}>{text(item.name)}</View>
                        <View style={styles.methodInfo}>
                          {text(
                            t("Fee: {v0}", {
                              v0: sample ? money(sample.feeCents) : "—",
                            }),
                            true,
                          )}
                        </View>
                        <View style={styles.methodInfo}>
                          {text(
                            t("Delivery: {v0}", {
                              v0: minutes
                                ? t("{v0} mins", { v0: minutes[1] })
                                : delivery || "—",
                            }),
                            true,
                          )}
                        </View>
                      </View>
                      <Ionicons
                        name={
                          item.id === methodId
                            ? "radio-button-on"
                            : "radio-button-off"
                        }
                        size={22}
                        color={c.primary}
                      />
                    </TouchableOpacity>
                  );
                })}
                {button("Next", next, busy || !method || !amountValid)}
              </>
            )}
            {(step === 3 || !!api.pending) && !!method && (
              <>
                <View style={[styles.card, card]}>
                  {text(t("Your contact details"))}
                  {field("Legal first name", "legalFirstName")}
                  {field("Legal last name", "legalLastName")}
                  {field("Second surname (optional)", "secondSurname")}
                  {field("Email address", "email", "email-address")}
                  {field(
                    "Phone number with country code",
                    "phone",
                    "phone-pad",
                  )}
                  {isRemitly &&
                    text(
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
                  {!api.pending && remaining()}
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
          </>
        )}
      </KeyboardAwareScrollViewCompat>
      {countryMenuOpen &&
        !!api.userId &&
        !!provider &&
        !busy &&
        !api.pending && (
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={() => setCountryMenuOpen(false)}
          >
            <View
              style={[
                styles.menuOverlay,
                {
                  paddingTop: insets.top + 24,
                  paddingBottom: insets.bottom + 24,
                },
              ]}
            >
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t("Close")}
                onPress={() => setCountryMenuOpen(false)}
                style={styles.menuBackdrop}
              />
              <View accessibilityViewIsModal style={[styles.menuPanel, card]}>
                <View style={styles.menuHeader}>
                  <Text
                    accessibilityRole="header"
                    style={[
                      localizedTextStyle(),
                      styles.menuTitle,
                      { color: c.foreground },
                    ]}
                  >
                    {t("Select country")}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={t("Close")}
                    onPress={() => setCountryMenuOpen(false)}
                    style={styles.back}
                  >
                    <Ionicons name="close" size={24} color={c.foreground} />
                  </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={styles.menuOptions}>
                  {options(countries, countryId, (id) => {
                    setCountry(id);
                    setMethod("");
                    setCountryMenuOpen(false);
                  })}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}
      {moreView && !!api.userId && !!overview && !api.overview.isError && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setMoreView(null)}
        >
          <View
            style={[
              styles.menuOverlay,
              moreView === "menu" && styles.moreOverlay,
              {
                paddingTop: insets.top + (moreView === "menu" ? 60 : 24),
                paddingBottom: insets.bottom + 24,
              },
            ]}
          >
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("Close")}
              onPress={() => setMoreView(null)}
              style={styles.menuBackdrop}
            />
            <View
              accessibilityViewIsModal
              style={[
                styles.menuPanel,
                card,
                moreView === "menu" && styles.morePanel,
              ]}
            >
              {moreView === "menu" ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => setMoreView("history")}
                  style={styles.moreItem}
                >
                  {text(t("Withdrawal history"))}
                </TouchableOpacity>
              ) : (
                <>
                  <View style={styles.menuHeader}>
                    <Text
                      accessibilityRole="header"
                      style={[
                        localizedTextStyle(),
                        styles.menuTitle,
                        { color: c.foreground },
                      ]}
                    >
                      {t("Withdrawal history")}
                    </Text>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t("Close")}
                      onPress={() => setMoreView(null)}
                      style={styles.back}
                    >
                      <Ionicons name="close" size={24} color={c.foreground} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView contentContainerStyle={styles.menuOptions}>
                    {overview?.withdrawals.length
                      ? overview.withdrawals.map((w) => (
                          <TouchableOpacity
                            key={w.id}
                            accessibilityRole="button"
                            onPress={() => {
                              setMoreView(null);
                              router.push({
                                pathname: "/withdrawal/[id]",
                                params: { id: w.id },
                              });
                            }}
                            style={[styles.option, card]}
                          >
                            <View style={{ flex: 1 }}>
                              {text(money(w.grossCents))}
                              {text(t(withdrawalStatus(w.status)), true)}
                              {text(
                                new Date(w.createdAt).toLocaleDateString(
                                  appLocale(),
                                ),
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
                  </ScrollView>
                </>
              )}
            </View>
          </View>
        </Modal>
      )}
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
  amountRow: { flexDirection: "row", gap: 12 },
  amountBox: { flex: 1, gap: 8 },
  amountLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  methodRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  methodName: { flex: 1.2 },
  methodInfo: { flex: 1 },
  content: { padding: 20, gap: 14 },
  conversion: { paddingHorizontal: 16 },
  text: { fontSize: 15, lineHeight: 23 },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  balanceCoins: { flexDirection: "row", alignItems: "center", gap: 6 },
  balance: { fontSize: 36, lineHeight: 44, fontFamily: "Inter_600SemiBold" },
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
  moreOverlay: { justifyContent: "flex-start", alignItems: "flex-end" },
  morePanel: { minWidth: 220 },
  moreItem: { minHeight: 52, padding: 16, justifyContent: "center" },
  menuOverlay: { flex: 1, justifyContent: "center", paddingHorizontal: 20 },
  menuBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  menuPanel: {
    borderRadius: 16,
    borderWidth: 1,
    maxHeight: "75%",
    overflow: "hidden",
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 8,
  },
  menuTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_600SemiBold" },
  menuOptions: { padding: 12, gap: 8 },
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
