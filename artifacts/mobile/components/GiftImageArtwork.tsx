import { Asset } from "expo-asset";
import React, { useEffect, useRef, useState } from "react";
import { Image, Platform, StyleSheet, type ImageStyle, type StyleProp } from "react-native";
import { useAppLanguage } from "@/i18n";
const artwork = {
  rose: { source: require("../assets/gifts/rose.png"), label: "Rose" },
  heart: { source: require("../assets/gifts/heart.png"), label: "Heart" },
  lips: { source: require("../assets/gifts/lips.png"), label: "Lips" },
  strawberry: { source: require("../assets/gifts/strawberry.png"), label: "Strawberry" },
  kisses: { source: require("../assets/gifts/luxury/kisses.png"), label: "Kisses" },
  luxury_rocket: { source: require("../assets/gifts/luxury/blast-off.png"), label: "Blast Off" },
  dragon: { source: require("../assets/gifts/luxury/fiery-dragon.png"), label: "Dragon" },
};
const luxuryAnimations = {
  kisses: require("../assets/gifts/luxury/Virtual-Kiss-Gift.svga"),
  luxury_rocket: require("../assets/gifts/luxury/Blast-Off-Gift.svga"),
  dragon: require("../assets/gifts/luxury/Fiery-Dragon-Gift.svga"),
};

type SvgaPlayerComponent = React.ComponentType<{
  source: string;
  loops?: number;
  muteBuiltInAudio?: boolean;
  style?: StyleProp<ImageStyle>;
  onError?: () => void;
  onFinish?: () => void;
}>;

// Do not import the native player at module scope. Existing development/store
// clients do not contain its Nitro module yet, and would otherwise crash before
// this component has a chance to use the complete static preview fallback.
let svgaPlayer: SvgaPlayerComponent | null | undefined;

function getSvgaPlayer(): SvgaPlayerComponent | null {
  if (Platform.OS === "web") return null;
  if (svgaPlayer !== undefined) return svgaPlayer;
  try {
    svgaPlayer = require("@dasimems/react-native-svga").SvgaPlayer as SvgaPlayerComponent;
  } catch {
    svgaPlayer = null;
  }
  return svgaPlayer;
}
export function hasGiftImage(gift?: string): boolean {
  return !!gift && Object.hasOwn(artwork, gift.toLowerCase());
}
export function GiftImageArtwork({ gift, size, style }: { gift?: string; size: number; style?: StyleProp<ImageStyle> }) {
  const { t } = useAppLanguage();
  if (!hasGiftImage(gift)) return null;
  const image = artwork[gift!.toLowerCase() as keyof typeof artwork];
  return <Image source={image.source} resizeMode="contain" accessibilityLabel={t(image.label)} style={[{ width: size, height: size }, style]} />;
}

export function hasLuxuryGiftAnimation(gift?: string): boolean {
  return !!gift && Object.hasOwn(luxuryAnimations, gift.toLowerCase());
}

/** Native builds play the supplied SVGA; web and initial asset loading use the matching still artwork. */
export function LuxuryGiftArtwork({ gift, size, style, playOnce = false, onFinish, onPlaybackUnavailable }: { gift: string; size: number; style?: StyleProp<ImageStyle>; playOnce?: boolean; onFinish?: () => void; onPlaybackUnavailable?: () => void }) {
  const key = gift.toLowerCase() as keyof typeof luxuryAnimations;
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const unavailable = useRef(onPlaybackUnavailable);
  unavailable.current = onPlaybackUnavailable;
  const SvgaPlayer = getSvgaPlayer();
  useEffect(() => {
    if (!SvgaPlayer || !hasLuxuryGiftAnimation(gift)) {
      unavailable.current?.();
      return;
    }
    let active = true;
    const asset = Asset.fromModule(luxuryAnimations[key]);
    void asset.downloadAsync().then(() => {
      if (active) setSource(asset.localUri ?? asset.uri);
    }).catch(() => { if (active) { setFailed(true); unavailable.current?.(); } });
    return () => { active = false; };
  }, [gift, key, SvgaPlayer]);

  // Live playback waits invisibly for the animation asset. Drawer previews
  // keep their still image while loading; real failures still use fallback art.
  if (playOnce && SvgaPlayer && !source && !failed) return null;
  if (!SvgaPlayer || !source || failed) return <GiftImageArtwork gift={gift} size={size} style={style} />;
  return <SvgaPlayer source={source} loops={playOnce ? 1 : 0} muteBuiltInAudio style={StyleSheet.flatten([{ width: size, height: size }, style])} onFinish={onFinish} onError={() => { setFailed(true); unavailable.current?.(); }} />;
}
