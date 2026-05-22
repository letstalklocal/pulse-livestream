import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Dimensions,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { useColors } from "@/hooks/useColors";

const { width } = Dimensions.get("window");
const GRID_CELL = (width - 4) / 3;

const CATEGORY_COLORS: Record<string, [string, string]> = {
  Gaming: ["#7B4FFF", "#3D1FA8"],
  Music: ["#FF1966", "#8B0030"],
  Talk: ["#00C896", "#006B51"],
  Art: ["#FF8C00", "#8B4700"],
  Dance: ["#FF1966", "#8B0030"],
  Other: ["#4FC3F7", "#1565C0"],
};
const CATEGORIES = Object.keys(CATEGORY_COLORS);

function mockGrid(uid: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const cat = CATEGORIES[(uid + i) % CATEGORIES.length]!;
    const [c1, c2] = CATEGORY_COLORS[cat]!;
    return { id: String(i), cat, c1, c2 };
  });
}

export default function PublicProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { hostUid, name, avatarUri } = useLocalSearchParams<{
    hostUid: string;
    name: string;
    avatarUri?: string;
  }>();

  const uid = parseInt(hostUid ?? "0", 10);
  const displayName = name ?? "Unknown";
  const grid = mockGrid(uid);

  const [followed, setFollowed] = useState(false);
  const [followers, setFollowers] = useState(Math.floor(uid % 9000) + 200);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const toggleFollow = () => {
    setFollowed((f) => {
      setFollowers((c) => (f ? c - 1 : c + 1));
      return !f;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Back button */}
      <TouchableOpacity
        style={[styles.backBtn, { top: topInset + 10 }]}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Ionicons name="chevron-back" size={22} color={colors.foreground} />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header space */}
        <View style={{ height: topInset + 56 }} />

        {/* Profile info */}
        <View style={styles.profileBlock}>
          <Avatar uid={uid} name={displayName} avatarUri={avatarUri} size={88} borderWidth={2} />

          <Text style={[styles.displayName, { color: colors.foreground }]}>
            {displayName}
          </Text>
          <Text style={[styles.bio, { color: colors.mutedForeground }]}>
            Streaming live on Pulse 🎙️
          </Text>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {followers >= 1000 ? `${(followers / 1000).toFixed(1)}K` : followers}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Followers</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {Math.floor((uid % 300) + 10)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Following</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {Math.floor((uid % 80) + 3)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Streams</Text>
            </View>
          </View>

          {/* Follow button */}
          <TouchableOpacity
            style={[
              styles.followBtn,
              {
                backgroundColor: followed ? "transparent" : colors.primary,
                borderColor: followed ? colors.border : colors.primary,
                borderWidth: 1,
              },
            ]}
            onPress={toggleFollow}
            activeOpacity={0.8}
          >
            <Text style={[styles.followBtnText, { color: followed ? colors.foreground : "#FFF" }]}>
              {followed ? "Following" : "Follow"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Grid header */}
        <View style={[styles.gridHeader, { borderColor: colors.border }]}>
          <Ionicons name="grid-outline" size={20} color={colors.primary} />
        </View>

        {/* 3-column past streams grid */}
        <View style={styles.grid}>
          {grid.map((item) => (
            <View
              key={item.id}
              style={[styles.gridCell, { backgroundColor: item.c2 }]}
            >
              <View style={[StyleSheet.absoluteFill, { backgroundColor: item.c1, opacity: 0.5 }]} />
              <View style={styles.gridCellBadge}>
                <View style={styles.gridLiveDot} />
              </View>
              <Text style={styles.gridCellLabel}>{item.cat.slice(0, 2).toUpperCase()}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: {
    position: "absolute",
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  profileBlock: {
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 10,
    paddingBottom: 4,
  },
  displayName: {
    fontSize: 22,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  bio: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 0,
  },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statDivider: { width: 1, height: 30, marginHorizontal: 12 },
  statValue: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  followBtn: {
    marginTop: 6,
    paddingHorizontal: 48,
    paddingVertical: 11,
    borderRadius: 24,
  },
  followBtnText: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  gridHeader: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  gridCell: {
    width: GRID_CELL,
    height: GRID_CELL,
    margin: 0.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  gridCellBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF1966",
    alignItems: "center",
    justifyContent: "center",
  },
  gridLiveDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#FFF" },
  gridCellLabel: {
    fontSize: 22,
    fontWeight: "800",
    color: "rgba(255,255,255,0.25)",
    fontFamily: "Inter_700Bold",
  },
});
