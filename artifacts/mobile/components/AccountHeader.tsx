import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { type ReactNode } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetCoinBalance } from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export function AccountHeader({ children }: { children?: ReactNode }) {
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
        <TouchableOpacity
          style={styles.accountSummary}
          onPress={() => router.push("/(tabs)/profile")}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          {user ? (
            <Avatar uid={user.uid} name={user.name} avatarUri={user.avatarUri} size={38} />
          ) : (
            <View style={[styles.guestAvatar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="person-outline" size={20} color={colors.mutedForeground} />
            </View>
          )}
          <View style={styles.coinBalance}>
            <Text style={styles.coinIcon}>🪙</Text>
            <Text style={[styles.coinText, { color: colors.foreground }]} numberOfLines={1}>
              {(coinData?.balance ?? 0).toLocaleString()}
            </Text>
          </View>
        </TouchableOpacity>
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
  coinBalance: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  coinIcon: { fontSize: 16 },
  coinText: { fontSize: 16, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  actions: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
});
