import { t, useAppLanguage } from "@/i18n";
import React from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";

// The live camera effect frames are generated from this same source file.
export function CrownArtwork({ size, style }: { size: number; style?: StyleProp<ImageStyle> }) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  return <Image source={require("../assets/moments/crown.png")} resizeMode="contain"
    accessibilityLabel={t("Crown")} style={[{ width: size, height: size }, style]} />;
}
