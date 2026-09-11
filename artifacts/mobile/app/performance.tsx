import { t, useAppLanguage, appNumber, localizedTextStyle, appLocale } from "@/i18n";
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
  if (!/^en(?:-|$)/i.test(appLocale())) return `${appNumber(Math.floor(minutes / 60), { style: "unit", unit: "hour", unitDisplay: "short" })} ${appNumber(minutes % 60, { style: "unit", unit: "minute", unitDisplay: "short" })}`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
function remaining(seconds: number) {
  const minutes = Math.ceil(Math.max(0, seconds) / 60);
  if (!/^en(?:-|$)/i.test(appLocale())) return minutes >= 60 ? duration(minutes * 60) : appNumber(minutes, { style: "unit", unit: "minute", unitDisplay: "short" });
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes}m`;
}

export default function PerformanceScreen() {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
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
    ? new Date(`${data.month}-01T12:00:00`).toLocaleDateString(appLocale(), {
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
          accessibilityLabel={t("Back to settings")}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[localizedTextStyle(), [styles.title, fg]]}>{t("Performance")}</Text>
        <TouchableOpacity
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel={t("About performance goals")}
          onPress={() =>
            Alert.alert(
              t("Performance goals"),
              t("Stream on {v0} days and reach {v1} total hours in a calendar month to meet the {v2}% bonus goal.\n\nA day counts once you stream at least {v3} minutes in one stream within that day. Separate streams do not combine to qualify a day. All streaming time adds to monthly hours.\n\nDates use {v4}. Live time updates with stream heartbeats. The bonus is 5% of this month’s live gift earnings only, rounded down to whole coins. This is a running estimate; coins are not credited automatically.", { v0: data?.level.days ?? 10, v1: data?.level.hours ?? 20, v2: data?.level.bonusPercent ?? 5, v3: data?.level.dailyMinutes ?? 60, v4: timezone }),
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
          <Text style={[localizedTextStyle(), fg]}>{t("Sign in to view performance.")}</Text>
        ) : query.isPending ? (
          <ActivityIndicator color={colors.primary} style={{ padding: 32 }} />
        ) : query.isError ? (
          <View style={[styles.card, card]}>
            <Text style={fg} accessibilityRole="alert">
              {t(query.error.message)}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              style={{ paddingVertical: 16 }}
              onPress={() => {
                void refetch();
              }}
            >
              <Text style={[localizedTextStyle(), { color: colors.primary }]}>{t("Try again")}</Text>
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
                    <Text style={[localizedTextStyle(), [styles.bonus, { color: "#FFD68A" }]]}>{t("{v0}% bonus", { v0: data.level.bonusPercent })}</Text>
                  </View>
                  <Text
                    style={[localizedTextStyle(), [
                      styles.caption,
                      {
                        color: data.goalMet
                          ? "#61DBB6"
                          : colors.mutedForeground,
                      },
                    ]]}
                  >
                    {data.goalMet ? t("Goals met") : t("In progress")}
                  </Text>
                </View>
                <View style={{ gap: 8 }}>
                  <View style={styles.row}>
                    <Text style={[localizedTextStyle(), [styles.medium, fg]]}>{t("Qualifying days")}</Text>
                    <Text style={[styles.medium, fg]}>
                      {data.qualifyingDays} / {data.level.days}
                    </Text>
                  </View>
                  {progress(data.qualifyingDays, data.level.days)}
                </View>
                <View style={{ gap: 8 }}>
                  <View style={styles.row}>
                    <Text style={[localizedTextStyle(), [styles.medium, fg]]}>{t("Monthly hours")}</Text>
                    <Text style={[styles.medium, fg]}>
                      {duration(data.seconds)} / {data.level.hours}h
                    </Text>
                  </View>
                  {progress(data.seconds, data.level.hours * 3600, "#FFD68A")}
                </View>
                <Text style={[localizedTextStyle(), [styles.caption, muted]]}>
                  {data.goalMet
                    ? t("Both monthly targets reached")
                    : t("{v0} days · {v1} left", { v0: Math.max(0, data.level.days - data.qualifyingDays), v1: remaining(data.level.hours * 3600 - data.seconds) })}
                </Text>
              </View>
              <View style={[styles.card, card, { gap: 10 }]}>
                <View style={styles.row}>
                  <Text style={[localizedTextStyle(), [styles.medium, fg]]}>{t("Live earnings")}</Text>
                  <Text style={[localizedTextStyle(), [styles.medium, fg]]}>{t("{v0} coins", { v0: data.liveCoins.toLocaleString(appLocale()) })}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[localizedTextStyle(), [styles.medium, fg]]}>{t("Estimated bonus")}</Text>
                  <Text style={[localizedTextStyle(), [styles.medium, { color: "#FFD68A" }]]}>{t("+{v0} coins", { v0: data.bonusCoins.toLocaleString(appLocale()) })}</Text>
                </View>
                <Text style={[localizedTextStyle(), [styles.caption, muted]]}>
                  {data.goalMet
                    ? t("Goals met · not yet credited")
                    : t("Unlock by meeting both goals")}
                </Text>
              </View>
              <View style={[styles.card, card, { gap: 10 }]}>
                <View style={styles.row}>
                  <Text style={[localizedTextStyle(), [styles.medium, fg]]}>{t("Today")}</Text>
                  <Text style={[styles.medium, fg]}>
                    {duration(data.todaySeconds)}
                  </Text>
                </View>
                <View style={styles.row}>
                  <Text style={[localizedTextStyle(), [styles.caption, muted]]}>{t("Longest stream")}</Text>
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
                  style={[localizedTextStyle(), [
                    styles.caption,
                    {
                      color:
                        data.todayLongestSeconds >= data.level.dailyMinutes * 60
                          ? "#61DBB6"
                          : colors.mutedForeground,
                    },
                  ]]}
                >
                  {data.todayLongestSeconds >= data.level.dailyMinutes * 60
                    ? t("Day qualified ✓")
                    : t("One {v0}h stream needed", { v0: data.level.dailyMinutes / 60 })}
                </Text>
              </View>
              <View style={{ gap: 12 }}>
                <View style={styles.row}>
                  <Text style={[localizedTextStyle(), [styles.subtitle, fg]]}>{t("Streaming days")}</Text>
                  <Text style={[localizedTextStyle(), [styles.caption, muted]]}>{t("1h in one stream")}</Text>
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
                            t("{v0} total\nLongest stream: {v1}{v2}", { v0: duration(day.seconds), v1: duration(day.longestSeconds), v2: day.qualified ? "\nDay qualified" : "" }),
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
