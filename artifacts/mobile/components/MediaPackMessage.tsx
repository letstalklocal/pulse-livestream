import { MediaPackGallery } from "./MediaPackGallery";
import { t, useAppLanguage, localizedTextStyle } from "@/i18n";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
// @ts-ignore generated media-pack hooks
import {
  getGetCoinBalanceQueryKey,
  useGetMediaPack,
  useUnlockMediaPack,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const key = () => `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
export function MediaPackMessage({
  packId,
  mine,
  read = false,
}: {
  packId: string;
  mine: boolean;
  read?: boolean;
}) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const colors = useColors();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [gallery, setGallery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = Math.min(280, screenWidth * 0.6);
  const mediaWidth = cardWidth - 28;
  const packQuery = (useGetMediaPack as any)(packId, {
    query: { refetchOnWindowFocus: false },
  } as any);
  const unlock = useUnlockMediaPack();
  const pack = ((packQuery.data as any)?.pack ?? packQuery.data) as any;
  if (packQuery.isLoading)
    return (
      <View
        style={[
          styles.card,
          { width: cardWidth, backgroundColor: colors.card },
        ]}
      >
        <Text style={[localizedTextStyle(), { color: colors.mutedForeground }]}>
          {t("Loading media pack…")}
        </Text>
      </View>
    );
  if (!pack)
    return (
      <View
        style={[
          styles.card,
          { width: cardWidth, backgroundColor: colors.card },
        ]}
      >
        <Text style={[localizedTextStyle(), { color: colors.mutedForeground }]}>
          {t("Media pack unavailable")}
        </Text>
      </View>
    );
  const visible = mine || pack.unlocked || pack.isOwner;
  const unlockPack = async () => {
    setError(null);
    try {
      const result = await unlock.mutateAsync({
        packId,
        data: { idempotencyKey: key(), expectedPrice: pack.price },
      } as any);
      if (user?.uid && (result as any).balance != null)
        qc.setQueryData(getGetCoinBalanceQueryKey({ uid: user.uid }), {
          balance: (result as any).balance,
        });
      await packQuery.refetch();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not unlock this media pack.",
      );
      void packQuery.refetch();
    }
  };
  const confirmUnlock = () => {
    Alert.alert(
      t("Unlock media pack?"),
      t(
        "This will deduct {v0} coins from your balance. You can view these {v1} items again after unlocking.",
        { v0: pack.price, v1: pack.itemCount },
      ),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Unlock for {v0}", { v0: pack.price }),
          onPress: () => void unlockPack(),
        },
      ],
    );
  };
  const preview =
    (pack.items ?? []).find((item: any) => item.previewUrl) ?? pack.items?.[0];
  const items = pack.items ?? [];
  const photos = items.filter((item: any) => item.mediaType === "image").length;
  const videos = items.filter((item: any) => item.mediaType === "video").length;
  return (
    <View
      style={[
        styles.card,
        {
          width: cardWidth,
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.name, { color: colors.foreground }]}
      >
        {pack.name}
      </Text>
      <View style={styles.counts}>
        <Ionicons
          name="image-outline"
          size={15}
          color={colors.mutedForeground}
        />
        <Text style={[styles.count, { color: colors.mutedForeground }]}>
          {appNumber(photos)}
        </Text>
        <Ionicons
          name="videocam-outline"
          size={16}
          color={colors.mutedForeground}
        />
        <Text style={[styles.count, { color: colors.mutedForeground }]}>
          {appNumber(videos)}
        </Text>
      </View>
      <View style={styles.preview}>
        {visible ? (
          <FlatList
            key={mediaWidth}
            testID="pack-media-slides"
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={items}
            keyExtractor={(item: any) => item.id}
            getItemLayout={(_, index) => ({
              length: mediaWidth,
              offset: mediaWidth * index,
              index,
            })}
            renderItem={({ item }: any) => (
              <TouchableOpacity
                onPress={() => setGallery(true)}
                testID={`media-item-${item.id}`}
                style={[styles.tile, { width: mediaWidth }]}
              >
                {item.mediaType === "image" && item.mediaUrl ? (
                  <Image
                    source={{ uri: item.mediaUrl }}
                    style={styles.asset}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.asset, styles.video]}>
                    <Ionicons name="videocam" size={30} color="#FFF" />
                  </View>
                )}
              </TouchableOpacity>
            )}
          />
        ) : (
          <>
            {preview?.mediaType === "image" && preview?.previewUrl ? (
              <Image
                source={{ uri: preview.previewUrl }}
                style={styles.asset}
                blurRadius={28}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.asset, styles.video]}>
                <Ionicons name="images" size={28} color="#FFF" />
              </View>
            )}
            <View style={styles.previewShade}>
              <Ionicons name="lock-closed" size={22} color="#FFF" />
            </View>
          </>
        )}
      </View>
      <View style={styles.priceRow}>
        <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>
          {visible ? (mine ? t("Sent pack") : t("Unlocked")) : t("Price")}
        </Text>
        <Text style={[localizedTextStyle(), styles.price]}>
          {t("🪙 {v0} coins", { v0: pack.price })}
        </Text>
      </View>
      {!visible && (
        <>
          {error ? (
            <Text numberOfLines={2} style={styles.error}>
              {t(error)}
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={confirmUnlock}
            disabled={unlock.isPending}
            testID={`pack-unlock-${packId}`}
            style={styles.unlock}
          >
            <Text style={[localizedTextStyle(), styles.unlockText]}>
              {unlock.isPending
                ? t("Unlocking…")
                : t("Unlock for {v0} coins", { v0: pack.price })}
            </Text>
          </TouchableOpacity>
        </>
      )}
      {mine && (
        <Ionicons
          name="checkmark-done"
          size={16}
          color={read ? colors.primary : colors.mutedForeground}
          accessibilityLabel={read ? t("Read") : t("Sent")}
          style={{ alignSelf: "flex-end" }}
        />
      )}
      {gallery && (
        <MediaPackGallery items={items} onClose={() => setGallery(false)} />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    aspectRatio: 5 / 7,
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
    gap: 8,
    overflow: "hidden",
  },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  counts: { flexDirection: "row", alignItems: "center", gap: 5 },
  count: { fontFamily: "Inter_400Regular", fontSize: 12, marginRight: 7 },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  priceLabel: { fontFamily: "Inter_500Medium", fontSize: 12 },
  price: { color: "#FFD700", fontFamily: "Inter_700Bold", fontSize: 14 },
  error: { color: "#FF6B81", fontFamily: "Inter_400Regular", fontSize: 12 },
  preview: {
    flex: 1,
    minHeight: 0,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
  },
  asset: { width: "100%", height: "100%" },
  previewShade: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,10,20,.18)",
  },
  unlock: {
    backgroundColor: "#FFD700",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  unlockText: { color: "#15100A", fontFamily: "Inter_700Bold", fontSize: 14 },
  tile: { height: "100%", flexShrink: 0, overflow: "hidden" },
  video: {
    backgroundColor: "#292945",
    alignItems: "center",
    justifyContent: "center",
  },
});
