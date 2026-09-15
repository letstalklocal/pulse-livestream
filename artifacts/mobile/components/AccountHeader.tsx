import { t, useAppLanguage, appLocale } from "@/i18n";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { type ReactNode } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetCoinBalance } from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export function AccountHeader({ children }: { children?: ReactNode }) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { data: coinData } = useGetCoinBalance(
    { uid: user?.uid ?? 0 },
    { query: { enabled: !!user?.uid, refetchInterval: 8_000 } as any },
  );
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.header, { paddingTop: topInset + 12 }]}>
      <View style={styles.row}>
        <View style={styles.accountSummary}>
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/profile")}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={t("Open profile")}
          >
            {user ? (
              <Avatar uid={user.uid} name={user.name} avatarUri={user.avatarUri} size={38} />
            ) : (
              <View style={[styles.guestAvatar, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="person-outline" size={20} color={colors.mutedForeground} />
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.coinBalance} onPress={() => router.push("/coin-store")}
            activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={t("Buy Coins")}>
            {/* Explicit gold artwork avoids platform-specific emoji colors. */}
            <Svg width={16} height={16} viewBox="0 0 24 24" accessible={false}>
              <Circle cx={12} cy={12} r={11} fill="#E5A400" stroke="#A96B00" strokeWidth={1} />
              <Circle cx={12} cy={12} r={8.5} fill="#FFD54A" stroke="#FFF0A3" strokeWidth={1.5} />
              <Path d="M15 8.5a4.5 4.5 0 1 0 0 7" fill="none" stroke="#B87900" strokeWidth={2} strokeLinecap="round" />
            </Svg>
            <Text style={[styles.coinText, localizedTextStyle(), { color: colors.foreground }]} numberOfLines={1}>
              {(coinData?.balance ?? 0) === 0 ? t("Buy Coins") : coinData!.balance.toLocaleString(appLocale())}
            </Text>
          </TouchableOpacity>
        </View>
        {children ? <View style={styles.actions}>{children}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 14 },
  row: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  accountSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flexShrink: 1,
    height: 44,
  },
  guestAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  coinBalance: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  coinText: { fontSize: 16, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  actions: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
});
