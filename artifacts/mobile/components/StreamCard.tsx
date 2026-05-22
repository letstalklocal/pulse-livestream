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
        {/* Centred avatar placeholder */}
        <View style={styles.thumbnailContent}>
          <Avatar uid={stream.hostUid} name={stream.hostName} size={48} />
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

        {/* Bottom overlay: avatar + name only */}
        <View style={styles.bottomOverlay}>
          <TouchableOpacity onPress={goToProfile} activeOpacity={0.8}>
            <Avatar uid={stream.hostUid} name={stream.hostName} size={26} borderWidth={1} />
          </TouchableOpacity>
          <TouchableOpacity onPress={goToProfile} activeOpacity={0.8} style={styles.overlayNameWrap}>
            <Text style={styles.hostName} numberOfLines={1}>{stream.hostName}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Info below the card */}
      <View style={styles.info}>
        <View style={styles.infoText}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
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
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  overlayNameWrap: { flex: 1 },
  hostName: { color: "#FFF", fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold" },
  info: {
    padding: 10,
  },
  infoText: { gap: 4 },
  title: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  categoryBadge: { alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2 },
  categoryText: { fontSize: 10, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
});
