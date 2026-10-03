import { GiftImageArtwork, hasGiftImage } from "@/components/GiftImageArtwork";
import { CrownArtwork } from "./CrownArtwork";
import { GiftComboBadge } from "./GiftComboBadge";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

export interface FloatingGift {
  id: string;
  emoji: string;
  name: string;
  senderName: string;
  x: number;
  size: number;
  inVideo?: boolean;
  comboId?: string;
  comboCount?: number;
  comboLabel?: string;
  reduceMotion?: boolean;
}

interface Props {
  gift: FloatingGift;
  onDone: (id: string) => void;
}

// Visible top edges inside the existing 180 × 220 contain boxes, measured
// from each PNG's alpha bounds. Transparent margins differ between gifts.
const artworkTop: Record<string, number> = {
  Rose: 35, Heart: 54, Lips: 59, Strawberry: 29, Crown: 31,
};

export function GiftFloater({ gift, onDone }: Props) {
  const visibleTop = artworkTop[gift.name] ?? 20;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.35)).current;
  const latest = useRef({ id: gift.id, onDone });
  latest.current = { id: gift.id, onDone };

  useEffect(() => {
    const continuing = (gift.comboCount ?? 1) > 1;
    // Combo updates reuse this mounted gift. Stop the entrance/exit and hold
    // the artwork steady until two seconds pass without another paid gift.
    if (continuing) {
      translateY.setValue(0);
      opacity.setValue(1);
      scale.setValue(1);
    }
    const animation = Animated.sequence([
      // Winner-style timing with a gentler overshoot for gift artwork.
      ...(continuing ? [] : [Animated.parallel([
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
      ])]),
      Animated.delay(continuing ? 2000 : 1100),
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
    animation.start(({ finished }) => { if (finished) latest.current.onDone(latest.current.id); });
    return () => animation.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gift.comboCount]);

  return (
    <Animated.View
      style={[styles.wrapper, { transform: [{ translateY }, { scale }], opacity }]}
      pointerEvents="none"
    >
      <View style={styles.giftFrame}>
      {gift.name === "Crown" ? (
        <CrownArtwork size={180} style={{ height: 220, opacity: gift.inVideo ? 0 : 1 }} />
      ) : hasGiftImage(gift.name) ? <GiftImageArtwork gift={gift.name} size={180} style={{ height: 220, opacity: gift.inVideo ? 0 : 1 }} /> : <Text style={[styles.emoji, gift.inVideo && { opacity: 0 }]}>{gift.emoji}</Text>}
      {gift.comboCount != null && <View style={[styles.comboCorner, { bottom: 220 - visibleTop }]}><GiftComboBadge plain count={gift.comboCount} label={gift.comboLabel ?? `×${gift.comboCount}`} reduceMotion={gift.reduceMotion} /></View>}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  giftFrame: { width: 220, height: 220, alignItems: "center", justifyContent: "center" },
  comboCorner: { position: "absolute", alignSelf: "center", marginBottom: 6 },
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
