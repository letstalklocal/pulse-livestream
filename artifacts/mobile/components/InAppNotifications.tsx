import { t, useAppLanguage } from "@/i18n";
import { useAuth } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  notificationBase,
  useNotificationPreferences,
} from "@/hooks/useNotificationPreferences";
import {
  canShowNotification,
  collectNotifications,
  notificationBody,
  type InAppNotification,
} from "@/utils/inAppNotifications";

export function InAppNotifications() {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const { userId, getToken } = useAuth();
  const { preferences, isSuccess } = useNotificationPreferences();
  const pathname = usePathname();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [owner, setOwner] = useState(userId);
  const [queue, setQueue] = useState<InAppNotification[]>([]);
  const state = useRef({ preferences, ready: isSuccess, pathname, getToken });
  state.current = { preferences, ready: isSuccess, pathname, getToken };

  useEffect(() => {
    setQueue([]);
    setOwner(userId);
    if (!userId) return;
    let stopped = false,
      fetching = false,
      active = AppState.currentState === "active";
    let cursor: number | undefined;
    let startedAt: number | undefined;
    let controller: AbortController | undefined;
    const seen = new Set<string>();
    const poll = async () => {
      if (stopped || !active || fetching || !state.current.ready) return;
      fetching = true;
      controller = new AbortController();
      try {
        const token = await state.current.getToken();
        if (!token || stopped || !active) return;
        const response = await fetch(
          `${notificationBase}/api/notifications/in-app${cursor === undefined ? "" : `?since=${cursor}`}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          },
        );
        if (!response.ok) return;
        const data = (await response.json()) as {
          notifications: InAppNotification[];
          cursor: number;
        };
        if (stopped || !active) return;
        if (startedAt === undefined) startedAt = data.cursor;
        cursor = data.cursor;
        const fresh = collectNotifications(
          data.notifications,
          seen,
          startedAt,
          state.current.preferences,
          state.current.pathname,
        );
        if (fresh.length)
          setQueue((previous) => [...previous, ...fresh].slice(-5));
      } catch {
        /* Retry quietly on the next foreground poll. */
      } finally {
        fetching = false;
      }
    };
    const subscription = AppState.addEventListener("change", (next) => {
      active = next === "active";
      if (!active) {
        controller?.abort();
        setQueue([]);
      } else {
        cursor = undefined;
        startedAt = undefined;
        void poll();
      }
    });
    void poll();
    const interval = setInterval(() => {
      void poll();
    }, 5000);
    return () => {
      stopped = true;
      clearInterval(interval);
      subscription.remove();
      controller?.abort();
    };
  }, [
    userId,
    isSuccess,
    preferences.enabled,
    preferences.messages,
    preferences.live,
    preferences.privateInvitations,
    preferences.gifts,
    preferences.followers,
    preferences.posts,
    preferences.previews,
  ]);

  useEffect(() => {
    setQueue((items) =>
      items.filter((event) =>
        canShowNotification(event, preferences, pathname),
      ),
    );
  }, [preferences, pathname]);
  const event = queue[0];
  useEffect(() => {
    if (!event) return;
    const timeout = setTimeout(() => setQueue((items) => items.slice(1)), 6500);
    return () => clearTimeout(timeout);
  }, [event?.id]);
  if (
    owner !== userId ||
    !userId ||
    !isSuccess ||
    !event ||
    !canShowNotification(event, preferences, pathname)
  )
    return null;
  const dismiss = () => setQueue((items) => items.slice(1));
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.position,
        { top: Platform.OS === "web" ? 12 : insets.top + 8 },
      ]}
    >
      <View
        accessibilityLiveRegion="polite"
        style={[
          styles.banner,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${event.title}. ${notificationBody(event, preferences.previews)}`}
          style={styles.content}
          onPress={() => {
            dismiss();
            router.push(event.route as never);
          }}
        >
          <Ionicons
            name="notifications-outline"
            size={23}
            color={colors.primary}
          />
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={[styles.title, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {event.title}
            </Text>
            <Text
              style={[styles.body, { color: colors.mutedForeground }]}
              numberOfLines={2}
            >
              {notificationBody(event, preferences.previews)}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("Dismiss notification")}
          onPress={dismiss}
          style={styles.close}
        >
          <Ionicons name="close" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  position: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 1000,
    elevation: 20,
  },
  banner: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 16,
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  close: {
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  body: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
});
