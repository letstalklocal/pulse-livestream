import React from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";

// The live camera effect frames are generated from this same source file.
export function CrownArtwork({ size, style }: { size: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={require("../assets/moments/crown.png")} resizeMode="contain"
    accessibilityLabel="Crown" style={[{ width: size, height: size }, style]} />;
}
