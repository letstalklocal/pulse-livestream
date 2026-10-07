import { GiftImageArtwork, hasGiftImage, hasLuxuryGiftAnimation, LuxuryGiftArtwork } from "@/components/GiftImageArtwork";
import { CrownArtwork } from "./CrownArtwork";
import { GiftComboBadge } from "./GiftComboBadge";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, AppState, Easing, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { GiftSnapshot } from "@/utils/giftCatalog";
import { RemoteGiftPlayer } from "./RemoteGiftPlayer";
import { RemoteGiftArtwork } from "./RemoteGiftArtwork";
import { prepareLocalCatalogGiftSound } from "@/utils/localCatalogGiftSound";

export interface FloatingGift {
  id: string;
  emoji: string;
  name: string;
  catalogId?: string;
  senderName: string;
  x: number;
  size: number;
  inVideo?: boolean;
  comboId?: string;
  comboCount?: number;
  comboLabel?: string;
  reduceMotion?: boolean;
  giftSnapshot?: GiftSnapshot;
  playbackAudio?: boolean;
}

interface Props {
  gift: FloatingGift;
  onDone: (id: string) => void;
  fullPageLuxury?: boolean;
}

// Visible top edges inside the existing 180 × 220 contain boxes, measured
// from each PNG's alpha bounds. Transparent margins differ between gifts.
const artworkTop: Record<string, number> = {
  Rose: 35, Heart: 54, Lips: 59, Strawberry: 29, Crown: 31,
};

export function GiftFloater({ gift, onDone, fullPageLuxury = false }: Props) {
  const { width, height } = useWindowDimensions();
  const artworkId = gift.catalogId ?? gift.name;
  const remoteAnimation = gift.giftSnapshot && (gift.giftSnapshot.animation || gift.giftSnapshot.androidAnimation || gift.giftSnapshot.iosAnimation);
  const fullPage = !!remoteAnimation && !gift.reduceMotion || fullPageLuxury && gift.giftSnapshot?.type !== "image" && hasLuxuryGiftAnimation(artworkId) && !gift.reduceMotion;
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const playbackUnavailable = useCallback(() => setPlaybackFailed(true), []);
  const blastOff = fullPage && artworkId === "luxury_rocket";
  const artworkSize = fullPage ? Math.round(width * (blastOff ? 1.12 : 1)) : 180;
  const artworkStyle = {
    width: artworkSize,
    height: fullPage ? Math.round(height * (blastOff ? 1.12 : 1)) : 220,
    opacity: gift.inVideo ? 0 : 1,
    ...(blastOff ? { position: "absolute" as const, left: -(artworkSize - width) / 2, top: -Math.round(height * 0.1) } : {}),
  };
  const visibleTop = artworkTop[gift.name] ?? 20;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.35)).current;
  const latest = useRef({ id: gift.id, onDone });
  latest.current = { id: gift.id, onDone };
  const playbackFinished = useCallback(() => latest.current.onDone(latest.current.id), []);

  useEffect(() => {
    if (!gift.playbackAudio || !gift.giftSnapshot?.sound || (remoteAnimation && !gift.reduceMotion)) return;
    let active = true;
    let localSound: Awaited<ReturnType<typeof prepareLocalCatalogGiftSound>> | null = null;
    void prepareLocalCatalogGiftSound(gift.giftSnapshot.sound).then(sound => {
      if (!active) { sound.stop(); return; }
      localSound = sound; sound.play();
    }).catch(() => {});
    const background = AppState.addEventListener("change", state => {
      if (state !== "active") { active = false; localSound?.stop(); }
    });
    return () => { active = false; localSound?.stop(); background.remove(); };
  }, [gift.playbackAudio, gift.giftSnapshot?.sound?.id, gift.giftSnapshot?.revisionId, !!remoteAnimation, gift.reduceMotion]);

  useEffect(() => {
    // Luxury SVGA owns its duration: show one complete playback, then let its
    // native onFinish remove the overlay. Only unavailable/static fallbacks
    // use the old floating timer, so errors cannot leave a permanent overlay.
    if (fullPage && !playbackFailed) {
      opacity.setValue(1);
      return;
    }
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
  }, [gift.comboCount, fullPage, playbackFailed]);

  return (
    <Animated.View
      style={[styles.wrapper, { ...(fullPage ? {} : { transform: [{ translateY }, { scale }] }), opacity }]}
      pointerEvents="none"
    >
      <View style={fullPage ? { width, height, alignItems: "center", justifyContent: "center" } : styles.giftFrame}>
      {remoteAnimation && gift.giftSnapshot && !gift.reduceMotion && !playbackFailed ? <RemoteGiftPlayer snapshot={gift.giftSnapshot} width={width} height={height} muted={!gift.playbackAudio} onFinish={playbackFinished} onUnavailable={playbackUnavailable} /> : gift.giftSnapshot?.thumbnail ? <RemoteGiftArtwork snapshot={gift.giftSnapshot} size={180} style={{ height: 220 }} /> : gift.name === "Crown" ? (
        <CrownArtwork size={180} style={{ height: 220, opacity: gift.inVideo ? 0 : 1 }} />
      ) : gift.giftSnapshot?.type !== "image" && hasLuxuryGiftAnimation(artworkId) && !gift.reduceMotion ? <LuxuryGiftArtwork gift={artworkId} size={artworkSize} style={artworkStyle} playOnce={fullPage} onFinish={fullPage ? playbackFinished : undefined} onPlaybackUnavailable={fullPage ? playbackUnavailable : undefined} /> : hasGiftImage(artworkId) ? <GiftImageArtwork gift={artworkId} size={180} style={{ height: 220, opacity: gift.inVideo ? 0 : 1 }} /> : <Text style={[styles.emoji, gift.inVideo && { opacity: 0 }]}>{gift.emoji}</Text>}
      {gift.comboCount != null && <View style={[styles.comboCorner, fullPage ? { top: 48 } : { bottom: 220 - visibleTop }]}><GiftComboBadge plain count={gift.comboCount} label={gift.comboLabel ?? `×${gift.comboCount}`} reduceMotion={gift.reduceMotion} /></View>}
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
