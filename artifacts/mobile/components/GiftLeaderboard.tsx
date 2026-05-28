import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useGetStreamLeaderboard } from "@workspace/api-client-react";

const MEDAL = ["🥇", "🥈", "🥉"];

interface Props {
  channelId: string;
  visible: boolean;
  onClose: () => void;
}

export function GiftLeaderboard({ channelId, visible, onClose }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(30)).current;

  const { data } = useGetStreamLeaderboard(channelId, {
    query: { enabled: visible && !!channelId, refetchInterval: 10000 } as any,
  });
  const entries = data?.entries ?? [];

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      opacity.setValue(0);
      translateY.setValue(30);
    }
  }, [visible, opacity, translateY]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <Animated.View style={[styles.sheet, { opacity, transform: [{ translateY }] }]}>
              <View style={styles.header}>
                <Text style={styles.title}>🏆 Top Gifters</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              </View>

              {entries.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyIcon}>🎁</Text>
                  <Text style={styles.emptyText}>No gifts sent yet</Text>
                  <Text style={styles.emptySub}>Be the first to send a gift!</Text>
                </View>
              ) : (
                entries.map((entry) => (
                  <View key={entry.uid} style={styles.row}>
                    <Text style={styles.medal}>
                      {entry.rank <= 3 ? MEDAL[entry.rank - 1] : `${entry.rank}`}
                    </Text>
                    <Text style={styles.name} numberOfLines={1}>{entry.name}</Text>
                    <View style={styles.coinPill}>
                      <Text style={styles.coinText}>🪙 {entry.coins.toLocaleString()}</Text>
                    </View>
                  </View>
                ))
              )}
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#111118",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: "rgba(255,25,102,0.2)",
    minHeight: 200,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    gap: 12,
  },
  medal: {
    fontSize: 22,
    width: 34,
    textAlign: "center",
    color: "#FFF",
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
  },
  name: {
    flex: 1,
    color: "#FFF",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
  },
  coinPill: {
    backgroundColor: "rgba(255,25,102,0.15)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(255,25,102,0.3)",
  },
  coinText: {
    color: "#FF1966",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
  },
  emptyIcon: { fontSize: 40 },
  emptyText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  emptySub: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
