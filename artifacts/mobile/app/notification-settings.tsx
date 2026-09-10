import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  useNotificationPreferences,
  type NotificationPreferences,
} from "@/hooks/useNotificationPreferences";
const categories: {
  key: keyof NotificationPreferences;
  title: string;
  detail: string;
}[] = [
  {
    key: "messages",
    title: "Messages",
    detail: "New direct messages and media",
  },
  {
    key: "live",
    title: "Live streams",
    detail: "People you follow starting a regular or Premium live",
  },
  {
    key: "privateInvitations",
    title: "Private live invitations",
    detail: "Invitations to a private live",
  },
  {
    key: "gifts",
    title: "Gifts and earnings",
    detail: "Gifts and coin payments received in DMs",
  },
  {
    key: "followers",
    title: "New followers",
    detail: "People who start following you",
  },
  {
    key: "posts",
    title: "Post activity",
    detail: "Likes and comments on your posts",
  },
];
export default function NotificationSettings() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences, isSuccess, isPending, isError, refetch, save, userId } =
    useNotificationPreferences();
  const row = (
    key: keyof NotificationPreferences,
    title: string,
    detail: string,
    master = false,
  ) => (
    <View
      key={key}
      style={[
        styles.row,
        {
          borderColor: colors.border,
          opacity: !master && !preferences.enabled ? 0.5 : 1,
        },
      ]}
    >
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={[styles.label, { color: colors.foreground }]}>
          {title}
        </Text>
        <Text style={[styles.detail, { color: colors.mutedForeground }]}>
          {detail}
        </Text>
      </View>
      <Switch
        accessibilityLabel={title}
        value={preferences[key]}
        disabled={
          !isSuccess || save.isPending || (!master && !preferences.enabled)
        }
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#FFF"
        onValueChange={(value) => save.mutate({ [key]: value })}
      />
    </View>
  );
  if (!userId) return <Redirect href="/(auth)/sign-in" />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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
          accessibilityLabel="Back to Settings"
          onPress={() => router.back()}
          style={[
            styles.back,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Notifications
        </Text>
        <View style={{ width: 38 }} />
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 32,
        }}
      >
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          Choose the alerts you see while using Pulse. Notifications outside the
          app will be added later.
        </Text>
        {isPending && (
          <ActivityIndicator
            color={colors.primary}
            style={{ marginBottom: 16 }}
          />
        )}
        {isError && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              void refetch();
            }}
          >
            <Text style={styles.error}>
              Couldn’t load settings. Tap to retry.
            </Text>
          </TouchableOpacity>
        )}
        {save.isError && (
          <Text accessibilityRole="alert" style={styles.error}>
            {save.error.message}
          </Text>
        )}
        {save.isPending && (
          <Text
            accessibilityLiveRegion="polite"
            style={[
              styles.detail,
              { color: colors.mutedForeground, marginBottom: 12 },
            ]}
          >
            Saving…
          </Text>
        )}
        <View
          style={[
            styles.section,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {row(
            "enabled",
            "In-app notifications",
            "Show banners while the app is open",
            true,
          )}
        </View>
        <Text style={[styles.heading, { color: colors.mutedForeground }]}>
          NOTIFY ME ABOUT
        </Text>
        <View
          style={[
            styles.section,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {categories.map((item) => row(item.key, item.title, item.detail))}
        </View>
        <Text style={[styles.heading, { color: colors.mutedForeground }]}>
          PREVIEWS
        </Text>
        <View
          style={[
            styles.section,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {row(
            "previews",
            "Show message previews",
            "Show message preview in notification banner",
          )}
        </View>
        <Text
          style={[
            styles.intro,
            { color: colors.mutedForeground, marginTop: 20 },
          ]}
        >
          Turning off alerts won’t stop messages, gifts, or invitations from
          arriving.
        </Text>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
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
  intro: { fontSize: 14, lineHeight: 22, marginBottom: 20 },
  section: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    minHeight: 78,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 15, fontFamily: "Inter_500Medium" },
  detail: { fontSize: 12, lineHeight: 18 },
  heading: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
    marginTop: 26,
    marginBottom: 10,
    marginLeft: 4,
  },
  error: { color: "#FF4D67", marginBottom: 16, lineHeight: 22 },
});
