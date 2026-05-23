import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

export interface FloatingGift {
  id: string;
  emoji: string;
  name: string;
  senderName: string;
  x: number;
  size: number;
  hero?: boolean;
}

interface Props {
  gift: FloatingGift;
  bottomOffset: number;
  onDone: (id: string) => void;
}

export function GiftFloater({ gift, bottomOffset, onDone }: Props) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(gift.hero ? 0.4 : 0.2)).current;

  useEffect(() => {
    if (gift.hero) {
      Animated.sequence([
        // Pop in with big bounce
        Animated.parallel([
          Animated.spring(scale, {
            toValue: 1.15,
            tension: 220,
            friction: 6,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
        ]),
        // Settle back
        Animated.spring(scale, {
          toValue: 1,
          tension: 300,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.delay(1400),
        // Float up and fade
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -160,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => onDone(gift.id));
    } else {
      Animated.sequence([
        Animated.parallel([
          Animated.spring(scale, {
            toValue: 1,
            tension: 180,
            friction: 7,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(1000),
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -200,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => onDone(gift.id));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gift.hero) {
    return (
      <Animated.View
        style={[
          styles.heroWrapper,
          { bottom: bottomOffset + 80, transform: [{ translateY }, { scale }], opacity },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.heroEmoji}>{gift.emoji}</Text>
        <View style={styles.heroLabel}>
          <Text style={styles.heroSender} numberOfLines={1}>{gift.senderName}</Text>
          <Text style={styles.heroName}>sent a {gift.name}!</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.floater,
        { bottom: bottomOffset, left: gift.x, transform: [{ translateY }, { scale }], opacity },
      ]}
      pointerEvents="none"
    >
      <Text style={[styles.emoji, { fontSize: gift.size }]}>{gift.emoji}</Text>
      <View style={styles.label}>
        <Text style={styles.sender} numberOfLines={1}>{gift.senderName}</Text>
        <Text style={styles.name}>{gift.name}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /* ── Hero (user's own gift) ── */
  heroWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 8,
  },
  heroEmoji: {
    fontSize: 90,
    textShadowColor: "rgba(255,25,102,0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
    lineHeight: 110,
  },
  heroLabel: {
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    borderColor: "rgba(255,25,102,0.3)",
  },
  heroSender: {
    color: "#FF1966",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  heroName: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },

  /* ── Small viewer floaters ── */
  floater: {
    position: "absolute",
    alignItems: "center",
    gap: 4,
  },
  emoji: {
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  label: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignItems: "center",
  },
  sender: {
    color: "#FFD700",
    fontSize: 10,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    maxWidth: 80,
  },
  name: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
});
