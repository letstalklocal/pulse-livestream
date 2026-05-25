import React from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  { id: "diamond", emoji: "💎", name: "Diamond", coins: 50,  size: 40 },
  { id: "rocket",  emoji: "🚀", name: "Rocket",  coins: 100, size: 40 },
  { id: "crown",   emoji: "👑", name: "Crown",   coins: 500, size: 44 },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSend: (gift: Gift) => void;
  coins: number;
}

export function GiftPicker({ visible, onClose, onSend, coins }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Send a Gift</Text>
          <View style={styles.coinBadge}>
            <Text style={styles.coinIcon}>🪙</Text>
            <Text style={styles.coinCount}>{coins.toLocaleString()}</Text>
          </View>
        </View>

        {/* Gift row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {GIFTS.map((gift) => {
            const canAfford = coins >= gift.coins;
            return (
              <TouchableOpacity
                key={gift.id}
                style={[styles.giftCell, !canAfford && styles.giftCellDisabled]}
                onPress={() => canAfford && onSend(gift)}
                activeOpacity={0.7}
              >
                <Text style={[styles.giftEmoji, { fontSize: gift.size }]}>{gift.emoji}</Text>
                <Text style={styles.giftName}>{gift.name}</Text>
                <View style={styles.giftCost}>
                  <Text style={styles.coinIconSm}>🪙</Text>
                  <Text style={[styles.giftCoins, !canAfford && styles.giftCoinsDisabled]}>
                    {gift.coins}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {coins === 0 ? (
          <Text style={styles.hintEmpty}>You're out of coins — top up from your profile</Text>
        ) : (
          <Text style={styles.hint}>Tap a gift to send it live</Text>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    backgroundColor: "#111118",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
    fontFamily: "Inter_700Bold",
  },
  coinBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,215,0,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  coinIcon: { fontSize: 14 },
  coinCount: {
    color: "#FFD700",
    fontWeight: "700",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  row: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 2,
    marginBottom: 16,
  },
  giftCell: {
    width: 78,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  giftCellDisabled: {
    opacity: 0.4,
  },
  giftEmoji: {
    lineHeight: 52,
  },
  giftName: {
    color: "#FFF",
    fontSize: 12,
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
