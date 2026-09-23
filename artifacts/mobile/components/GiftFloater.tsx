import { GiftImageArtwork, hasGiftImage } from "@/components/GiftImageArtwork";
import { CrownArtwork } from "./CrownArtwork";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text } from "react-native";

export interface FloatingGift {
  id: string;
  emoji: string;
  name: string;
  senderName: string;
  x: number;
  size: number;
  inVideo?: boolean;
}

interface Props {
  gift: FloatingGift;
  onDone: (id: string) => void;
}

export function GiftFloater({ gift, onDone }: Props) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.sequence([
      // Winner-style timing with a gentler overshoot for gift artwork.
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.25,
            duration: 320,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
            isInteraction: false,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 650,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
            isInteraction: false,
          }),
        ]),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(1100),
      // Float up — grows slightly as it rises so the exit feels like a continuation
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -150,
          duration: 720,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.12,
          duration: 720,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 720,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]);
    animation.start(({ finished }) => { if (finished) onDone(gift.id); });
    return () => animation.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[styles.wrapper, { transform: [{ translateY }, { scale }], opacity }]}
      pointerEvents="none"
    >
      {gift.name === "Crown" ? (
        <CrownArtwork size={180} style={{ height: 220, opacity: gift.inVideo ? 0 : 1 }} />
      ) : hasGiftImage(gift.name) ? <GiftImageArtwork gift={gift.name} size={180} style={{ height: 220, opacity: gift.inVideo ? 0 : 1 }} /> : <Text style={[styles.emoji, gift.inVideo && { opacity: 0 }]}>{gift.emoji}</Text>}
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
  },
  emoji: {
    fontSize: 180,
    lineHeight: 220,
    textShadowColor: "rgba(255,25,102,0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
});
