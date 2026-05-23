import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

export interface FloatingGift {
  id: string;
  emoji: string;
  name: string;
  senderName: string;
  x: number;
}

interface Props {
  gift: FloatingGift;
  bottomOffset: number;
  onDone: (id: string) => void;
}

export function GiftFloater({ gift, bottomOffset, onDone }: Props) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1.1,
          tension: 200,
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
      Animated.delay(1200),
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -180,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 850,
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
        { bottom: bottomOffset, left: gift.x, transform: [{ translateY }, { scale }], opacity },
      ]}
      pointerEvents="none"
    >
      <Text style={styles.emoji}>{gift.emoji}</Text>
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
    gap: 6,
  },
  emoji: {
    fontSize: 64,
    lineHeight: 76,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  label: {
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: "center",
    gap: 1,
  },
  sender: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    maxWidth: 100,
  },
  name: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
