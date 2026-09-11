import { t, useAppLanguage, localizedTextStyle, appLocale } from "@/i18n";
import { accountBalance } from "@/utils/accountBalance";
import {
  getGetCoinBalanceQueryKey,
  useGetCoinBalance,
} from "@workspace/api-client-react";
import { useAuth as usePulseAuth } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, useReverification, useSession, useUser } from "@clerk/expo";
import type { EmailAddressResource } from "@clerk/expo/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

type Page = "account" | "email" | "password" | "delete" | "connected";
type Verification = {
  complete: () => void;
  cancel: () => void;
  level: "first_factor" | "second_factor" | "multi_factor" | undefined;
};
const errorMessage = (error: unknown) =>
  (error as { errors?: { longMessage?: string; message?: string }[] })
    ?.errors?.[0]?.longMessage ??
  (error as { errors?: { message?: string }[] })?.errors?.[0]?.message ??
  (error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.");
const base = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

export default function AccountScreen() {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { session } = useSession();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { user: pulseUser } = usePulseAuth();
  const coins = useGetCoinBalance(
    { uid: pulseUser?.uid ?? 0 },
    {
      query: {
        queryKey: getGetCoinBalanceQueryKey({ uid: pulseUser?.uid ?? 0 }),
        enabled: !!pulseUser?.uid,
        refetchInterval: 8_000,
      },
    },
  );
  const [page, setPage] = useState<Page>("account");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState<EmailAddressResource | null>(
    null,
  );
  const [code, setCode] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [verification, setVerification] = useState<Verification | null>(null);
  const verificationRef = useRef<Verification | null>(null);
  const [verifyMethod, setVerifyMethod] = useState<
    "password" | "email_code" | "totp" | "phone_code" | null
  >(null);
  const [verifyValue, setVerifyValue] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyLabel, setVerifyLabel] = useState("");
  const [secondFactor, setSecondFactor] = useState(false);

  const deletion = useQuery({
    queryKey: ["account-deletion-request", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(`${base}/api/account/deletion-request`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok)
        throw new Error(
          "Couldn't load your deletion request status. Please try again shortly.",
        );
      return (await response.json()) as {
        balance: number;
        request: { id: number; status: string; requestedAt: string } | null;
      };
    },
  });
  const displayedBalance = accountBalance(coins, deletion);
  const refreshAccount = async () => {
    await Promise.allSettled([
      deletion.refetch(),
      ...(pulseUser ? [coins.refetch()] : []),
    ]);
  };
  useEffect(
    () => () => {
      verificationRef.current?.cancel();
    },
    [],
  );

  const prepareVerification = async (request: Verification) => {
    verificationRef.current = request;
    setVerification(request);
    setVerifyError("");
    setVerifyValue("");
    setVerifyLabel("");
    setVerifyMethod(null);
    setVerifyBusy(true);
    try {
      if (!session) throw new Error("Please sign in again.");
      const result = await session.startVerification({
        level: request.level ?? "first_factor",
      });
      if (verificationRef.current !== request) return;
      if (result.status === "complete") {
        verificationRef.current = null;
        setVerification(null);
        request.complete();
        return;
      }
      if (result.status === "needs_second_factor") {
        await prepareSecondFactor(result);
        return;
      }
      setSecondFactor(false);
      const emailFactor = result.supportedFirstFactors?.find(
        (f) => f.strategy === "email_code",
      );
      const passwordFactor = result.supportedFirstFactors?.find(
        (f) => f.strategy === "password",
      );
      if (passwordFactor) {
        setVerifyMethod("password");
        setVerifyLabel("Enter your current password to continue.");
      } else if (emailFactor?.strategy === "email_code") {
        await session.prepareFirstFactorVerification({
          strategy: "email_code",
          emailAddressId: emailFactor.emailAddressId,
        });
        setVerifyMethod("email_code");
        setVerifyLabel(`Enter the code sent to ${emailFactor.safeIdentifier}.`);
      } else
        throw new Error(
          "Please log out and sign in again to verify your identity.",
        );
    } catch (e) {
      setVerifyError(errorMessage(e));
    } finally {
      setVerifyBusy(false);
    }
  };
  const prepareSecondFactor = async (
    result: Awaited<
      ReturnType<NonNullable<typeof session>["startVerification"]>
    >,
  ) => {
    setSecondFactor(true);
    setVerifyValue("");
    const totp = result.supportedSecondFactors?.find(
      (f) => f.strategy === "totp",
    );
    const phone = result.supportedSecondFactors?.find(
      (f) => f.strategy === "phone_code",
    );
    if (totp) {
      setVerifyMethod("totp");
      setVerifyLabel("Enter a code from your authenticator app.");
    } else if (phone?.strategy === "phone_code") {
      await session!.prepareSecondFactorVerification({
        strategy: "phone_code",
        phoneNumberId: phone.phoneNumberId,
      });
      setVerifyMethod("phone_code");
      setVerifyLabel(`Enter the code sent to ${phone.safeIdentifier}.`);
    } else
      throw new Error(
        "Please log out and sign in again using your second factor.",
      );
  };
  const reverifyOptions = {
    onNeedsReverification: (request: Verification) => {
      void prepareVerification(request);
    },
  };
  const createEmail = useReverification(
    (emailAddress: string) => user!.createEmailAddress({ email: emailAddress }),
    reverifyOptions,
  );
  const makePrimary = useReverification(
    (id: string) => user!.update({ primaryEmailAddressId: id }),
    reverifyOptions,
  );
  const updatePassword = useReverification(
    () =>
      user!.updatePassword({
        currentPassword: user!.passwordEnabled ? currentPassword : undefined,
        newPassword: password,
        signOutOfOtherSessions: true,
      }),
    reverifyOptions,
  );

  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const open = (next: Page) => {
    setError("");
    setNotice("");
    setCode("");
    setCurrentPassword("");
    setPassword("");
    setConfirmPassword("");
    setPage(next);
    if (next === "delete") {
      void deletion.refetch();
      if (pulseUser) void coins.refetch();
    }
  };
  const finish = (message: string) => {
    open("account");
    setNotice(message);
  };
  const startEmail = async () => {
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
      throw new Error("Enter a valid email address.");
    if (
      address.toLowerCase() ===
      user!.primaryEmailAddress?.emailAddress.toLowerCase()
    )
      throw new Error("This is already your primary email address.");
    const resource =
      user!.emailAddresses.find(
        (e) => e.emailAddress.toLowerCase() === address.toLowerCase(),
      ) ?? (await createEmail(address));
    if (!resource) return;
    setPendingEmail(resource);
    if (resource.verification.status === "verified") {
      await makePrimary(resource.id);
      setPendingEmail(null);
      finish("Primary email address updated.");
      return;
    }
    await resource.prepareVerification({ strategy: "email_code" });
    setNotice(`We sent a verification code to ${resource.emailAddress}.`);
  };
  const saveEmail = async () => {
    if (!pendingEmail) return;
    const result =
      pendingEmail.verification.status === "verified"
        ? pendingEmail
        : await pendingEmail.attemptVerification({ code: code.trim() });
    if (result.verification.status !== "verified")
      throw new Error("Verify your email before continuing.");
    await makePrimary(result.id);
    setPendingEmail(null);
    setEmail("");
    finish(
      "Primary email address updated. Your previous email remains available for sign-in.",
    );
  };
  const savePassword = async () => {
    if (password !== confirmPassword)
      throw new Error("The new passwords don't match.");
    await updatePassword();
    finish("Password updated. Your other sessions have been signed out.");
  };
  const submitDeletion = async () => {
    const token = await getToken();
    const response = await fetch(`${base}/api/account/deletion-request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ confirmation, reason }),
    });
    const result = await response.json().catch(() => ({
      error:
        "Couldn't submit your request right now. Please try again shortly.",
    }));
    if (!response.ok)
      throw new Error(result.error ?? "Couldn't submit your request.");
    queryClient.setQueryData(["account-deletion-request", user?.id], {
      ...deletion.data,
      request: result.request,
    });
    setNotice("Request sent. Your account stays active while we review it.");
    setReason("");
    setConfirmation("");
    await deletion.refetch();
  };
  const cancelDeletion = async () => {
    const token = await getToken();
    const response = await fetch(`${base}/api/account/deletion-request`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok)
      throw new Error("Couldn't cancel your request. Please try again.");
    queryClient.setQueryData(["account-deletion-request", user?.id], {
      ...deletion.data,
      request: null,
    });
    await deletion.refetch();
    setNotice("Your removal request has been cancelled.");
  };

  if (!isLoaded)
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  if (!user) return <Redirect href="/(auth)/sign-in" />;
  const title = {
    account: "Account",
    email: "Email address",
    password: "Password",
    delete: "Delete account",
    connected: "Connected accounts",
  }[page];
  const button = (
    label: string,
    action: () => Promise<void>,
    disabled = false,
    danger = false,
  ) => (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={busy || disabled}
      onPress={() => {
        void run(action);
      }}
      style={[
        styles.button,
        {
          backgroundColor: danger ? "#D92D4B" : colors.primary,
          opacity: busy || disabled ? 0.45 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color="#FFF" />
      ) : (
        <Text style={[localizedTextStyle(), styles.buttonText]}>{t(label)}</Text>
      )}
    </TouchableOpacity>
  );
  const field = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    secure = false,
    emailInput = false,
  ) => (
    <View style={styles.field}>
      <Text style={[localizedTextStyle(), [styles.label, { color: colors.foreground }]]}>{t(label)}</Text>
      <TextInput
        accessibilityLabel={t(label)}
        value={value}
        onChangeText={onChangeText}
        editable={!busy}
        secureTextEntry={secure}
        keyboardType={emailInput ? "email-address" : "default"}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.input,
          {
            color: colors.foreground,
            borderColor: colors.border,
            backgroundColor: colors.card,
          },
        ]}
      />
    </View>
  );
  const row = (
    label: string,
    subtitle: string,
    icon: React.ComponentProps<typeof Ionicons>["name"],
    target: Page,
    danger = false,
  ) => (
    <TouchableOpacity
      accessibilityRole="button"
      style={[
        styles.row,
        { borderColor: colors.border, backgroundColor: colors.card },
      ]}
      onPress={() => open(target)}
    >
      <View style={[styles.icon, { backgroundColor: colors.background }]}>
        <Ionicons
          name={icon}
          size={20}
          color={danger ? "#FF4D67" : colors.primary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[localizedTextStyle(), [
            styles.label,
            { color: danger ? "#FF4D67" : colors.foreground },
          ]]}
        >
          {t(label)}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {subtitle}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={colors.mutedForeground}
      />
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 10,
            borderColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          accessibilityLabel={t("Back")}
          disabled={busy}
          style={[
            styles.back,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
          onPress={() => (page === "account" ? router.back() : open("account"))}
        >
          <Ionicons name="chevron-back" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[localizedTextStyle(), [styles.title, { color: colors.foreground }]]}>
          {t(title)}
        </Text>
        <View style={{ width: 38 }} />
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 32 },
        ]}
      >
        {!!error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {t(error)}
          </Text>
        )}
        {!!notice && (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.description, { color: colors.primary }]}
          >
            {t(notice)}
          </Text>
        )}
        <>
          {page === "account" && (
            <>
              <Text
                style={[localizedTextStyle(), [styles.description, { color: colors.mutedForeground }]]}
              >{t("Manage your sign-in details and account.")}</Text>
              <View style={{ gap: 12 }}>
                {row(
                  "Email address",
                  user!.primaryEmailAddress?.emailAddress ??
                    t("Add an email address"),
                  "mail-outline",
                  "email",
                )}
                {row(
                  "Password",
                  user!.passwordEnabled
                    ? t("Change your password")
                    : t("Set a password"),
                  "lock-closed-outline",
                  "password",
                )}
                {!!user!.externalAccounts.length &&
                  row(
                    "Connected accounts",
                    user!.externalAccounts
                      .map((a) => a.provider.replace(/^oauth_/, ""))
                      .join(", "),
                    "link-outline",
                    "connected",
                  )}
              </View>
              <View
                style={[styles.dangerSection, { borderColor: colors.border }]}
              >
                {row(
                  "Delete account",
                  deletion.data?.request?.status === "pending"
                    ? t("Removal request pending review")
                    : t("Request removal for manual review"),
                  "trash-outline",
                  "delete",
                  true,
                )}
              </View>
            </>
          )}
          {page === "email" && (
            <>
              <Text
                style={[localizedTextStyle(), [styles.description, { color: colors.mutedForeground }]]}
              >{t("Current email:{v0}{v1}. Verify your new email before making it primary. Your previous email will still work for sign-in.", { v0: " ", v1: user!.primaryEmailAddress?.emailAddress ?? "None" })}</Text>
              {pendingEmail ? (
                <>
                  <Text
                    style={[styles.description, { color: colors.foreground }]}
                  >
                    {pendingEmail.emailAddress}
                  </Text>
                  {field("Verification code", code, setCode)}
                  {button("Verify and save", saveEmail, !code.trim())}
                  {button("Resend code", async () => {
                    await pendingEmail.prepareVerification({
                      strategy: "email_code",
                    });
                    setNotice("A new code has been sent.");
                  })}
                  <TouchableOpacity
                    disabled={busy}
                    onPress={() => {
                      setPendingEmail(null);
                      setCode("");
                      setNotice("");
                    }}
                  >
                    <Text style={[localizedTextStyle(), [styles.link, { color: colors.primary }]]}>{t("Use a different email")}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {field("New email address", email, setEmail, false, true)}
                  {button("Continue", startEmail, !email.trim())}
                </>
              )}
            </>
          )}
          {page === "password" && (
            <>
              <Text
                style={[localizedTextStyle(), [styles.description, { color: colors.mutedForeground }]]}
              >{t("Choose a strong password. Changing it will sign you out of other devices.")}</Text>
              {user!.passwordEnabled &&
                field(
                  "Current password",
                  currentPassword,
                  setCurrentPassword,
                  true,
                )}
              {field("New password", password, setPassword, true)}
              {field(
                "Confirm new password",
                confirmPassword,
                setConfirmPassword,
                true,
              )}
              {button(
                "Save password",
                savePassword,
                !password ||
                  !confirmPassword ||
                  (!!user!.passwordEnabled && !currentPassword),
              )}
            </>
          )}
          {page === "connected" && (
            <>
              <Text
                style={[localizedTextStyle(), [styles.description, { color: colors.mutedForeground }]]}
              >{t("These accounts are connected to your Pulse sign-in.")}</Text>
              {user!.externalAccounts.map((account) => (
                <View
                  key={account.id}
                  style={[
                    styles.row,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.label,
                        {
                          color: colors.foreground,
                          textTransform: "capitalize",
                        },
                      ]}
                    >
                      {account.provider.replace(/^oauth_/, "")}
                    </Text>
                    <Text
                      style={[
                        styles.subtitle,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {account.emailAddress}
                    </Text>
                  </View>
                  <Text style={[localizedTextStyle(), { color: colors.primary }]}>{t("Connected")}</Text>
                </View>
              ))}
            </>
          )}
          {page === "delete" && (
            <>
              <Text
                style={[localizedTextStyle(), [
                  styles.title,
                  { color: colors.foreground, marginBottom: 16 },
                ]]}
              >{t("Request account deletion")}</Text>
              <Text
                style={[localizedTextStyle(), [styles.description, { color: colors.mutedForeground }]]}
              >{t("Submit a request for the Pulse team to review. Your account stays active until the review is complete.")}</Text>
              <View
                style={[
                  styles.warning,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Ionicons
                  name="wallet-outline"
                  size={24}
                  color={colors.primary}
                />
                <Text
                  accessibilityLiveRegion="polite"
                  style={[localizedTextStyle(), [
                    styles.description,
                    { color: colors.foreground, marginBottom: 0, flex: 1 },
                  ]]}
                >
                  {displayedBalance !== undefined
                    ? t("You have {v0} {v1}.", { v0: displayedBalance.toLocaleString(appLocale()), v1: displayedBalance === 1 ? "coin" : "coins" })
                    : coins.isFetching || deletion.isFetching
                      ? t("Loading your balance…")
                      : t("Coin balance unavailable.")}
                </Text>
              </View>
              {displayedBalance === undefined &&
                !coins.isFetching &&
                !deletion.isFetching &&
                button("Refresh balance", refreshAccount)}
              {displayedBalance !== undefined && displayedBalance > 0 && (
                <Text
                  style={[localizedTextStyle(), [
                    styles.description,
                    { color: colors.mutedForeground },
                  ]]}
                >{t("You can request a review with coins remaining. The team must resolve your balance with you before removing your account. Your coins won’t be deducted by submitting this request.")}</Text>
              )}
              {deletion.data?.request?.status === "pending" ? (
                <>
                  <Text
                    style={[localizedTextStyle(), [styles.description, { color: colors.foreground }]]}
                  >{t("Request #{v0} is pending review. Submitted{v1}{v2}.", { v0: deletion.data.request.id, v1: " ", v2: new Date(
                      deletion.data.request.requestedAt,
                    ).toLocaleDateString(appLocale()) })}</Text>
                  {button("Cancel deletion request", cancelDeletion)}
                </>
              ) : (
                <>
                  <View style={styles.field}>
                    <Text style={[localizedTextStyle(), [styles.label, { color: colors.foreground }]]}>{t("Reason (optional)")}</Text>
                    <TextInput
                      accessibilityLabel={t("Reason (optional)")}
                      multiline
                      maxLength={2000}
                      value={reason}
                      onChangeText={setReason}
                      editable={!busy}
                      style={[
                        styles.input,
                        {
                          minHeight: 100,
                          paddingVertical: 12,
                          textAlignVertical: "top",
                          color: colors.foreground,
                          borderColor: colors.border,
                          backgroundColor: colors.card,
                        },
                      ]}
                    />
                  </View>
                  {field(
                    "Type DELETE to confirm your request",
                    confirmation,
                    setConfirmation,
                  )}
                  {button(
                    "Submit deletion request",
                    submitDeletion,
                    confirmation !== "DELETE",
                    true,
                  )}
                </>
              )}
              {deletion.isError ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => {
                    void refreshAccount();
                  }}
                  style={{ paddingVertical: 16 }}
                >
                  <Text
                    style={[localizedTextStyle(), [
                      styles.subtitle,
                      { color: colors.mutedForeground, textAlign: "center" },
                    ]]}
                  >{t("Request status unavailable. Tap to retry.")}</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </>
      </ScrollView>
      <Modal
        visible={!!verification}
        transparent
        animationType="fade"
        onRequestClose={() => {
          verificationRef.current?.cancel();
          verificationRef.current = null;
          setVerification(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.scrim}
        >
          <View style={[styles.modal, { backgroundColor: colors.card }]}>
            <Text style={[localizedTextStyle(), [styles.title, { color: colors.foreground }]]}>{t("Verify it’s you")}</Text>
            <Text
              style={[localizedTextStyle(), [
                styles.description,
                { color: colors.mutedForeground, marginTop: 16 },
              ]]}
            >
              {verifyLabel || t("Preparing verification…")}
            </Text>
            {!!verifyError && (
              <Text accessibilityRole="alert" style={styles.error}>
                {t(verifyError)}
              </Text>
            )}
            {verifyMethod && (
              <TextInput
                accessibilityLabel={
                  verifyMethod === "password"
                    ? t("Current password")
                    : t("Verification code")
                }
                value={verifyValue}
                onChangeText={setVerifyValue}
                secureTextEntry={verifyMethod === "password"}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!verifyBusy}
                style={[
                  styles.input,
                  { color: colors.foreground, borderColor: colors.border },
                ]}
              />
            )}
            <TouchableOpacity
              accessibilityRole="button"
              disabled={verifyBusy || !verifyMethod || !verifyValue}
              style={[
                styles.button,
                {
                  backgroundColor: colors.primary,
                  opacity: verifyBusy || !verifyValue ? 0.5 : 1,
                },
              ]}
              onPress={async () => {
                if (!session || !verification || !verifyMethod) return;
                setVerifyBusy(true);
                setVerifyError("");
                try {
                  const result = secondFactor
                    ? await session.attemptSecondFactorVerification({
                        strategy: verifyMethod as "totp" | "phone_code",
                        code: verifyValue.trim(),
                      })
                    : await session.attemptFirstFactorVerification(
                        verifyMethod === "password"
                          ? { strategy: "password", password: verifyValue }
                          : {
                              strategy: "email_code",
                              code: verifyValue.trim(),
                            },
                      );
                  if (verificationRef.current !== verification) return;
                  if (result.status === "needs_second_factor") {
                    await prepareSecondFactor(result);
                    return;
                  }
                  if (result.status !== "complete")
                    throw new Error(
                      "Verification is not complete. Please try again.",
                    );
                  verificationRef.current = null;
                  setVerification(null);
                  setVerifyValue("");
                  verification.complete();
                } catch (e) {
                  setVerifyError(errorMessage(e));
                } finally {
                  setVerifyBusy(false);
                }
              }}
            >
              {verifyBusy ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={[localizedTextStyle(), styles.buttonText]}>{t("Continue")}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                verificationRef.current?.cancel();
                verificationRef.current = null;
                setVerification(null);
                setVerifyValue("");
              }}
            >
              <Text style={[localizedTextStyle(), [styles.link, { color: colors.mutedForeground }]]}>{t("Cancel")}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  back: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 21, fontFamily: "Inter_700Bold" },
  content: { padding: 20, paddingTop: 24, flexGrow: 1 },
  description: {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
    marginBottom: 22,
  },
  row: {
    padding: 16,
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 15, fontFamily: "Inter_500Medium" },
  subtitle: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    fontFamily: "Inter_400Regular",
  },
  dangerSection: { marginTop: 40, paddingTop: 24, borderTopWidth: 1 },
  field: { gap: 10, marginBottom: 18 },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  button: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    marginTop: 10,
  },
  buttonText: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  error: { color: "#FF4D67", fontSize: 14, lineHeight: 21, marginBottom: 18 },
  link: { paddingVertical: 18, textAlign: "center", fontSize: 14 },
  warning: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 22,
    flexDirection: "row",
    gap: 12,
  },
  scrim: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  modal: { padding: 24, borderRadius: 20 },
});
