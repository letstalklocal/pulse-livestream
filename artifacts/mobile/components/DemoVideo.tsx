import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

const CATEGORY_COLORS: Record<string, [string, string]> = {
  Gaming: ["#7B4FFF", "#3D1FA8"],
  Music:  ["#FF1966", "#8B0030"],
  Talk:   ["#00C896", "#006B51"],
  Art:    ["#FF8C00", "#8B4700"],
  Dance:  ["#FF1966", "#8B0030"],
  Other:  ["#4FC3F7", "#1565C0"],
};

export function DemoVideo({ category, compact = false }: { category?: string; compact?: boolean }) {
  const [bg1, bg2] = CATEGORY_COLORS[category ?? ""] ?? CATEGORY_COLORS["Other"]!;
  const shift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shift, { toValue: 1, duration: 3000, useNativeDriver: false }),
        Animated.timing(shift, { toValue: 0, duration: 3000, useNativeDriver: false }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [shift]);

  const bgColor = shift.interpolate({
    inputRange: [0, 1],
    outputRange: [bg2, bg1],
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: bgColor }]}>
      <View style={[StyleSheet.absoluteFill, styles.videoOverlay]} />
      <View style={styles.videoCenter}>
        <Text style={[styles.videoInitials, compact && { fontSize: 30 }]}>
          {(category ?? "?").slice(0, 2).toUpperCase()}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  videoOverlay: { backgroundColor: "transparent", opacity: 0.4 },
  videoCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  videoInitials: { fontSize: 72, fontWeight: "800", color: "rgba(255,255,255,0.2)", fontFamily: "Inter_700Bold", letterSpacing: 4 },
});
