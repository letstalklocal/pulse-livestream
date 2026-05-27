import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Avatar } from "@/components/Avatar";
import { LivePreviewThumbnail } from "@/components/LivePreviewThumbnail";
import { useColors } from "@/hooks/useColors";

interface Stream {
  channelId: string;
  hostUid: number;
  hostName: string;
  hostAvatarUrl?: string | null;
  title: string;
  viewerCount: number;
  startedAt: string;
  category: string;
}

interface Props {
  stream: Stream;
  isVisible?: boolean;
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

export function StreamCard({ stream, isVisible = false }: Props) {
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
      <View style={[styles.thumbnail, { backgroundColor: bg2 }]}>
        <View style={[styles.innerGlow, { backgroundColor: bg1 + "44" }]} />

        {/* Profile photo — shown when no live preview is active */}
        {stream.hostAvatarUrl ? (
          <Image
            source={{ uri: stream.hostAvatarUrl }}
            style={styles.profileImage}
            resizeMode="cover"
          />
        ) : null}

        {/* Live video preview — 3s delay then 5s live, then back to background */}
        <LivePreviewThumbnail channelId={stream.channelId} hostUid={stream.hostUid} isVisible={isVisible} />

        {/* Top-left: category */}
        <View style={[styles.categoryBadge, { backgroundColor: bg1 }]}>
          <Text style={styles.categoryText}>{stream.category.toUpperCase()}</Text>
        </View>

        {/* Top-right: viewer count */}
        <View style={styles.viewerBadge}>
          <Ionicons name="eye" size={10} color="#FFF" />
          <Text style={styles.viewerText}>{formatViewers(stream.viewerCount)}</Text>
        </View>

        {/* Bottom: avatar + name */}
        <View style={styles.bottomOverlay}>
          <TouchableOpacity onPress={goToProfile} activeOpacity={0.8}>
            <Avatar uid={stream.hostUid} name={stream.hostName} size={26} borderWidth={1} />
          </TouchableOpacity>
          <TouchableOpacity onPress={goToProfile} activeOpacity={0.8} style={styles.nameWrap}>
            <Text style={styles.hostName} numberOfLines={1}>{stream.hostName}</Text>
          </TouchableOpacity>
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
  },
  profileImage: {
    ...StyleSheet.absoluteFillObject,
  },
  categoryBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  categoryText: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
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
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  nameWrap: { flex: 1 },
  hostName: { color: "#FFF", fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold" },
});
