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
        <View style={[styles.thumbnailGradient, { backgroundColor: bg1 }]} />
        <View style={styles.thumbnailContent}>
          <Avatar uid={stream.hostUid} name={stream.hostName} size={48} />
        </View>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <View style={styles.viewerBadge}>
          <Ionicons name="eye" size={10} color="#FFF" />
          <Text style={styles.viewerText}>{formatViewers(stream.viewerCount)}</Text>
        </View>
      </View>

      {/* Info row with tappable avatar */}
      <View style={styles.info}>
        <TouchableOpacity onPress={goToProfile} activeOpacity={0.8} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Avatar uid={stream.hostUid} name={stream.hostName} size={30} borderWidth={1} />
        </TouchableOpacity>
        <View style={styles.infoText}>
          <TouchableOpacity onPress={goToProfile} activeOpacity={0.8}>
            <Text style={[styles.hostName, { color: colors.foreground }]} numberOfLines={1}>
              {stream.hostName}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.mutedForeground }]} numberOfLines={2}>
            {stream.title}
          </Text>
          <View style={[styles.categoryBadge, { backgroundColor: bg1 + "33" }]}>
            <Text style={[styles.categoryText, { color: bg1 }]}>{stream.category}</Text>
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
    aspectRatio: 3 / 4,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbnailGradient: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.6,
    top: "40%",
  },
  thumbnailContent: { alignItems: "center", justifyContent: "center" },
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
    bottom: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 3,
  },
  viewerText: { color: "#FFF", fontSize: 10, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  info: {
    padding: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  infoText: { flex: 1, gap: 3 },
  hostName: { fontSize: 13, fontWeight: "700", fontFamily: "Inter_700Bold" },
  title: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  categoryBadge: { alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2 },
  categoryText: { fontSize: 10, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
});
