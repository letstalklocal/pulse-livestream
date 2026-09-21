import React, { useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GIFTS } from "./GiftPicker";
import { CrownArtwork } from "./CrownArtwork";
import { GoldCoinIcon } from "./GoldCoinIcon";
import { useAppLanguage } from "@/i18n";
import type { LiveSticker } from "@/utils/liveStickers";
export function LiveStickerCard({
  sticker,
  onPress,
  onDoublePress,
  disabled,
  showOwned = true,
}: {
  sticker: LiveSticker;
  onPress?: () => void;
  onDoublePress?: () => void;
  disabled?: boolean;
  showOwned?: boolean;
}) {
  const { t, appNumber } = useAppLanguage();
  const lastTap = useRef<number | null>(null);
  const press = () => {
    if (!onDoublePress) {
      onPress?.();
      return;
    }
    const now = Date.now();
    if (lastTap.current !== null && now - lastTap.current <= 300) {
      lastTap.current = null;
      onDoublePress();
    } else lastTap.current = now;
  };
  const gift = GIFTS.find((g) => g.id === sticker.giftId);
  const owned = showOwned && sticker.kind === "pack" && sticker.owned;
  return (
    <TouchableOpacity
      testID={`live-sticker-${sticker.id}`}
      style={styles.card}
      disabled={disabled || (!onPress && !onDoublePress)}
      onPress={press}
      accessibilityActions={
        onDoublePress
          ? [{ name: "activate", label: t("Sticker options") }]
          : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "activate") onDoublePress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${sticker.name}, ${owned ? t("View pack") : t("{v0} coins", { v0: sticker.price })}`}
    >
      <View style={styles.counts}>
        {sticker.kind === "pack" ? (
          <>
            <Text style={styles.text}>{appNumber(sticker.videos)}</Text>
            <Ionicons name="videocam" color="white" size={10.4} />
            <Text style={styles.text}>{appNumber(sticker.pictures)}</Text>
            <Ionicons name="image" color="white" size={10.4} />
          </>
        ) : (
          <Text style={styles.text} numberOfLines={1}>
            {gift?.name}
          </Text>
        )}
      </View>
      {gift?.id === "crown" ? (
        <CrownArtwork size={35.2} />
      ) : (
        <Text style={styles.gift}>{gift?.emoji}</Text>
      )}
      <View style={styles.price}>
        {owned ? (
          <Text style={styles.text}>{t("View pack")}</Text>
        ) : (
          <>
            <GoldCoinIcon size={12} />
            <Text style={styles.text}>{appNumber(sticker.price)}</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}
const styles = StyleSheet.create({
  card: {
    width: 64,
    aspectRatio: 5 / 7,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    borderRadius: 8,
  },
  counts: { flexDirection: "row", gap: 2.4, alignItems: "center", height: 16 },
  gift: { fontSize: 35.2, lineHeight: 44.8, includeFontPadding: false },
  price: { flexDirection: "row", alignItems: "center", gap: 3.2, minHeight: 16 },
  text: {
    color: "white",
    fontSize: 9.6,
    fontFamily: "Inter_600SemiBold",
    textShadowColor: "#000",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
