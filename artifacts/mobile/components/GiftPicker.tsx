import { GiftImageArtwork, hasGiftImage, hasLuxuryGiftAnimation, LuxuryGiftArtwork } from "@/components/GiftImageArtwork";
import { t, useAppLanguage, localizedTextStyle, appLocale } from "@/i18n";
import { CrownArtwork } from "./CrownArtwork";
import { GoldCoinIcon } from "./GoldCoinIcon";
import React, { useEffect, useState } from "react";
import { CoinStoreContent } from "./CoinStoreContent";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
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

export const POPULAR_GIFTS: Gift[] = [
  { id: "rose",    emoji: "🌹", name: "Rose",    coins: 1,   size: 36 },
  { id: "heart",   emoji: "❤️",  name: "Heart",   coins: 5,   size: 36 },
  { id: "party",   emoji: "🎉", name: "Party",   coins: 10,  size: 36 },
  { id: "strawberry", emoji: "🍓", name: "Strawberry", coins: 49, size: 36 },
  { id: "diamond", emoji: "💎", name: "Diamond", coins: 50,  size: 36 },
  { id: "lips", emoji: "💋", name: "Lips", coins: 99, size: 36 },
  { id: "rocket",  emoji: "🚀", name: "Rocket",  coins: 100, size: 40 },
  { id: "crown",   emoji: "👑", name: "Crown",   coins: 500, size: 36 },
];

export const LUXURY_GIFTS: Gift[] = [
  { id: "kisses", emoji: "💋", name: "Kisses", coins: 1_999, size: 44 },
  { id: "luxury_rocket", emoji: "🚀", name: "Blast Off", coins: 4_999, size: 44 },
  { id: "dragon", emoji: "🐉", name: "Dragon", coins: 9_999, size: 44 },
];

// Shared ordinary gift, sticker and pack catalog. Premium/private requirements
// intentionally retain POPULAR_GIFTS.
export const GIFTS: Gift[] = [...POPULAR_GIFTS, ...LUXURY_GIFTS];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSend: (gift: Gift) => void;
  coins: number;
  hintText?: string;
  /** Optional caller-owned pending feedback; payment remains server-confirmed. */
  sendingGiftId?: string | null;
  /** Optional touch-through feedback above this native modal's drawer. */
  feedbackOverlay?: React.ReactNode;
  /** Optional measured sheet size for message-area clearance in DMs. */
  onDrawerHeightChange?: (height: number) => void;
  /** Local animation preview only; never exposes purchases or a real wallet balance. */
  preview?: boolean;
  recipients?: Array<{ uid: number; name: string; avatarUrl?: string | null }>;
  recipientUid?: number;
  onRecipientChange?: (uid: number) => void;
}

export function GiftPicker({ visible, onClose, onSend, coins, recipients, recipientUid, onRecipientChange, hintText = "Select a gift, then tap Send.", preview = false, sendingGiftId, feedbackOverlay, onDrawerHeightChange }: Props) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [buyingCoins, setBuyingCoins] = useState(false);
  const [selectedGiftId, setSelectedGiftId] = useState<string | null>(null);
  const [activeGiftTab, setActiveGiftTab] = useState<"popular" | "luxury">("popular");
  const [popularGridHeight, setPopularGridHeight] = useState<number | undefined>();
  const displayedGifts = activeGiftTab === "luxury" ? LUXURY_GIFTS : POPULAR_GIFTS;
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
      </View> : <View onLayout={onDrawerHeightChange ? (event) => onDrawerHeightChange(event.nativeEvent.layout.height) : undefined} style={[styles.sheet, { maxHeight: windowHeight * 0.4 + 10, paddingBottom: Platform.OS === "android" ? Math.max(insets.bottom, 32) : insets.bottom + 16 }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.giftTabs} accessibilityRole="tablist">
            <TouchableOpacity testID="gift-tab-popular" onPress={() => { setActiveGiftTab("popular"); setSelectedGiftId(null); }} accessibilityRole="tab" accessibilityState={{ selected: activeGiftTab === "popular" }}>
              <Text style={[localizedTextStyle(), styles.title, activeGiftTab !== "popular" && styles.inactiveTitle]}>{t("Popular")}</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="gift-tab-luxury" onPress={() => { setActiveGiftTab("luxury"); setSelectedGiftId(null); }} accessibilityRole="tab" accessibilityState={{ selected: activeGiftTab === "luxury" }}>
              <Text style={[localizedTextStyle(), styles.title, activeGiftTab !== "luxury" && styles.inactiveTitle]}>{t("Luxury")}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.coinBadge} hitSlop={8} disabled={preview} onPress={() => setBuyingCoins(true)}
            accessibilityRole="button" accessibilityLabel={t(preview ? "Preview gifts" : "Buy Coins")} activeOpacity={0.75}>
            <GoldCoinIcon size={14} />
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
          style={[styles.gridViewport, { maxHeight: 124 * Math.min(3, Math.ceil(Math.max(POPULAR_GIFTS.length, displayedGifts.length) / 4)), height: activeGiftTab === "luxury" ? popularGridHeight : undefined }]}
          onLayout={event => { if (activeGiftTab === "popular") setPopularGridHeight(event.nativeEvent.layout.height); }}
          showsVerticalScrollIndicator
          contentContainerStyle={styles.grid}
          keyboardShouldPersistTaps="handled"
        >
          {displayedGifts.map((gift) => {
            const canAfford = preview || coins >= gift.coins;
            const selected = selectedGiftId === gift.id;
            const sending = sendingGiftId === gift.id;
            const canSend = selected && canAfford && !sendingGiftId;
            return (
              <View
                key={gift.id}
                style={styles.giftSlot}
              >
              <TouchableOpacity
                  testID={`send-gift-${gift.id}`}
                  disabled={!!sendingGiftId}
                  onPress={() => {
                    if (sendingGiftId) return;
                    if (canSend) onSend(gift);
                    else setSelectedGiftId(gift.id);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: !!sendingGiftId, busy: sending }}
                  accessibilityLabel={sending ? `${t("Sending…")} ${gift.name}` : selected && canAfford ? `${t("Send")} ${gift.name}, ${gift.coins}` : gift.name}
                  style={[styles.giftCell, selected && styles.selectedGift, !canAfford && styles.giftCellDisabled]}
                  activeOpacity={0.8}
                >
                  <View pointerEvents="none" style={styles.giftSelection}>
                    <View style={styles.artwork}>
                      {gift.id === "crown" ? <CrownArtwork size={gift.size} /> : hasLuxuryGiftAnimation(gift.id) ? <LuxuryGiftArtwork gift={gift.id} size={gift.size} /> : hasGiftImage(gift.id) ? <GiftImageArtwork gift={gift.id} size={gift.size} /> : <Text style={[styles.giftEmoji, { fontSize: gift.size }]}>{gift.emoji}</Text>}
                    </View>
                    <Text style={[styles.giftName, localizedTextStyle()]} numberOfLines={1}>{gift.name}</Text>
                    <View style={styles.giftCost}>
                      <GoldCoinIcon size={11} />
                      <Text style={[styles.giftCoins, !canAfford && styles.giftCoinsDisabled]}>
                        {gift.coins}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.sendButton, !canSend && !sending && styles.sendDisabled]}>
                  <Text style={[styles.sendText, localizedTextStyle()]}>{t(sending ? "Sending…" : "Send")}</Text>
                  </View>
              </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>

      </View>}
      {feedbackOverlay ? <View pointerEvents="none" style={StyleSheet.absoluteFill}>{feedbackOverlay}</View> : null}
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
  inactiveTitle: { color: "rgba(255,255,255,0.45)" },
  giftTabs: { flexDirection: "row", alignItems: "center", gap: 16 },
  coinBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
    gap: 4,
  },
  coinCount: {
    color: "#FFD700",
    fontWeight: "700",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  gridViewport: {
    flexGrow: 0,
    flexShrink: 1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignContent: "flex-start",
    alignItems: "flex-start",
    rowGap: 8,
  },
  giftSlot: {
    width: "25%",
    paddingHorizontal: 2,
  },
  giftCell: {
    width: "100%",
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
  giftCoins: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  giftCoinsDisabled: {
    color: "rgba(255,215,0,0.5)",
  },
});
