import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

export interface FloatingGift {
  id: string;
  emoji: string;
  name: string;
  senderName: string;
  x: number;
  size: number;
}

interface Props {
  gift: FloatingGift;
  onDone: (id: string) => void;
}

export function GiftFloater({ gift, onDone }: Props) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.sequence([
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
      Animated.spring(scale, {
        toValue: 1,
        tension: 300,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.delay(1400),
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[styles.wrapper, { transform: [{ translateY }, { scale }], opacity }]}
      pointerEvents="none"
    >
      <Text style={styles.emoji}>{gift.emoji}</Text>
      <View style={styles.label}>
        <Text style={styles.sender} numberOfLines={1}>{gift.senderName}</Text>
        <Text style={styles.name}>sent a {gift.name}!</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emoji: {
    fontSize: 90,
    lineHeight: 110,
    textShadowColor: "rgba(255,25,102,0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  label: {
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    borderColor: "rgba(255,25,102,0.3)",
  },
  sender: {
    color: "#FF1966",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  name: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
