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
  bottomOffset: number;
  onDone: (id: string) => void;
}

export function GiftFloater({ gift, bottomOffset, onDone }: Props) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.2)).current;

  useEffect(() => {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[
        styles.floater,
        {
          bottom: bottomOffset,
          left: gift.x,
          transform: [{ translateY }, { scale }],
          opacity,
        },
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
