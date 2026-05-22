import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Dimensions,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetUserStreams } from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const { width } = Dimensions.get("window");
const GRID_CELL = (width - 4) / 3;

const CATEGORY_COLORS: Record<string, [string, string]> = {
  Gaming: ["#7B4FFF", "#3D1FA8"],
  Music:  ["#FF1966", "#8B0030"],
  Talk:   ["#00C896", "#006B51"],
  Art:    ["#FF8C00", "#8B4700"],
  Dance:  ["#FF1966", "#8B0030"],
  Other:  ["#4FC3F7", "#1565C0"],
};

function catColors(cat: string): [string, string] {
  return CATEGORY_COLORS[cat] ?? ["#4FC3F7", "#1565C0"];
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, updateUser } = useAuth();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(user.name);
  const [editBio, setEditBio] = useState(user.bio);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const { data: historyData } = useGetUserStreams(user.uid, {
    query: { refetchOnWindowFocus: false } as any,
  });
  const streamHistory = historyData?.streams ?? [];

  const pickAvatar = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not available", "Avatar upload requires the native app.");
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo access to upload an avatar.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      updateUser({ avatarUri: result.assets[0].uri });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const saveProfile = () => {
    if (!editName.trim()) {
      Alert.alert("Name required", "Please enter a display name.");
      return;
    }
    updateUser({ name: editName.trim(), bio: editBio.trim() });
    setEditing(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const cancelEdit = () => {
    setEditName(user.name);
    setEditBio(user.bio);
    setEditing(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={[styles.header, { paddingTop: topInset + 12 }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Profile</Text>
          {editing ? (
            <View style={styles.headerBtns}>
              <TouchableOpacity
                style={[styles.iconBtn, { borderColor: colors.border }]}
                onPress={cancelEdit}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, { borderColor: colors.primary }]}
                onPress={saveProfile}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.iconBtn, { borderColor: colors.border }]}
              onPress={() => {
                setEditName(user.name);
                setEditBio(user.bio);
                setEditing(true);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="pencil" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        {/* Avatar + info */}
        <View style={styles.profileBlock}>
          <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8} style={styles.avatarWrapper}>
            <Avatar uid={user.uid} name={user.name} avatarUri={user.avatarUri} size={96} borderWidth={3} />
            <View style={[styles.avatarEditBadge, { backgroundColor: colors.primary }]}>
              <Ionicons name="camera" size={12} color="#FFF" />
            </View>
          </TouchableOpacity>

          {editing ? (
            <View style={styles.editFields}>
              <TextInput
                style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                value={editName}
                onChangeText={setEditName}
                placeholder="Display name"
                placeholderTextColor={colors.mutedForeground}
                maxLength={32}
              />
              <TextInput
                style={[styles.bioInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                value={editBio}
                onChangeText={setEditBio}
                placeholder="Bio"
                placeholderTextColor={colors.mutedForeground}
                multiline
                maxLength={120}
              />
            </View>
          ) : (
            <>
              <Text style={[styles.displayName, { color: colors.foreground }]}>{user.name}</Text>
              {user.bio ? (
                <Text style={[styles.bio, { color: colors.mutedForeground }]}>{user.bio}</Text>
              ) : null}
            </>
          )}

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{user.followersCount}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Followers</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{user.followingCount}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Following</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{streamHistory.length}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Streams</Text>
            </View>
          </View>

          {/* Go Live CTA */}
          <TouchableOpacity
            style={[styles.goLiveBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/go-live" as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="radio" size={16} color="#FFF" />
            <Text style={styles.goLiveBtnText}>Go Live</Text>
          </TouchableOpacity>
        </View>

        {/* Grid divider */}
        <View style={[styles.gridHeader, { borderColor: colors.border }]}>
          <Ionicons name="grid-outline" size={20} color={colors.primary} />
        </View>

        {/* Past streams grid */}
        {streamHistory.length === 0 ? (
          <View style={styles.emptyGrid}>
            <Ionicons name="radio-outline" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No past streams yet
            </Text>
            <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
              Go live to start building your history
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {streamHistory.map((item) => {
              const [c1, c2] = catColors(item.category);
              return (
                <View key={item.id} style={[styles.gridCell, { backgroundColor: c2 }]}>
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: c1, opacity: 0.5 }]} />
                  <Text style={styles.gridCellLabel}>{item.category.slice(0, 2).toUpperCase()}</Text>
                  <Text style={styles.gridCellDate}>{formatDate(item.startedAt)}</Text>
                  <View style={styles.gridCellViewers}>
                    <Ionicons name="eye-outline" size={10} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.gridCellViewersText}>{item.peakViewers}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 28, fontWeight: "700", fontFamily: "Inter_700Bold" },
  headerBtns: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  profileBlock: { alignItems: "center", paddingHorizontal: 24, gap: 10, paddingBottom: 8 },
  avatarWrapper: { position: "relative" },
  avatarEditBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#08080F",
  },
  displayName: { fontSize: 22, fontWeight: "700", fontFamily: "Inter_700Bold" },
  bio: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  editFields: { width: "100%", gap: 10 },
  nameInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, fontFamily: "Inter_500Medium" },
  bioInput: {
    borderWidth: 1, borderRadius: 10, padding: 12,
    fontSize: 14, fontFamily: "Inter_400Regular",
    minHeight: 72, textAlignVertical: "top",
  },
  statsRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statDivider: { width: 1, height: 30, marginHorizontal: 12 },
  statValue: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  goLiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 36,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 4,
  },
  goLiveBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  gridHeader: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  emptyGrid: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyText: { fontSize: 15, fontWeight: "600", fontFamily: "Inter_500Medium" },
  emptySubText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  gridCell: {
    width: GRID_CELL,
    height: GRID_CELL,
    margin: 0.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    padding: 6,
  },
  gridCellLabel: {
    fontSize: 22,
    fontWeight: "800",
    color: "rgba(255,255,255,0.25)",
    fontFamily: "Inter_700Bold",
  },
  gridCellDate: {
    fontSize: 9,
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  gridCellViewers: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    position: "absolute",
    bottom: 6,
    right: 6,
  },
  gridCellViewersText: {
    fontSize: 9,
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_400Regular",
  },
});
