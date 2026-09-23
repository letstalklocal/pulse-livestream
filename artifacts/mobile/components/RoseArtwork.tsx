import React from "react";
import { type ImageStyle, type StyleProp } from "react-native";
import { GiftImageArtwork } from "./GiftImageArtwork";
export function RoseArtwork({ size, style }: { size: number; style?: StyleProp<ImageStyle> }) {
  return <GiftImageArtwork gift="rose" size={size} style={style} />;
}
