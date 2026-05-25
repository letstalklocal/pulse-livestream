import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Avatar } from "@/components/Avatar";
import { useColors } from "@/hooks/useColors";

interface Stream {
  channelId: string;
  hostUid: number;
  hostName: string;
  title: string;
  viewerCount: number;
  startedAt: string;
  category: string;
}

interface Props {
  stream: Stream;
}

const CARD_WIDTH = (Dimensions.get("window").width - 48) / 2;

const CATEGORY_COLORS: Record<string, [string, string]> = {
  Gaming: ["#7B4FFF", "#3D1FA8"],
  Music:  ["#FF1966", "#8B0030"],
  Talk:   ["#00C896", "#006B51"],
  Art:    ["#FF8C00", "#8B4700"],
  Other:  ["#4FC3F7", "#1565C0"],
};

function formatViewers(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

function PulsingDot() {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.8, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(400),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [scale, opacity]);

  return (
    <View style={styles.dotWrapper}>
      <Animated.View style={[styles.dotRing, { transform: [{ scale }], opacity }]} />
      <View style={styles.dot} />
    </View>
  );
}

export function StreamCard({ stream }: Props) {
  const colors = useColors();
  const router = useRouter();
  const [bg1, bg2] = CATEGORY_COLORS[stream.category] ?? CATEGORY_COLORS["Other"]!;

  const goToProfile = () => {
    router.push(
      `/profile/${stream.hostUid}?name=${encodeURIComponent(stream.hostName)}` as any
    );
  };

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push(`/stream/${stream.channelId}` as any)}
      activeOpacity={0.85}
    >
      {/* Thumbnail */}
      <View style={[styles.thumbnail, { backgroundColor: bg2 }]}>
        {/* Gradient-like inner glow */}
        <View style={[styles.innerGlow, { backgroundColor: bg1 + "55" }]} />

        {/* Centred avatar placeholder */}
        <View style={styles.thumbnailContent}>
          <Avatar uid={stream.hostUid} name={stream.hostName} size={52} borderWidth={2} />
        </View>

        {/* Top-left: LIVE badge with pulsing dot */}
        <View style={styles.liveBadge}>
          <PulsingDot />
          <Text style={styles.liveText}>LIVE</Text>
        </View>

        {/* Top-right: viewer count */}
        <View style={styles.viewerBadge}>
          <Ionicons name="eye" size={10} color="#FFF" />
          <Text style={styles.viewerText}>{formatViewers(stream.viewerCount)}</Text>
        </View>

        {/* Bottom overlay: avatar + name + category */}
        <View style={styles.bottomOverlay}>
          <TouchableOpacity onPress={goToProfile} activeOpacity={0.8}>
            <Avatar uid={stream.hostUid} name={stream.hostName} size={26} borderWidth={1} />
          </TouchableOpacity>
          <View style={styles.overlayNameWrap}>
            <TouchableOpacity onPress={goToProfile} activeOpacity={0.8}>
              <Text style={styles.hostName} numberOfLines={1}>{stream.hostName}</Text>
            </TouchableOpacity>
            <View style={[styles.categoryPill, { backgroundColor: bg1 + "CC" }]}>
              <Text style={styles.categoryPillText}>{stream.category}</Text>
            </View>
          </View>
        </View>
      </View>

    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    marginBottom: 12,
  },
  thumbnail: {
    width: "100%",
    aspectRatio: 9 / 16,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  innerGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
  },
  thumbnailContent: { alignItems: "center", justifyContent: "center" },
  liveBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF1966",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 4,
  },
  liveText: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  dotWrapper: {
    width: 8,
    height: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  dotRing: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFF",
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#FFF",
  },
  viewerBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 3,
  },
  viewerText: { color: "#FFF", fontSize: 10, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  bottomOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  overlayNameWrap: { flex: 1, gap: 3 },
  hostName: { color: "#FFF", fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold" },
  categoryPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  categoryPillText: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
});
