import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAppLanguage } from "@/i18n";
import {
  useNotificationHistory,
  type HistoryNotification,
} from "@/hooks/useNotificationHistory";
import { CreatorVideoSheet } from "@/components/CreatorVideoSheet";

export default function Notifications() {
  const { t, localizedTextStyle, appLocale } = useAppLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const history = useNotificationHistory();
  const [videoOwner, setVideoOwner] = useState<string | null>(null);
  const { refetch } = history;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const open = async (item: HistoryNotification) => {
    try {
      await history.change.mutateAsync({ id: item.id, action: "read" });
      if (item.category === "videoProcessing")
        setVideoOwner(history.userId ?? null);
      else router.push(item.route as any);
    } catch {
      /* The visible error keeps the action retryable. */
    }
  };
  if (!history.userId) return <Redirect href="/(auth)/sign-in" />;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: Platform.OS === "web" ? 67 : insets.top,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 16,
          gap: 12,
        }}
      >
        <TouchableOpacity
          accessibilityLabel={t("Back")}
          onPress={() => router.back()}
          style={{ padding: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text
          style={[
            localizedTextStyle(),
            {
              flex: 1,
              color: colors.foreground,
              fontSize: 22,
              fontFamily: "Inter_700Bold",
            },
          ]}
        >
          {t("Notifications")}
        </Text>
        <TouchableOpacity
          disabled={!history.notifications.length || history.change.isPending}
          onPress={() => history.change.mutate({ action: "clear" })}
          style={{
            padding: 8,
            opacity: history.notifications.length ? 1 : 0.4,
          }}
        >
          <Text style={[localizedTextStyle(), { color: colors.primary }]}>
            {t("Clear all")}
          </Text>
        </TouchableOpacity>
      </View>
      {(history.isError || history.change.isError) && (
        <TouchableOpacity
          onPress={() => {
            history.change.reset();
            void history.refetch();
          }}
          style={{ padding: 16 }}
        >
          <Text
            accessibilityRole="alert"
            style={[localizedTextStyle(), { color: colors.foreground }]}
          >
            {t("Something went wrong. Please try again.")} {t("Retry")}
          </Text>
        </TouchableOpacity>
      )}
      {history.isPending ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <FlatList
          data={history.notifications}
          keyExtractor={(item) => String(item.id)}
          refreshing={history.isRefetching}
          onRefresh={() => {
            void history.refetch();
          }}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 24,
            flexGrow: 1,
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 48, gap: 16 }}>
              <Ionicons
                name="notifications-outline"
                size={40}
                color={colors.mutedForeground}
              />
              <Text
                style={[
                  localizedTextStyle(),
                  { color: colors.mutedForeground },
                ]}
              >
                {t("No notifications yet")}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                borderBottomWidth: 0.5,
                borderColor: colors.border,
                backgroundColor: item.read ? colors.background : colors.card,
              }}
            >
              <TouchableOpacity
                disabled={history.change.isPending}
                onPress={() => void open(item)}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 18,
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: item.read ? "transparent" : colors.primary,
                  }}
                />
                <View style={{ flex: 1, gap: 6 }}>
                  <Text
                    style={[
                      localizedTextStyle(),
                      {
                        color: colors.foreground,
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 15,
                      },
                    ]}
                  >
                    {t(item.title)}
                  </Text>
                  <Text
                    style={[
                      localizedTextStyle(),
                      { color: colors.mutedForeground, lineHeight: 20 },
                    ]}
                  >
                    {t(item.body)}
                  </Text>
                  <Text
                    style={[
                      localizedTextStyle(),
                      { color: colors.mutedForeground, fontSize: 11 },
                    ]}
                  >
                    {new Date(item.createdAt).toLocaleString(appLocale())}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel={t("Delete")}
                disabled={history.change.isPending}
                onPress={() =>
                  history.change.mutate({ id: item.id, action: "delete" })
                }
                style={{ padding: 14 }}
              >
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            </View>
          )}
          ListFooterComponent={
            history.hasNextPage ? (
              <TouchableOpacity
                disabled={history.isFetchingNextPage}
                onPress={() => void history.fetchNextPage()}
                style={{ padding: 20, alignItems: "center" }}
              >
                {history.isFetchingNextPage ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text
                    style={[localizedTextStyle(), { color: colors.primary }]}
                  >
                    {t("Load more")}
                  </Text>
                )}
              </TouchableOpacity>
            ) : null
          }
        />
      )}
      {videoOwner === history.userId && (
        <CreatorVideoSheet visible onClose={() => setVideoOwner(null)} />
      )}
    </View>
  );
}
