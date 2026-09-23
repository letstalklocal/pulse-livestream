import React from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";
import { useAppLanguage } from "@/i18n";
const artwork = {
  rose: { source: require("../assets/gifts/rose.png"), label: "Rose" },
  heart: { source: require("../assets/gifts/heart.png"), label: "Heart" },
  lips: { source: require("../assets/gifts/lips.png"), label: "Lips" },
  strawberry: { source: require("../assets/gifts/strawberry.png"), label: "Strawberry" },
};
export function hasGiftImage(gift?: string): boolean {
  return !!gift && Object.hasOwn(artwork, gift.toLowerCase());
}
export function GiftImageArtwork({ gift, size, style }: { gift?: string; size: number; style?: StyleProp<ImageStyle> }) {
  const { t } = useAppLanguage();
  if (!hasGiftImage(gift)) return null;
  const image = artwork[gift!.toLowerCase() as keyof typeof artwork];
  return <Image source={image.source} resizeMode="contain" accessibilityLabel={t(image.label)} style={[{ width: size, height: size }, style]} />;
}
