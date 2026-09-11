import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { earningsRange, type EarningsPeriod } from "@/utils/earningsPeriod";

type Earnings = {
  coins: number;
  transactions: number;
  supporters: number;
  entries: {
    rank: number;
    uid: number | null;
    name: string;
    coins: number;
    transactions: number;
  }[];
};
const periods: EarningsPeriod[] = ["day", "week", "month", "year"];
const base = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

export default function EarningsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId, getToken } = useAuth();
  const [period, setPeriod] = useState<EarningsPeriod>("day");
  const [offset, setOffset] = useState(0);
  const { start, end } = earningsRange(period, offset);
  const startISO = start.toISOString(),
    endISO = end.toISOString();
  const query = useQuery<Earnings>({
    queryKey: ["earnings", userId, startISO, endISO],
    enabled: !!userId,
    queryFn: async ({ signal }) => {
      const token = await getToken();
      if (!token) throw new Error("Sign in to view your earnings.");
      const response = await fetch(
        `${base}/api/earnings?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        },
      );
      if (!response.ok)
        throw new Error("Couldn't load earnings. Please try again.");
      return response.json();
    },
    refetchInterval: 30_000,
  });
  const { refetch } = query;
  useFocusEffect(
    useCallback(() => {
      if (userId) void refetch();
    }, [userId, refetch]),
  );
  const dateFormat: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const lastDay = new Date(end.getTime() - 1);
  const rangeLabel =
    period === "day"
      ? start.toLocaleDateString(undefined, dateFormat)
      : period === "month"
        ? start.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })
        : period === "year"
          ? String(start.getFullYear())
          : `${start.toLocaleDateString(undefined, dateFormat)} – ${lastDay.toLocaleDateString(undefined, dateFormat)}`;
  const card = { backgroundColor: colors.card, borderColor: colors.border };
  const label = { color: colors.mutedForeground };
  const foreground = { color: colors.foreground };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
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
          accessibilityRole="button"
          accessibilityLabel="Back to settings"
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, foreground]}>Earnings</Text>
        <TouchableOpacity
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="About earnings"
          onPress={() =>
            Alert.alert(
              "About earnings",
              "Includes gifts and media pack sales, in coins. Coin purchases and test grants are excluded.\n\nDates follow your phone’s local time. Weeks start Monday.\n\nTop supporters ranks up to 20 people by coins received during the selected period.",
            )
          }
        >
          <Ionicons
            name="information-circle-outline"
            size={22}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 32 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => {
              void refetch();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={[styles.periods, { backgroundColor: colors.card }]}>
          {periods.map((value) => (
            <TouchableOpacity
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: period === value }}
              onPress={() => {
                setPeriod(value);
                setOffset(0);
              }}
              style={[
                styles.period,
                period === value && {
                  backgroundColor: colors.secondary,
                },
              ]}
            >
              <Text
                style={[
                  styles.medium,
                  { color: period === value ? "#FFFFFF" : colors.foreground },
                ]}
              >
                {value[0].toUpperCase() + value.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.dateRow}>
          <TouchableOpacity
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={`Previous ${period}`}
            onPress={() => setOffset((value) => value - 1)}
          >
            <Ionicons name="chevron-back" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center", gap: 4 }}>
            <Text style={[styles.medium, foreground, { textAlign: "center" }]}>
              {offset === 0 && period === "day" ? "Today" : rangeLabel}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={`Next ${period}`}
            accessibilityState={{ disabled: offset === 0 }}
            disabled={offset === 0}
            onPress={() => setOffset((value) => Math.min(0, value + 1))}
          >
            <Ionicons
              name="chevron-forward"
              size={20}
              color={offset === 0 ? colors.border : colors.foreground}
            />
          </TouchableOpacity>
        </View>
        {offset !== 0 && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setOffset(0)}
            style={{ alignSelf: "center", padding: 12 }}
          >
            <Text style={{ color: colors.primary }}>
              Back to {period === "day" ? "today" : `this ${period}`}
            </Text>
          </TouchableOpacity>
        )}
        {!userId ? (
          <Text style={foreground}>Sign in to view your earnings.</Text>
        ) : query.isPending ? (
          <ActivityIndicator
            style={{ padding: 40 }}
            color={colors.primary}
            accessibilityLabel="Loading earnings"
          />
        ) : query.isError ? (
          <View style={[styles.card, card]}>
            <Text accessibilityRole="alert" style={foreground}>
              {query.error.message}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                void refetch();
              }}
              style={{ paddingVertical: 16 }}
            >
              <Text style={{ color: colors.primary }}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          query.data && (
            <>
              <LinearGradient
                colors={["#272039", colors.card]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.hero, { borderColor: colors.border }]}
              >
                <View style={styles.summaryRow}>
                  <View style={styles.heroHeading}>
                    <Ionicons name="wallet-outline" size={18} color="#FFD68A" />
                    <Text style={[styles.medium, { color: "#C7C0D4" }]}>
                      Coins earned
                    </Text>
                  </View>
                  <Text style={[styles.total, foreground]}>
                    {query.data.coins.toLocaleString()}
                  </Text>
                </View>
                <View style={[styles.stats, { borderTopColor: colors.border }]}>
                  {[
                    { name: "Transactions", value: query.data.transactions },
                    { name: "Supporters", value: query.data.supporters },
                  ].map((stat) => (
                    <View key={stat.name} style={styles.stat}>
                      <Text style={[styles.statValue, foreground]}>
                        {stat.value.toLocaleString()}
                      </Text>
                      <Text style={[styles.caption, label]}>{stat.name}</Text>
                    </View>
                  ))}
                </View>
              </LinearGradient>
              <View style={styles.supporterHeading}>
                <Text style={[styles.subtitle, foreground]}>
                  Top supporters
                </Text>
                <Ionicons name="trophy-outline" size={19} color="#FFD68A" />
              </View>
              {query.data.entries.length === 0 ? (
                <View style={[styles.card, styles.empty, card]}>
                  <View
                    style={[
                      styles.emptyIcon,
                      { backgroundColor: colors.secondary },
                    ]}
                  >
                    <Ionicons
                      name="gift-outline"
                      size={28}
                      color={colors.mutedForeground}
                    />
                  </View>
                  <Text style={[styles.medium, foreground]}>
                    No earnings yet
                  </Text>
                </View>
              ) : (
                <View style={[styles.card, card, { paddingVertical: 0 }]}>
                  {query.data.entries.map((entry, index) => (
                    <View
                      key={entry.uid ?? "unknown"}
                      style={[
                        styles.supporter,
                        index > 0 && {
                          borderTopWidth: 1,
                          borderTopColor: colors.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.rank,
                          {
                            backgroundColor:
                              entry.rank === 1 ? "#332B21" : colors.secondary,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.medium,
                            {
                              color:
                                entry.rank === 1
                                  ? "#FFD68A"
                                  : colors.mutedForeground,
                            },
                          ]}
                        >
                          {entry.rank}
                        </Text>
                      </View>
                      <View style={{ flex: 1, gap: 8 }}>
                        <View style={styles.supporterDetails}>
                          <View style={{ flexGrow: 1, flexBasis: 100, gap: 3 }}>
                            <Text style={[styles.medium, foreground]}>
                              {entry.name}
                            </Text>
                            <Text style={[styles.caption, label]}>
                              {entry.transactions.toLocaleString()}{" "}
                              {entry.transactions === 1
                                ? "transaction"
                                : "transactions"}
                            </Text>
                          </View>
                          <Text style={[styles.medium, { color: "#FFD68A" }]}>
                            {entry.coins.toLocaleString()}{" "}
                            <Text style={[styles.caption, label]}>coins</Text>
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.barTrack,
                            { backgroundColor: colors.secondary },
                          ]}
                        >
                          <View
                            style={[
                              styles.barFill,
                              {
                                backgroundColor:
                                  entry.rank === 1 ? "#FFD68A" : colors.primary,
                                width: `${Math.max(0, Math.min(100, (entry.coins / (query.data.entries[0]?.coins || 1)) * 100))}%`,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 21, fontFamily: "Inter_700Bold" },
  content: { padding: 20, gap: 16 },
  periods: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    padding: 5,
    borderRadius: 16,
  },
  period: {
    flexGrow: 1,
    minWidth: 60,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    borderRadius: 11,
  },
  medium: { fontSize: 15, fontFamily: "Inter_500Medium" },
  caption: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  card: { padding: 20, borderRadius: 16, borderWidth: 1 },
  total: {
    fontSize: 28,
    fontFamily: "Inter_600SemiBold",
    fontVariant: ["tabular-nums"],
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 12,
  },
  stat: {
    flexGrow: 1,
    flexBasis: 100,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 6,
  },
  statValue: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    fontVariant: ["tabular-nums"],
  },
  subtitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  hero: { padding: 16, borderRadius: 16, borderWidth: 1 },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  heroHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  supporterHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
  },
  rank: {
    minWidth: 32,
    minHeight: 32,
    padding: 6,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  supporterDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 10,
    rowGap: 6,
  },
  barTrack: { height: 3, borderRadius: 2, overflow: "hidden" },
  barFill: { height: 3, borderRadius: 2 },
  empty: { alignItems: "center", gap: 14, paddingVertical: 32 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  supporter: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 18,
  },
});
