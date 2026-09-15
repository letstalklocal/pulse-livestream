import React from "react";
import { Platform } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

// Explicit gold fills keep counters consistent across iOS and Android.
export function GoldCoinIcon({ size = 16 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={Platform.OS === "web" ? undefined : false}>
    <Circle cx={12} cy={12} r={11} fill="#E5A400" stroke="#A96B00" strokeWidth={1} />
    <Circle cx={12} cy={12} r={8.5} fill="#FFD54A" stroke="#FFF0A3" strokeWidth={1.5} />
    <Path d="M15 8.5a4.5 4.5 0 1 0 0 7" fill="none" stroke="#B87900" strokeWidth={2} strokeLinecap="round" />
  </Svg>;
}
