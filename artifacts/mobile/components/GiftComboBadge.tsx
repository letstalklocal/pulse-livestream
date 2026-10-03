import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Text } from "react-native";

export function GiftComboBadge({ count, label, reduceMotion, plain = false }: { count: number; label: string; reduceMotion?: boolean; plain?: boolean }) {
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  useEffect(() => {
    if (reduceMotion !== undefined) return;
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setSystemReducedMotion(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setSystemReducedMotion);
    return () => { active = false; listener.remove(); };
  }, [reduceMotion]);
  const reduced = reduceMotion ?? systemReducedMotion;
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (count < 2 || reduced) { scale.setValue(1); return; }
    const animation = Animated.sequence([
      Animated.timing(scale, { toValue: 1.25, duration: 120, useNativeDriver: true, isInteraction: false }),
      Animated.timing(scale, { toValue: 1, duration: 200, useNativeDriver: true, isInteraction: false }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [count, reduced, scale]);
  if (count < 2) return null;
  return <Animated.View style={{ transform: [{ scale }], paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: plain ? "transparent" : "rgba(0,0,0,0.7)" }}>
    <Text style={{ color: "#D4AF37", fontFamily: "Inter_700Bold", fontSize: 18, ...(plain ? { textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 } : {}) }}>{label}</Text>
  </Animated.View>;
}
