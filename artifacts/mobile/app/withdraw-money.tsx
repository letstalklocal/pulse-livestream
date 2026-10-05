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
  useWindowDimensions,
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
import {
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";
const emptyRecipient: PayoutRecipient = {
  legalFirstName: "",
  legalLastName: "",
  secondSurname: "",
  countryCode: "",
  email: "",
  phone: "",
};
const normalizedPhone = (phone: string) =>
  phone.trim().replace(/[\s().-]/g, "");
const validContact = (
  contact?: Pick<
    PayoutRecipient,
    "legalFirstName" | "legalLastName" | "email" | "phone"
  > | null,
) =>
  !!contact?.legalFirstName.trim() &&
  !!contact?.legalLastName.trim() &&
  /^\+\d{8,15}$/.test(normalizedPhone(contact?.phone ?? "")) &&
  /^\S+@\S+\.\S+$/.test(contact?.email.trim() ?? "");
export default function WithdrawMoneyScreen() {
  const { t, localizedTextStyle, appLocale } = useAppLanguage();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const countryListRef = useRef<ScrollView>(null);
  const countryMenuHeight = Math.min(
    windowHeight * 0.75,
    Math.max(0, windowHeight - insets.top - insets.bottom - 48),
  );
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
  const [usingSavedMethod, setUsingSavedMethod] = useState(false);
  const [phonePrefix, setPhonePrefix] = useState("");
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
    setUsingSavedMethod(false);
    setPhonePrefix("");
  }, [api.userId]);
  useEffect(() => {
    const saved = api.overview.data?.recipient;
    if (saved) {
      setPhonePrefix(
        parsePhoneNumberFromString(saved.phone)?.countryCallingCode
          ? `+${parsePhoneNumberFromString(saved.phone)!.countryCallingCode}`
          : "",
      );
      setRecipient({
        legalFirstName: saved.legalFirstName,
        legalLastName: saved.legalLastName,
        countryCode: saved.countryCode,
        email: saved.email,
        phone: saved.phone,
        ...(saved.secondSurname ? { secondSurname: saved.secondSurname } : {}),
      });
    }
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
          setStep(4);
        }
  }, [api.pending, api.catalog.data]);
  const providers = api.catalog.data?.providers.filter((p) => p.enabled) ?? [];
  const selectedProviderId =
    providers.length === 1 ? providers[0].id : providerId;
  const provider = providers.find((p) => p.id === selectedProviderId);
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
  useEffect(() => {
    if (!firstWithdrawal && !api.pending && amount === "15.00") {
      setAmount("25.00");
      setCoinAmount("10000");
    }
  }, [firstWithdrawal, api.pending]);
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
    showSelectionIcon = true,
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
          {
            borderColor: item.id === selected ? c.primary : c.border,
            backgroundColor:
              !showSelectionIcon && item.id === selected ? c.secondary : c.card,
          },
        ]}
      >
        {text(item.name)}
        {showSelectionIcon && (
          <Ionicons
            name={item.id === selected ? "radio-button-on" : "radio-button-off"}
            size={22}
            color={c.primary}
          />
        )}
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
  const dialingCountry = country?.countryCode as CountryCode | undefined;
  const callingCode =
    phonePrefix ||
    (dialingCountry && isSupportedCountry(dialingCountry)
      ? `+${getCountryCallingCode(dialingCountry)}`
      : "+");
  const fullPhone = normalizedPhone(recipient.phone);
  const nationalPhone = fullPhone.startsWith(callingCode)
    ? fullPhone.slice(callingCode.length)
    : fullPhone.replace(/^\+/, "");
  const recipientValid = validContact(recipient);
  const savedRoute = (() => {
    const saved = overview?.recipient;
    if (firstWithdrawal || !validContact(saved)) return null;
    for (const withdrawal of overview?.withdrawals ?? []) {
      if (
        !["delivered", "returned"].includes(withdrawal.status) ||
        withdrawal.providerOnboardingStatus !== "ready"
      )
        continue;
      if (
        [
          "legalFirstName",
          "legalLastName",
          "secondSurname",
          "email",
          "phone",
          "countryCode",
        ].some(
          (key) =>
            (
              (
                withdrawal.recipient as unknown as
                  | Record<string, string>
                  | undefined
              )?.[key] ?? ""
            ).trim() !==
            ((saved as unknown as Record<string, string>)[key] ?? "").trim(),
        )
      )
        continue;
      for (const p of providers)
        for (const co of p.countries) {
          if (
            !co.enabled ||
            co.availability !== "available" ||
            co.countryCode !== saved?.countryCode
          )
            continue;
          const m = co.methods.find(
            (item) =>
              item.id === withdrawal.methodId &&
              item.enabled &&
              item.availability === "available",
          );
          if (m)
            return { provider: p, country: co, method: m, recipient: saved! };
        }
    }
    return null;
  })();
  const reviewRow = (label: string, value: string) => (
    <View style={styles.reviewRow}>
      <View style={{ flexShrink: 0, maxWidth: "45%" }}>
        {text(t(label), true)}
      </View>
      <View style={{ flex: 1, minWidth: 0, alignItems: "flex-end" }}>
        {label === "Email address" ? (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            style={[
              localizedTextStyle(),
              styles.text,
              { color: c.foreground, width: "100%", textAlign: "right" },
            ]}
          >
            {value}
          </Text>
        ) : (
          text(value)
        )}
      </View>
    </View>
  );
  const submit = async () => {
    if (
      busy ||
      (!api.pending &&
        (step !== 4 || !valid || !method || !country || cents === null))
    )
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
      if (!recipientValid)
        throw new Error(
          "Enter your legal name, email and phone number with country code.",
        );
      if (!api.pending && !usingSavedMethod)
        await api.saveRecipient({
          legalFirstName: recipient.legalFirstName.trim(),
          legalLastName: recipient.legalLastName.trim(),
          ...(recipient.secondSurname?.trim()
            ? { secondSurname: recipient.secondSurname.trim() }
            : {}),
          email: recipient.email.trim(),
          phone: normalizedPhone(recipient.phone),
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
    cents >= (firstWithdrawal ? overview.policy.firstMinimumCents : 2500) &&
    cents <= (firstWithdrawal ? 1500 : overview.policy.maxWithdrawalCents) &&
    (!!api.pending || cents <= availableCents);
  const valid = amountValid && !!method;
  const remainingCoins = api.pending
    ? Number(overview?.balances.availableCoins ?? 0)
    : cents !== null && cents <= availableCents
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
    if (step === 3 && !recipientValid) {
      setError(
        "Enter your legal name, email and phone number with country code.",
      );
      return;
    }
    setError("");
    if (step === 0 && savedRoute) {
      setProvider(savedRoute.provider.id);
      setCountry(savedRoute.country.id);
      setMethod(savedRoute.method.id);
      const saved = savedRoute.recipient;
      setRecipient({
        legalFirstName: saved.legalFirstName,
        legalLastName: saved.legalLastName,
        secondSurname: saved.secondSurname ?? "",
        countryCode: saved.countryCode,
        email: saved.email,
        phone: saved.phone,
      });
      setUsingSavedMethod(true);
      setStep(4);
      return;
    }
    if (step === 0) setUsingSavedMethod(false);
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
  const methodFee = (item: (typeof methods)[number]) =>
    item.defaultFeeCents ?? feeSample(item)?.feeCents ?? null;
  const estimatedFee = method ? methodFee(method) : null;
  const estimatedDeposit =
    cents !== null && estimatedFee !== null && estimatedFee <= cents
      ? cents - estimatedFee
      : null;
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
            if (step === 4 && usingSavedMethod && !api.pending) setStep(0);
            else if (step > 0 && !api.pending) setStep(step - 1);
            else router.back();
          }}
        >
          <Ionicons name="chevron-back" size={24} color={c.foreground} />
        </TouchableOpacity>
        <Text
          style={[localizedTextStyle(), styles.title, { color: c.foreground }]}
        >
          {t(
            step === 1
              ? "Select Provider and Country"
              : step === 4
                ? "Review withdrawal"
                : "Withdraw Money",
          )}
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
        key={step}
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
            {step === 0 && !api.pending && overview && (
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
            {step === 0 && !api.pending && overview && (
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
            {!!api.pending &&
              !method &&
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
                {providers.length === 1 ? (
                  <View style={styles.amountLabel}>
                    {text(`${t("Provider")}:`, true)}
                    {text(providers[0].name)}
                  </View>
                ) : (
                  <>
                    {text(t("Provider"))}
                    {options(
                      providers,
                      providerId,
                      (id) => {
                        setProvider(id);
                        setCountry("");
                        setMethod("");
                      },
                      false,
                    )}
                  </>
                )}
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
                {text(t("Select payment method"))}
                <View style={styles.methodsTable}>
                  <View style={[styles.methodRow, styles.methodHeader]}>
                    <View style={styles.methodName}>
                      {text(t("Method"), true)}
                    </View>
                    <View style={styles.methodFee}>{text(t("Fee"), true)}</View>
                    <View style={styles.methodDelivery}>
                      {text(t("Delivery"), true)}
                    </View>
                  </View>
                  {methods.map((item) => {
                    const sample = feeSample(item);
                    const delivery =
                      sample?.deliveryEstimate ||
                      item.observations.find(
                        (o) =>
                          o.fundingMethod === "debit_card" &&
                          o.senderCountry === "US" &&
                          o.deliveryEstimate,
                      )?.deliveryEstimate;
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
                            backgroundColor:
                              item.id === methodId ? c.secondary : c.card,
                          },
                        ]}
                      >
                        <View style={styles.methodRow}>
                          <View style={styles.methodName}>
                            {text(item.name)}
                          </View>
                          <View style={styles.methodFee}>
                            {text(
                              methodFee(item) === null
                                ? "—"
                                : money(methodFee(item)!),
                              true,
                            )}
                          </View>
                          <View style={styles.methodDelivery}>
                            {text(
                              minutes
                                ? t("{v0} mins", { v0: minutes[1] })
                                : delivery || "—",
                              true,
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {button("Next", next, busy || !method || !amountValid)}
              </>
            )}
            {step === 3 && !api.pending && !!method && (
              <>
                <View style={[styles.card, card]}>
                  {text(t("Your contact details"))}
                  {isRemitly &&
                    text(
                      t(
                        "After completing your request, you will receive a link to confirm your preferred payment method.",
                      ),
                    )}
                  {field("Legal first name", "legalFirstName")}
                  {field("Legal last name", "legalLastName")}
                  {field("Second surname (optional)", "secondSurname")}
                  {field("Email address", "email", "email-address")}
                  <View style={styles.amountRow}>
                    <View style={{ width: 100 }}>
                      {text(t("Country code"), true)}
                      <TextInput
                        accessibilityLabel={t("Country code")}
                        keyboardType="phone-pad"
                        editable={!busy}
                        value={callingCode}
                        onChangeText={(value) => {
                          const prefix = `+${value.replace(/\D/g, "")}`;
                          setPhonePrefix(prefix);
                          setRecipient((previous) => ({
                            ...previous,
                            phone: `${prefix}${nationalPhone}`,
                          }));
                        }}
                        style={[
                          localizedTextStyle(),
                          styles.input,
                          card,
                          { color: c.foreground },
                        ]}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      {text(t("Phone number"), true)}
                      <TextInput
                        accessibilityLabel={t("Phone number")}
                        keyboardType="phone-pad"
                        editable={!busy}
                        value={nationalPhone}
                        onChangeText={(value) => {
                          const entered = normalizedPhone(value);
                          const parsed = entered.startsWith("+")
                            ? parsePhoneNumberFromString(entered)
                            : undefined;
                          if (parsed)
                            setPhonePrefix(`+${parsed.countryCallingCode}`);
                          setRecipient((previous) => ({
                            ...previous,
                            phone: entered.startsWith("+")
                              ? entered
                              : `${callingCode}${entered}`,
                          }));
                        }}
                        style={[
                          localizedTextStyle(),
                          styles.input,
                          card,
                          { color: c.foreground },
                        ]}
                      />
                    </View>
                  </View>
                  {isRemitly &&
                    text(
                      t(
                        "Bank and delivery details are entered securely with Remitly.",
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
                {button("Next", next, busy)}
              </>
            )}
            {(step === 4 || !!api.pending) && !!method && (
              <>
                <View style={[styles.card, card]}>
                  {text(t("Contact"))}
                  {reviewRow(
                    "Recipient",
                    [
                      recipient.legalFirstName,
                      recipient.legalLastName,
                      recipient.secondSurname,
                    ]
                      .filter(Boolean)
                      .map((value) => value!.trim())
                      .join(" "),
                  )}
                  {reviewRow("Email address", recipient.email.trim())}
                  {reviewRow("Phone number", normalizedPhone(recipient.phone))}
                </View>
                <View style={[styles.card, card]}>
                  {text(t("Withdrawal details"))}
                  {reviewRow(
                    "Total earnings to withdraw",
                    cents === null ? "—" : money(cents),
                  )}
                  {reviewRow(
                    "Fee deduction",
                    estimatedFee === null ? "—" : money(-estimatedFee),
                  )}
                  {reviewRow(
                    "Estimated deposit",
                    estimatedDeposit === null ? "—" : money(estimatedDeposit),
                  )}
                  {reviewRow("Selected method", method.name)}
                  <View style={styles.reviewRow}>
                    <View style={{ flex: 1 }}>
                      {text(t("Remaining coins"), true)}
                    </View>
                    <View style={styles.amountLabel}>
                      <GoldCoinIcon size={16} />
                      {text(
                        remainingCoins === null
                          ? "—"
                          : remainingCoins.toLocaleString(appLocale()),
                      )}
                    </View>
                  </View>
                </View>
                {text(
                  t(
                    "These amounts are estimates based on your selected delivery method.",
                  ),
                  true,
                )}
                {usingSavedMethod
                  ? text(t("Your saved payment method will be used."))
                  : isRemitly &&
                    text(
                      t(
                        "You will receive an email from Remitly to confirm your payment method.",
                      ),
                    )}
                {!!error && (
                  <Text
                    accessibilityRole="alert"
                    style={[localizedTextStyle(), { color: "#FF6075" }]}
                  >
                    {t(error)}
                  </Text>
                )}
                {button(
                  busy ? "Please wait…" : "Request withdrawal",
                  () => void submit(),
                  busy ||
                    !valid ||
                    !api.pendingReady ||
                    (!api.pending && !recipientValid),
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
            onShow={() => countryListRef.current?.flashScrollIndicators?.()}
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
              <View
                accessibilityViewIsModal
                style={[
                  styles.menuPanel,
                  card,
                  { height: countryMenuHeight, maxHeight: countryMenuHeight },
                ]}
              >
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
                <ScrollView
                  ref={countryListRef}
                  style={styles.countryList}
                  showsVerticalScrollIndicator
                  persistentScrollbar
                  indicatorStyle="white"
                  contentContainerStyle={styles.menuOptions}
                >
                  {options(countries, countryId, (id) => {
                    setCountry(id);
                    setPhonePrefix("");
                    if (id !== countryId)
                      setRecipient((previous) => ({ ...previous, phone: "" }));
                    setMethod("");
                    setCountryMenuOpen(false);
                  })}
                </ScrollView>
                <View
                  style={[styles.countryMenuFooter, { borderColor: c.border }]}
                >
                  <Text
                    style={[
                      localizedTextStyle(),
                      styles.menuHint,
                      { color: c.mutedForeground },
                    ]}
                  >
                    {t("Scroll to see all countries")}
                  </Text>
                </View>
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
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  amountRow: { flexDirection: "row", gap: 12 },
  amountBox: { flex: 1, gap: 8 },
  amountLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  methodRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  methodsTable: { gap: 8 },
  methodHeader: { flex: 0, paddingHorizontal: 17, paddingBottom: 4 },
  methodName: { flex: 1.4 },
  methodFee: { flex: 0.8 },
  methodDelivery: { flex: 1 },
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
  countryList: { flex: 1, minHeight: 0 },
  countryMenuFooter: {
    flexShrink: 0,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  menuHint: { fontSize: 13, lineHeight: 18 },
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
