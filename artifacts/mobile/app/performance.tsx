import React, { useCallback } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useFocusEffect, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

type Performance = {
  timezone: string;
  today: string;
  month: string;
  seconds: number;
  todaySeconds: number;
  todayLongestSeconds: number;
  qualifyingDays: number;
  goalMet: boolean;
  liveCoins: number;
  bonusCoins: number;
  level: {
    id: string;
    name: string;
    days: number;
    hours: number;
    dailyMinutes: number;
    bonusPercent: number;
  };
  days: { date: string; seconds: number; longestSeconds: number; qualified: boolean }[];
};
const base = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";
function duration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
function remaining(seconds: number) {
  const minutes = Math.ceil(Math.max(0, seconds) / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes}m`;
}

export default function PerformanceScreen() {
  const colors = useColors(),
    insets = useSafeAreaInsets(),
    router = useRouter();
  const { userId, getToken } = useAuth();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const query = useQuery<Performance>({
    queryKey: ["performance", userId, timezone],
    enabled: !!userId,
    refetchInterval: 30_000,
    queryFn: async ({ signal }) => {
      const token = await getToken();
      if (!token) throw new Error("Sign in to view performance.");
      const response = await fetch(
        `${base}/api/performance?timezone=${encodeURIComponent(timezone)}`,
        { signal, headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok)
        throw new Error("Couldn't load performance. Please try again.");
      return response.json();
    },
  });
  const { refetch } = query;
  useFocusEffect(
    useCallback(() => {
      if (userId) void refetch();
    }, [userId, refetch]),
  );
  const data = query.data;
  const fg = { color: colors.foreground },
    muted = { color: colors.mutedForeground };
  const card = { backgroundColor: colors.card, borderColor: colors.border };
  const progress = (value: number, target: number, color = colors.primary) => (
    <View
      style={[styles.track, { backgroundColor: colors.secondary }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: target, now: Math.min(value, target) }}
    >
      <View
        style={[
          styles.fill,
          {
            backgroundColor: color,
            width: `${Math.max(0, Math.min(100, (value / target) * 100))}%`,
          },
        ]}
      />
    </View>
  );
  const monthName = data
    ? new Date(`${data.month}-01T12:00:00`).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      })
    : "This month";

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
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel="Back to settings"
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, fg]}>Performance</Text>
        <TouchableOpacity
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel="About performance goals"
          onPress={() =>
            Alert.alert(
              "Performance goals",
              `Stream on ${data?.level.days ?? 10} days and reach ${data?.level.hours ?? 20} total hours in a calendar month to meet the ${data?.level.bonusPercent ?? 5}% bonus goal.\n\nA day counts once you stream at least ${data?.level.dailyMinutes ?? 60} minutes in one stream within that day. Separate streams do not combine to qualify a day. All streaming time adds to monthly hours.\n\nDates use ${timezone}. Live time updates with stream heartbeats. The bonus is 5% of this month’s live gift earnings only, rounded down to whole coins. This is a running estimate; coins are not credited automatically.`,
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
        {!userId ? (
          <Text style={fg}>Sign in to view performance.</Text>
        ) : query.isPending ? (
          <ActivityIndicator color={colors.primary} style={{ padding: 32 }} />
        ) : query.isError ? (
          <View style={[styles.card, card]}>
            <Text style={fg} accessibilityRole="alert">
              {query.error.message}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              style={{ paddingVertical: 16 }}
              onPress={() => {
                void refetch();
              }}
            >
              <Text style={{ color: colors.primary }}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          data && (
            <>
              <View style={styles.row}>
                <Text style={[styles.subtitle, fg]}>{monthName}</Text>
                <Text style={[styles.caption, muted]}>{data.level.name}</Text>
              </View>
              <View style={[styles.card, card, { gap: 14 }]}>
                <View style={styles.row}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="trophy-outline" size={22} color="#FFD68A" />
                    <Text style={[styles.bonus, { color: "#FFD68A" }]}>
                      {data.level.bonusPercent}% bonus
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.caption,
                      {
                        color: data.goalMet
                          ? "#61DBB6"
                          : colors.mutedForeground,
                      },
                    ]}
                  >
                    {data.goalMet ? "Goals met" : "In progress"}
                  </Text>
                </View>
                <View style={{ gap: 8 }}>
                  <View style={styles.row}>
                    <Text style={[styles.medium, fg]}>Qualifying days</Text>
                    <Text style={[styles.medium, fg]}>
                      {data.qualifyingDays} / {data.level.days}
                    </Text>
                  </View>
                  {progress(data.qualifyingDays, data.level.days)}
                </View>
                <View style={{ gap: 8 }}>
                  <View style={styles.row}>
                    <Text style={[styles.medium, fg]}>Monthly hours</Text>
                    <Text style={[styles.medium, fg]}>
                      {duration(data.seconds)} / {data.level.hours}h
                    </Text>
                  </View>
                  {progress(data.seconds, data.level.hours * 3600, "#FFD68A")}
                </View>
                <Text style={[styles.caption, muted]}>
                  {data.goalMet
                    ? "Both monthly targets reached"
                    : `${Math.max(0, data.level.days - data.qualifyingDays)} days · ${remaining(data.level.hours * 3600 - data.seconds)} left`}
                </Text>
              </View>
              <View style={[styles.card, card, { gap: 10 }]}>
                <View style={styles.row}>
                  <Text style={[styles.medium, fg]}>Live earnings</Text>
                  <Text style={[styles.medium, fg]}>
                    {data.liveCoins.toLocaleString()} coins
                  </Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.medium, fg]}>Estimated bonus</Text>
                  <Text style={[styles.medium, { color: "#FFD68A" }]}>
                    +{data.bonusCoins.toLocaleString()} coins
                  </Text>
                </View>
                <Text style={[styles.caption, muted]}>
                  {data.goalMet
                    ? "Goals met · not yet credited"
                    : "Unlock by meeting both goals"}
                </Text>
              </View>
              <View style={[styles.card, card, { gap: 10 }]}>
                <View style={styles.row}>
                  <Text style={[styles.medium, fg]}>Today</Text>
                  <Text style={[styles.medium, fg]}>
                    {duration(data.todaySeconds)}
                  </Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.caption, muted]}>Longest stream</Text>
                  <Text style={[styles.caption, muted]}>
                    {duration(data.todayLongestSeconds)} /{" "}
                    {data.level.dailyMinutes / 60}h
                  </Text>
                </View>
                {progress(
                  data.todayLongestSeconds,
                  data.level.dailyMinutes * 60,
                  "#61DBB6",
                )}
                <Text
                  style={[
                    styles.caption,
                    {
                      color:
                        data.todayLongestSeconds >= data.level.dailyMinutes * 60
                          ? "#61DBB6"
                          : colors.mutedForeground,
                    },
                  ]}
                >
                  {data.todayLongestSeconds >= data.level.dailyMinutes * 60
                    ? "Day qualified ✓"
                    : `One ${data.level.dailyMinutes / 60}h stream needed`}
                </Text>
              </View>
              <View style={{ gap: 12 }}>
                <View style={styles.row}>
                  <Text style={[styles.subtitle, fg]}>Streaming days</Text>
                  <Text style={[styles.caption, muted]}>1h in one stream</Text>
                </View>
                <View style={[styles.card, card]}>
                  <View style={styles.calendar}>
                    {data.days.map((day) => (
                      <TouchableOpacity
                        key={day.date}
                        accessibilityRole="button"
                        accessibilityLabel={`${day.date}, ${duration(day.seconds)}, ${day.qualified ? "qualified" : "not qualified"}`}
                        onPress={() =>
                          Alert.alert(
                            day.date,
                            `${duration(day.seconds)} total\nLongest stream: ${duration(day.longestSeconds)}${day.qualified ? "\nDay qualified" : ""}`,
                          )
                        }
                        style={[
                          styles.day,
                          {
                            backgroundColor: day.qualified
                              ? "#173A32"
                              : day.seconds > 0
                                ? colors.secondary
                                : colors.background,
                            borderColor:
                              day.date === data.today
                                ? colors.primary
                                : "transparent",
                            opacity: day.date > data.today ? 0.4 : 1,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.medium,
                            {
                              color: day.qualified
                                ? "#61DBB6"
                                : colors.foreground,
                            },
                          ]}
                        >
                          {Number(day.date.slice(-2))}
                        </Text>
                        <Ionicons
                          name={
                            day.qualified
                              ? "checkmark"
                              : day.seconds > 0
                                ? "ellipse"
                                : "remove"
                          }
                          size={12}
                          color={
                            day.qualified ? "#61DBB6" : colors.mutedForeground
                          }
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
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
  button: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 21, fontFamily: "Inter_700Bold" },
  content: { padding: 20, gap: 18 },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  card: { padding: 18, borderRadius: 16, borderWidth: 1 },
  subtitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  medium: { fontSize: 15, fontFamily: "Inter_500Medium" },
  caption: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  bonus: { fontSize: 22, fontFamily: "Inter_600SemiBold" },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  calendar: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  day: {
    minWidth: 44,
    minHeight: 52,
    flexBasis: "12%",
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
});
