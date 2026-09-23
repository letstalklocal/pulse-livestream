import { GiftImageArtwork, hasGiftImage } from "@/components/GiftImageArtwork";
import { t, useAppLanguage, localizedTextStyle, appLocale } from "@/i18n";
import { CrownArtwork } from "./CrownArtwork";
import React, { useEffect, useState } from "react";
import { CoinStoreContent } from "./CoinStoreContent";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "./Avatar";

export interface Gift {
  id: string;
  emoji: string;
  name: string;
  coins: number;
  size: number;
}

export const GIFTS: Gift[] = [
  { id: "rose",    emoji: "🌹", name: "Rose",    coins: 1,   size: 36 },
  { id: "heart",   emoji: "❤️",  name: "Heart",   coins: 5,   size: 36 },
  { id: "party",   emoji: "🎉", name: "Party",   coins: 10,  size: 36 },
  { id: "strawberry", emoji: "🍓", name: "Strawberry", coins: 49, size: 36 },
  { id: "diamond", emoji: "💎", name: "Diamond", coins: 50,  size: 36 },
  { id: "lips", emoji: "💋", name: "Lips", coins: 99, size: 36 },
  { id: "rocket",  emoji: "🚀", name: "Rocket",  coins: 100, size: 40 },
  { id: "crown",   emoji: "👑", name: "Crown",   coins: 500, size: 36 },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSend: (gift: Gift) => void;
  coins: number;
  hintText?: string;
  /** Local animation preview only; never exposes purchases or a real wallet balance. */
  preview?: boolean;
  recipients?: Array<{ uid: number; name: string; avatarUrl?: string | null }>;
  recipientUid?: number;
  onRecipientChange?: (uid: number) => void;
}

export function GiftPicker({ visible, onClose, onSend, coins, recipients, recipientUid, onRecipientChange, hintText = "Select a gift, then tap Send.", preview = false }: Props) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const [buyingCoins, setBuyingCoins] = useState(false);
  const [selectedGiftId, setSelectedGiftId] = useState<string | null>(null);
  useEffect(() => { if (!visible) { setBuyingCoins(false); setSelectedGiftId(null); } }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => buyingCoins ? setBuyingCoins(false) : onClose()}
      statusBarTranslucent
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

      {buyingCoins && !preview ? <View style={styles.purchaseSheet}>
        <CoinStoreContent sheet onClose={() => setBuyingCoins(false)} />
      </View> : <View style={[styles.sheet, { paddingBottom: insets.bottom + (Platform.OS === "android" ? 32 : 16) }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={[localizedTextStyle(), styles.title]}>{t("Popular")}</Text>
          <TouchableOpacity style={styles.coinBadge} hitSlop={8} disabled={preview} onPress={() => setBuyingCoins(true)}
            accessibilityRole="button" accessibilityLabel={t(preview ? "Preview gifts" : "Buy Coins")} activeOpacity={0.75}>
            <Text style={styles.coinIcon}>🪙</Text>
            <Text style={[styles.coinCount, localizedTextStyle()]}>{preview ? t("Preview gifts") : coins === 0 ? t("Buy Coins") : coins.toLocaleString(appLocale())}</Text>
          </TouchableOpacity>
        </View>

        {recipients ? <View style={styles.recipients}>
          {recipients.map(person => <TouchableOpacity key={person.uid} style={[styles.recipient, person.uid === recipientUid && styles.selectedRecipient]} onPress={() => onRecipientChange?.(person.uid)} accessibilityRole="radio" accessibilityState={{ checked: person.uid === recipientUid }} accessibilityLabel={t("Send gifts to {v0}", { v0: person.name })}>
            <Avatar uid={person.uid} name={person.name} avatarUri={person.avatarUrl ?? undefined} size={28} />
            <Text style={styles.recipientName} numberOfLines={1}>{person.name}</Text>
          </TouchableOpacity>)}
        </View> : null}
        {/* Four columns; fit existing gifts, capped at three rows before scrolling. */}
        <ScrollView
          style={styles.gridViewport}
          showsVerticalScrollIndicator
          contentContainerStyle={styles.grid}
          keyboardShouldPersistTaps="handled"
        >
          {GIFTS.map((gift) => {
            const canAfford = preview || coins >= gift.coins;
            const selected = selectedGiftId === gift.id;
            const canSend = selected && canAfford;
            return (
              <View
                key={gift.id}
                style={[styles.giftCell, selected && styles.selectedGift, !canAfford && styles.giftCellDisabled]}
              >
                <TouchableOpacity
                  onPress={() => setSelectedGiftId(gift.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={gift.name}
                  style={styles.giftSelection}
                  activeOpacity={0.8}
                >
                <View style={styles.artwork}>
                  {gift.id === "crown" ? <CrownArtwork size={gift.size} /> : hasGiftImage(gift.id) ? <GiftImageArtwork gift={gift.id} size={gift.size} /> : <Text style={[styles.giftEmoji, { fontSize: gift.size }]}>{gift.emoji}</Text>}
                </View>
                <Text style={[styles.giftName, localizedTextStyle()]} numberOfLines={1}>{gift.name}</Text>
                <View style={styles.giftCost}>
                  <Text style={styles.coinIconSm}>🪙</Text>
                  <Text style={[styles.giftCoins, !canAfford && styles.giftCoinsDisabled]}>
                    {gift.coins}
                  </Text>
                </View>
                </TouchableOpacity>
                <TouchableOpacity
                  testID={`send-gift-${gift.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("Send")} ${gift.name}, ${gift.coins}`}
                  disabled={!canSend}
                  onPress={() => { if (canSend) onSend(gift); }}
                  style={[styles.sendButton, !canSend && styles.sendDisabled]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sendText, localizedTextStyle()]}>{t("Send")}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>

        {!preview && coins === 0 && (
          <Text style={[localizedTextStyle(), styles.hintEmpty]}>{t("Tap Buy Coins to top up.")}</Text>
        )}
        {hintText !== "Select a gift, then tap Send." && (
          <Text style={styles.hint}>{t(hintText)}</Text>
        )}
      </View>}
    </Modal>
  );
}

const styles = StyleSheet.create({
  purchaseSheet: { height: "85%", borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  recipients: { flexDirection: "row", gap: 8, marginBottom: 16 },
  recipient: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: "#444" },
  selectedRecipient: { borderColor: "#FF1966", backgroundColor: "rgba(255,25,102,0.12)" },
  recipientName: { flex: 1, color: "#FFF", fontSize: 13, fontFamily: "Inter_500Medium" },
  backdrop: {
    flex: 1,
    backgroundColor: "transparent",
  },
  sheet: {
    maxHeight: "40%",
    backgroundColor: "#111118",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 6,
    paddingHorizontal: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: 6,
  },
  header: {
    transform: [{ translateY: -4 }],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
    fontFamily: "Inter_700Bold",
  },
  coinBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
    gap: 4,
  },
  coinIcon: { fontSize: 14 },
  coinCount: {
    color: "#FFD700",
    fontWeight: "700",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  gridViewport: {
    maxHeight: 124 * Math.min(3, Math.ceil(GIFTS.length / 4)),
    flexGrow: 0,
    flexShrink: 1,
    marginBottom: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignContent: "flex-start",
    alignItems: "flex-start",
    rowGap: 8,
  },
  giftCell: {
    width: "25%",
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 12,
    overflow: "hidden",
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    alignItems: "center",
    gap: 1,
  },
  selectedGift: {
    borderColor: "#FF4D85",
    backgroundColor: "rgba(255,25,102,0.06)",
  },
  giftSelection: {
    paddingHorizontal: 4,
    alignSelf: "stretch",
    alignItems: "center",
    gap: 1,
  },
  sendDisabled: { opacity: 0.3 },
  sendButton: {
    minHeight: 20,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    backgroundColor: "#FF1966",
    marginTop: 3,
  },
  sendText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  giftCellDisabled: {
    opacity: 0.4,
  },
  artwork: {
    height: 44,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  giftEmoji: {
    lineHeight: 44,
    includeFontPadding: false,
  },
  giftName: {
    color: "#FFF",
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  giftCost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  coinIconSm: { fontSize: 11 },
  giftCoins: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  giftCoinsDisabled: {
    color: "rgba(255,215,0,0.5)",
  },
  hint: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 11,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    marginBottom: 4,
  },
  hintEmpty: {
    color: "#FF1966",
    fontSize: 12,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
    marginBottom: 4,
  },
});
