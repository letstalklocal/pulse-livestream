import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
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
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const AVATAR_COLORS = [
  "#FF1966",
  "#7B4FFF",
  "#00C896",
  "#FF8C00",
  "#4FC3F7",
];

function getAvatarColor(uid: number): string {
  return AVATAR_COLORS[uid % AVATAR_COLORS.length] ?? "#FF1966";
}

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
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
  const avatarColor = getAvatarColor(user.uid);

  const saveProfile = () => {
    if (!editName.trim()) {
      Alert.alert("Name required", "Please enter a display name.");
      return;
    }
    updateUser({ name: editName.trim(), bio: editBio.trim() });
    setEditing(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 80 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: topInset + 12 }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Profile
          </Text>
          <TouchableOpacity
            onPress={() => {
              if (editing) {
                saveProfile();
              } else {
                setEditing(true);
              }
            }}
            style={[styles.editBtn, { borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={editing ? "checkmark" : "pencil"}
              size={16}
              color={editing ? colors.primary : colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>

        {/* Avatar + info */}
        <View style={styles.profileSection}>
          <View
            style={[
              styles.avatar,
              { backgroundColor: avatarColor + "33", borderColor: avatarColor },
            ]}
          >
            <Text style={[styles.avatarText, { color: avatarColor }]}>
              {getInitials(user.name)}
            </Text>
          </View>

          {editing ? (
            <View style={styles.editFields}>
              <TextInput
                style={[
                  styles.nameInput,
                  {
                    color: colors.foreground,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                  },
                ]}
                value={editName}
                onChangeText={setEditName}
                placeholder="Display name"
                placeholderTextColor={colors.mutedForeground}
                maxLength={32}
              />
              <TextInput
                style={[
                  styles.bioInput,
                  {
                    color: colors.foreground,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                  },
                ]}
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
              <Text style={[styles.displayName, { color: colors.foreground }]}>
                {user.name}
              </Text>
              <Text style={[styles.bio, { color: colors.mutedForeground }]}>
                {user.bio}
              </Text>
            </>
          )}

          {/* Stats */}
          <View style={[styles.statsRow, { borderColor: colors.border }]}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {user.followersCount}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                Followers
              </Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {user.followingCount}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                Following
              </Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {user.uid}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                UID
              </Text>
            </View>
          </View>
        </View>

        {/* Go Live CTA */}
        <View style={styles.goLiveSection}>
          <TouchableOpacity
            style={[styles.goLiveCard, { backgroundColor: colors.primary + "1A", borderColor: colors.primary + "55" }]}
            onPress={() => router.push("/go-live" as any)}
            activeOpacity={0.8}
          >
            <View style={[styles.goLiveIconWrapper, { backgroundColor: colors.primary }]}>
              <Ionicons name="radio" size={24} color="#FFF" />
            </View>
            <View style={styles.goLiveText}>
              <Text style={[styles.goLiveTitle, { color: colors.foreground }]}>
                Start Streaming
              </Text>
              <Text style={[styles.goLiveDesc, { color: colors.mutedForeground }]}>
                Go live and connect with your audience
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Info section */}
        <View style={[styles.infoSection, { borderColor: colors.border }]}>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.mutedForeground} />
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              Live streaming requires the native app build. Use Expo Launch to publish and test on your device.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  profileSection: {
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  displayName: {
    fontSize: 22,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  bio: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  editFields: {
    width: "100%",
    gap: 10,
  },
  nameInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  bioInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 72,
    textAlignVertical: "top",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    width: "100%",
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    marginHorizontal: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  goLiveSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  goLiveCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  goLiveIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  goLiveText: {
    flex: 1,
    gap: 2,
  },
  goLiveTitle: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  goLiveDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
