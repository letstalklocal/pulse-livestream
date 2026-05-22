import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Avatar } from "@/components/Avatar";

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

export function StreamCard({ stream }: Props) {
  const router = useRouter();
  const [bg1, bg2] = CATEGORY_COLORS[stream.category] ?? CATEGORY_COLORS["Other"]!;

  return (
    <TouchableOpacity
      style={[styles.card]}
      onPress={() => router.push(`/stream/${stream.channelId}` as any)}
      activeOpacity={0.85}
    >
      {/* Full-card thumbnail */}
      <View style={[styles.thumbnail, { backgroundColor: bg2 }]}>
        {/* Colour wash */}
        <View style={[styles.wash, { backgroundColor: bg1 }]} />

        {/* Centred avatar placeholder */}
        <View style={styles.centerAvatar}>
          <Avatar uid={stream.hostUid} name={stream.hostName} size={52} />
        </View>

        {/* Top-left: LIVE badge */}
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>

        {/* Top-right: viewer count */}
        <View style={styles.viewerBadge}>
          <Ionicons name="eye" size={10} color="#FFF" />
          <Text style={styles.viewerText}>{formatViewers(stream.viewerCount)}</Text>
        </View>

        {/* Bottom overlay: avatar + name + title */}
        <View style={styles.bottomOverlay}>
          <Avatar uid={stream.hostUid} name={stream.hostName} size={26} borderWidth={1} />
          <View style={styles.overlayText}>
            <Text style={styles.hostName} numberOfLines={1}>{stream.hostName}</Text>
            <Text style={styles.title} numberOfLines={1}>{stream.title}</Text>
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
    marginBottom: 12,
  },
  thumbnail: {
    width: "100%",
    aspectRatio: 3 / 4,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  wash: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.55,
    top: "35%",
  },
  centerAvatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  liveBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF1966",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#FFF" },
  liveText: { color: "#FFF", fontSize: 9, fontWeight: "700", fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
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
    gap: 7,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  overlayText: { flex: 1 },
  hostName: { color: "#FFF", fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold" },
  title: { color: "rgba(255,255,255,0.65)", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
});
