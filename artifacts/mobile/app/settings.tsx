import { useAuth } from "@/context/AuthContext";
import { useGrantCoins, getGetCoinBalanceQueryKey } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslationPreferences } from "@/hooks/useTranslationPreferences";
import { LANGUAGES, deviceLanguage } from "@/constants/languages";
import { Ionicons } from "@expo/vector-icons";
import { useAuth as useClerkAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { BUNDLE_VERSION } from "@/constants/version";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

interface SettingsItem {
  label: string;
  icon: IoniconName;
}

const GENERAL_ITEMS: SettingsItem[] = [
  { label: "Account", icon: "person-outline" },
  { label: "Notifications", icon: "notifications-outline" },
  { label: "Privacy", icon: "shield-checkmark-outline" },
  { label: "Messages", icon: "chatbubble-outline" },
  { label: "Preferred language", icon: "language-outline" },
  { label: "General", icon: "options-outline" },
];

const VAULT_ITEMS: SettingsItem[] = [
  { label: "My Vault", icon: "lock-closed-outline" },
  { label: "Earnings", icon: "wallet-outline" },
  { label: "Performance", icon: "stats-chart-outline" },
  { label: "Moments", icon: "sparkles-outline" },
  { label: "Fan Subscriptions", icon: "people-outline" },
  { label: "Managed Admins", icon: "key-outline" },
];

export default function SettingsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const grantMutation = useGrantCoins();
  const { preferences, ready, update } = useTranslationPreferences();
  const [showLanguage, setShowLanguage] = useState(false);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useClerkAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const queryClient = useQueryClient();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const addTestCoins = () => {
    if (!user?.uid) return;
    grantMutation.mutate(
      { data: { uid: user.uid, amount: 10000, note: "dev grant" } },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(
            getGetCoinBalanceQueryKey({ uid: user.uid }),
            { balance: data.balance },
          );
          void queryClient.invalidateQueries({ queryKey: getGetCoinBalanceQueryKey({ uid: user.uid }) });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert("Coins added", `+10,000 coins  •  Balance: ${data.balance.toLocaleString()} 🪙`);
        },
      },
    );
  };

  const showPlaceholder = (label: string) => {
    Alert.alert(label, "This setting will be available soon.");
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setSignOutError("");
    try {
      await signOut();
      queryClient.clear();
      setConfirmSignOut(false);
      router.replace("/(auth)/sign-in");
    } catch {
      setSignOutError("Couldn’t log out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  };

  const renderSection = (items: SettingsItem[]) => (
    <View
      style={[
        styles.section,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      {items.map((item, index) => (
        <TouchableOpacity
          key={item.label}
          style={[
            styles.row,
            index < items.length - 1 && {
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            },
          ]}
          onPress={() =>
            item.label === "Account"
              ? router.push("/account")
              : item.label === "Messages"
                ? router.push("/message-settings")
                : item.label === "Moments"
                ? router.push("/moments")
                : item.label === "Performance"
                ? router.push("/performance")
                : item.label === "Earnings"
                ? router.push("/earnings")
                : item.label === "My Vault"
                ? router.push("/my-vault")
                : item.label === "Privacy"
                ? router.push("/privacy")
                : item.label === "Notifications"
                  ? router.push("/notification-settings")
                  : item.label === "Preferred language"
                ? setShowLanguage(true)
                : showPlaceholder(item.label)
          }
          activeOpacity={0.7}
        >
          <View
            style={[styles.iconWrap, { backgroundColor: colors.background }]}
          >
            <Ionicons name={item.icon} size={18} color={colors.primary} />
          </View>
          <Text style={[styles.rowLabel, { color: colors.foreground }]}>
            {item.label}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={17}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Modal
        visible={confirmSignOut}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isSigningOut) setConfirmSignOut(false);
        }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            padding: 24,
            backgroundColor: "rgba(0,0,0,0.6)",
          }}
        >
          <View
            style={{
              padding: 24,
              borderRadius: 20,
              backgroundColor: colors.card,
            }}
          >
            <Text style={[styles.title, { color: colors.foreground }]}>
              Log out?
            </Text>
            <Text
              style={{
                marginTop: 12,
                color: colors.mutedForeground,
                fontSize: 14,
                lineHeight: 22,
              }}
            >
              You’ll need to sign in again to access your account.
            </Text>
            {!!signOutError && (
              <Text
                accessibilityRole="alert"
                style={{ color: "#FF4D67", marginTop: 12 }}
              >
                {signOutError}
              </Text>
            )}
            <TouchableOpacity
              accessibilityRole="button"
              disabled={isSigningOut}
              onPress={() => {
                void handleSignOut();
              }}
              style={[
                styles.logoutBtn,
                { borderColor: colors.border, marginTop: 24 },
              ]}
            >
              <Text style={styles.logoutText}>
                {isSigningOut ? "Logging Out…" : "Log Out"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={isSigningOut}
              onPress={() => setConfirmSignOut(false)}
              style={{ paddingTop: 20, alignItems: "center" }}
            >
              <Text style={{ color: colors.foreground }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal
        visible={showLanguage}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLanguage(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <View
            style={{
              backgroundColor: colors.card,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: insets.bottom + 24,
              maxHeight: "80%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <Text
                style={{
                  color: colors.foreground,
                  fontSize: 20,
                  fontWeight: "700",
                }}
              >
                Preferred language
              </Text>
              <TouchableOpacity
                onPress={() => setShowLanguage(false)}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {[
                [
                  "device",
                  `Phone language (${LANGUAGES.find(([code]) => code === deviceLanguage())?.[1] ?? "English"})`,
                ],
                ...LANGUAGES,
              ].map(([code, label]) => (
                <TouchableOpacity
                  key={code}
                  disabled={!ready || savingLanguage}
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: preferences.language === code,
                  }}
                  style={{
                    paddingVertical: 13,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                  onPress={async () => {
                    setSavingLanguage(true);
                    try {
                      await update({ language: code });
                      setShowLanguage(false);
                    } catch {
                      Alert.alert(
                        "Couldn't save language",
                        "Please try again.",
                      );
                    } finally {
                      setSavingLanguage(false);
                    }
                  }}
                >
                  <Text style={{ color: colors.foreground, fontSize: 16 }}>
                    {label}
                  </Text>
                  {preferences.language === code ? (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={colors.primary}
                    />
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <StatusBar barStyle="light-content" />
      <View
        style={[
          styles.header,
          { paddingTop: topInset + 10, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.backBtn,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
          onPress={() => router.back()}
          activeOpacity={0.7}
          accessibilityLabel="Back to profile"
        >
          <Ionicons name="chevron-back" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Settings
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 20) + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {renderSection(GENERAL_ITEMS)}

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
          CREATOR
        </Text>
        {renderSection(VAULT_ITEMS)}

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
          ABOUT
        </Text>
        <View
          style={[
            styles.section,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View
            style={[styles.versionRow, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>
              App version
            </Text>
            <Text
              style={[styles.versionValue, { color: colors.mutedForeground }]}
            >
              {Constants.expoConfig?.version ?? "Unknown"}
            </Text>
          </View>
          <View style={styles.versionRow}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>
              Bundle version
            </Text>
            <Text
              style={[styles.versionValue, { color: colors.mutedForeground }]}
            >
              {BUNDLE_VERSION}
            </Text>
          </View>
          <TouchableOpacity accessibilityRole="button" disabled={!user || grantMutation.isPending} onPress={addTestCoins} style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Ionicons name="add-circle-outline" size={20} color="#FFD700" />
            <Text style={[styles.rowLabel, { color: "#FFD700" }]}>{grantMutation.isPending ? "Adding…" : "+500 coins (dev)"}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.logoutBtn,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          onPress={() => {
            setSignOutError("");
            setConfirmSignOut(true);
          }}
          activeOpacity={0.75}
          disabled={isSigningOut}
        >
          <Ionicons name="log-out-outline" size={19} color="#FF4D67" />
          <Text style={styles.logoutText}>
            {isSigningOut ? "Logging Out…" : "Log Out"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 21, fontFamily: "Inter_700Bold" },
  headerSpacer: { width: 38, height: 38 },
  content: { paddingHorizontal: 20, paddingTop: 22 },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionTitle: {
    marginTop: 28,
    marginBottom: 9,
    marginLeft: 4,
    fontSize: 11,
    letterSpacing: 1.2,
    fontFamily: "Inter_700Bold",
  },
  row: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  versionRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  versionValue: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  logoutBtn: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 36,
  },
  logoutText: {
    color: "#FF4D67",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
