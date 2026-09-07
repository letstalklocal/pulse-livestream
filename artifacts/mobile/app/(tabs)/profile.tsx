import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { fetch as expoFetch } from "expo/fetch";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  Modal,
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
import {
  getGetCoinBalanceQueryKey,
  getGetUserPostsQueryKey,
  useCreatePost,
  useDeletePost,
  useGetCoinBalance,
  useGetUserPosts,
  useGetUserStreams,
  useGrantCoins,
  useRequestAvatarUpload,
  useRequestPostUpload,
  useUpsertUser,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
  const [historyView, setHistoryView] = useState<"grid" | "feed">("grid");
  const [editName, setEditName] = useState(user?.name ?? "");
  const [editBio, setEditBio] = useState(user?.bio ?? "");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [postImage, setPostImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [postCaption, setPostCaption] = useState("");
  const [isPublishingPost, setIsPublishingPost] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const queryClient = useQueryClient();

  const { data: historyData } = useGetUserStreams(user?.uid ?? 0, {
    query: { refetchOnWindowFocus: false } as any,
  });
  const streamHistory = historyData?.streams ?? [];
  const { data: postsData } = useGetUserPosts(user?.uid ?? 0, {
    query: { enabled: !!user?.uid, refetchOnWindowFocus: false } as any,
  });
  const posts = postsData?.posts ?? [];

  const { data: coinData, refetch: refetchCoins } = useGetCoinBalance(
    { uid: user?.uid ?? 0 },
    { query: { enabled: !!user?.uid, refetchOnWindowFocus: false } as any },
  );
  const coinBalance = coinData?.balance ?? 0;

  const grantMutation = useGrantCoins();
  const requestAvatarUpload = useRequestAvatarUpload();
  const requestPostUpload = useRequestPostUpload();
  const createPost = useCreatePost();
  const deletePost = useDeletePost();
  const upsertUser = useUpsertUser();

  const choosePostImage = async () => {
    if (!user || isPublishingPost) return;
    if (Platform.OS === "web") {
      Alert.alert("Not available", "Creating posts requires the native app.");
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to create a post.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      setPostImage(result.assets[0]);
      setPostCaption("");
    }
  };

  const publishPost = async () => {
    if (!user || !postImage || isPublishingPost) return;
    setIsPublishingPost(true);
    try {
      const upload = await requestPostUpload.mutateAsync();
      const sourceResponse = await expoFetch(postImage.uri);
      const imageBlob = await sourceResponse.blob();
      const uploadResponse = await expoFetch(upload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": postImage.mimeType ?? "image/jpeg" },
        body: imageBlob,
      });
      if (!uploadResponse.ok) throw new Error(`Photo upload failed (${uploadResponse.status}).`);
      await createPost.mutateAsync({
        data: { imageObjectPath: upload.objectPath, caption: postCaption.trim() },
      });
      await queryClient.invalidateQueries({ queryKey: getGetUserPostsQueryKey(user.uid) });
      setPostImage(null);
      setPostCaption("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert("Post not shared", error instanceof Error ? error.message : "Try again.");
    } finally {
      setIsPublishingPost(false);
    }
  };

  const confirmDeletePost = (postId: number) => {
    if (!user) return;
    Alert.alert("Delete post?", "This post will be permanently removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deletePost.mutateAsync({ postId });
            await queryClient.invalidateQueries({ queryKey: getGetUserPostsQueryKey(user.uid) });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (error) {
            Alert.alert("Post not deleted", error instanceof Error ? error.message : "Try again.");
          }
        },
      },
    ]);
  };

  const addTestCoins = () => {
    if (!user?.uid) return;
    grantMutation.mutate(
      { data: { uid: user.uid, amount: 10000, note: "dev grant" } },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(
            getGetCoinBalanceQueryKey({ uid: user.uid }),
            { balance: data.balance },
          );
          refetchCoins();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert("Coins added", `+10,000 coins  •  Balance: ${data.balance.toLocaleString()} 🪙`);
        },
      },
    );
  };

  const pickAvatar = async () => {
    if (!user || isUploadingAvatar) return;
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
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setIsUploadingAvatar(true);
      try {
        const asset = result.assets[0];
        const upload = await requestAvatarUpload.mutateAsync({ uid: user.uid });
        const sourceResponse = await expoFetch(asset.uri);
        const imageBlob = await sourceResponse.blob();
        const uploadResponse = await expoFetch(upload.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": asset.mimeType ?? "image/jpeg",
          },
          body: imageBlob,
        });
        if (!uploadResponse.ok) {
          throw new Error(`Avatar upload failed (${uploadResponse.status}).`);
        }

        const updated = await upsertUser.mutateAsync({
          uid: user.uid,
          data: {
            name: user.name,
            bio: user.bio,
            avatarImagePath: upload.objectPath,
          },
        });
        updateUser({
          avatarImagePath: updated.user.avatarImagePath,
          avatarImageUrl: updated.user.avatarImageUrl,
          avatarUri: updated.user.avatarImageUrl ?? undefined,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        Alert.alert(
          "Avatar not saved",
          error instanceof Error ? error.message : "Choose another image and try again.",
        );
      } finally {
        setIsUploadingAvatar(false);
      }
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
    setEditName(user?.name ?? "");
    setEditBio(user?.bio ?? "");
    setEditing(false);
  };

  // Sign-out / guest state
  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }]}>
        <StatusBar barStyle="light-content" />
        <Ionicons name="person-circle-outline" size={64} color={colors.mutedForeground} />
        <Text style={[styles.headerTitle, { color: colors.foreground, marginTop: 16, marginBottom: 8 }]}>Your Profile</Text>
        <Text style={[styles.bio, { color: colors.mutedForeground, textAlign: "center", marginBottom: 32 }]}>
          Sign in to build your profile, go live, and grow your audience on Pulse.
        </Text>
        <TouchableOpacity
          style={[styles.goLiveBtn, { backgroundColor: colors.primary, paddingHorizontal: 48 }]}
          onPress={() => router.push("/(auth)/sign-in" as any)}
          activeOpacity={0.85}
        >
          <Ionicons name="log-in-outline" size={16} color="#FFF" />
          <Text style={styles.goLiveBtnText}>Sign in</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/(auth)/sign-up" as any)} style={{ marginTop: 14 }}>
          <Text style={[styles.bio, { color: colors.mutedForeground }]}>
            No account? <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Sign up</Text>
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={[styles.header, { paddingTop: topInset + 12 }]}>
          <View style={styles.headerCoinBalance}>
            <Text style={styles.coinEmoji}>🪙</Text>
            <Text style={[styles.headerCoinAmount, { color: colors.foreground }]}>
              {coinBalance.toLocaleString()}
            </Text>
          </View>
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
              style={[styles.headerGoLiveBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push("/go-live" as any)}
              activeOpacity={0.8}
            >
              <Ionicons name="radio" size={14} color="#FFF" />
              <Text style={styles.headerGoLiveBtnText}>Go Live</Text>
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
              <View style={styles.profileActions}>
                <TouchableOpacity
                  style={[styles.editProfileBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => {
                    setEditName(user.name ?? "");
                    setEditBio(user.bio ?? "");
                    setEditing(true);
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="pencil-outline" size={15} color={colors.foreground} />
                  <Text style={[styles.editProfileText, { color: colors.foreground }]}>Edit Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.settingsBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => router.push("/settings" as any)}
                  activeOpacity={0.75}
                  accessibilityLabel="Open settings"
                >
                  <Ionicons name="settings-outline" size={18} color={colors.foreground} />
                </TouchableOpacity>
              </View>
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

          <TouchableOpacity
            style={[styles.packsBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => router.push("/media-packs" as any)}
            activeOpacity={0.8}
            testID="media-packs-entry"
          >
            <Ionicons name="images-outline" size={17} color={colors.primary} />
            <Text style={[styles.packsBtnText, { color: colors.foreground }]}>Media Packs</Text>
          </TouchableOpacity>

          {/* Dev: add test coins */}
          <TouchableOpacity
            style={[styles.devBtn, { borderColor: "rgba(255,215,0,0.3)" }]}
            onPress={addTestCoins}
            activeOpacity={0.7}
            disabled={grantMutation.isPending}
          >
            <Text style={styles.devBtnText}>
              {grantMutation.isPending ? "Adding…" : "+ 500 coins  (dev)"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Grid divider */}
        <View style={[styles.gridHeader, { borderColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.viewOption,
              historyView === "grid" && { borderBottomColor: colors.primary },
            ]}
            onPress={() => setHistoryView("grid")}
            activeOpacity={0.7}
            accessibilityLabel="Grid view"
          >
            <Ionicons
              name={historyView === "grid" ? "grid" : "grid-outline"}
              size={20}
              color={historyView === "grid" ? colors.primary : colors.mutedForeground}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.viewOption,
              historyView === "feed" && { borderBottomColor: colors.primary },
            ]}
            onPress={() => setHistoryView("feed")}
            activeOpacity={0.7}
            accessibilityLabel="Feed view"
          >
            <Ionicons
              name={historyView === "feed" ? "list" : "list-outline"}
              size={22}
              color={historyView === "feed" ? colors.primary : colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>

        {/* Past streams grid */}
        {posts.length === 0 ? (
          <View style={styles.emptyGrid}>
            <Ionicons name="images-outline" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No posts yet
            </Text>
            <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>
              Tap + to share your first photo
            </Text>
          </View>
        ) : historyView === "grid" ? (
          <View style={styles.grid}>
            {posts.map((post) => (
              <TouchableOpacity
                key={post.id}
                style={styles.gridCell}
                onLongPress={() => confirmDeletePost(post.id)}
                activeOpacity={0.85}
              >
                <Image source={{ uri: post.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.feed}>
            {posts.map((post) => (
                <View
                  key={post.id}
                  style={[styles.feedCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.feedPostHeader}>
                    <Avatar
                      uid={user.uid}
                      name={user.name}
                      avatarUri={user.avatarUri}
                      size={34}
                      borderWidth={1}
                    />
                    <View style={styles.feedPostIdentity}>
                      <Text style={[styles.feedUserName, { color: colors.foreground }]}>
                        {user.name}
                      </Text>
                      <Text style={[styles.feedDate, { color: colors.mutedForeground }]}>{formatDate(post.createdAt)}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => confirmDeletePost(post.id)}
                      hitSlop={10}
                      accessibilityLabel="Post options"
                    >
                      <Ionicons name="ellipsis-horizontal" size={20} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.feedMedia}>
                    <Image source={{ uri: post.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  </View>

                  <View style={styles.feedActions}>
                    <View style={styles.feedPrimaryActions}>
                      <Ionicons name="heart-outline" size={25} color={colors.foreground} />
                      <Ionicons name="chatbubble-outline" size={23} color={colors.foreground} />
                      <Ionicons name="paper-plane-outline" size={24} color={colors.foreground} />
                    </View>
                    <Ionicons name="bookmark-outline" size={25} color={colors.foreground} />
                  </View>

                  <View style={styles.feedCaption}>
                    {post.caption ? (
                      <Text style={[styles.feedCategory, { color: colors.foreground }]}>
                        <Text style={styles.feedCaptionName}>{user.name} </Text>
                        {post.caption}
                      </Text>
                    ) : null}
                  </View>
                </View>
            ))}
          </View>
        )}

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 80 }} />
      </ScrollView>

      <TouchableOpacity
        style={[
          styles.newPostFab,
          {
            backgroundColor: colors.primary,
            bottom: insets.bottom + (Platform.OS === "web" ? 82 : 72),
          },
        ]}
        onPress={choosePostImage}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel="Create a new post"
      >
        <Ionicons name="add" size={30} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={!!postImage} transparent animationType="slide" onRequestClose={() => setPostImage(null)}>
        <View style={styles.postModalBackdrop}>
          <View style={[styles.postModal, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={[styles.postModalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setPostImage(null)} disabled={isPublishingPost}>
                <Text style={[styles.postModalAction, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.postModalTitle, { color: colors.foreground }]}>New Post</Text>
              <TouchableOpacity onPress={publishPost} disabled={isPublishingPost}>
                <Text style={[styles.postModalAction, { color: colors.primary }]}>
                  {isPublishingPost ? "Sharing…" : "Share"}
                </Text>
              </TouchableOpacity>
            </View>
            {postImage ? <Image source={{ uri: postImage.uri }} style={styles.postPreview} resizeMode="cover" /> : null}
            <TextInput
              value={postCaption}
              onChangeText={setPostCaption}
              placeholder="Write a caption…"
              placeholderTextColor={colors.mutedForeground}
              maxLength={2200}
              multiline
              style={[styles.postCaptionInput, { color: colors.foreground, borderColor: colors.border }]}
              editable={!isPublishingPost}
            />
            <Text style={[styles.postCaptionCount, { color: colors.mutedForeground }]}>
              {postCaption.length}/2200
            </Text>
          </View>
        </View>
      </Modal>
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
  headerCoinBalance: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  headerCoinAmount: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  headerGoLiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
  },
  headerGoLiveBtnText: {
    color: "#FFF",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
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
  profileActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  editProfileBtn: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 18,
    borderRadius: 19,
    borderWidth: 1,
  },
  editProfileText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  settingsBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  newPostFab: {
    position: "absolute",
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 7,
  },
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
  coinEmoji: { fontSize: 16 },
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
  packsBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 24, paddingHorizontal: 28, paddingVertical: 11 },
  packsBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  devBtn: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  devBtnText: {
    color: "#FFD700",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    opacity: 0.8,
  },
  gridHeader: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 32,
    marginTop: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  viewOption: {
    width: 52,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
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
  feed: {
    paddingTop: 14,
    gap: 18,
  },
  feedCard: {
    width: "100%",
    borderWidth: 1,
  },
  feedPostHeader: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
  },
  feedPostIdentity: {
    flex: 1,
    gap: 2,
  },
  feedUserName: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  feedDate: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  feedMedia: {
    width: "100%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  feedActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 13,
    paddingTop: 12,
    paddingBottom: 9,
  },
  feedPrimaryActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 17,
  },
  feedCaption: {
    paddingHorizontal: 13,
    paddingBottom: 14,
    gap: 6,
  },
  feedViewerText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  feedCategory: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_400Regular",
  },
  feedCaptionName: {
    fontFamily: "Inter_700Bold",
  },
  postModalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  postModal: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
  },
  postModalHeader: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    borderBottomWidth: 1,
  },
  postModalTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  postModalAction: {
    minWidth: 58,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  postPreview: {
    width: "100%",
    aspectRatio: 1,
  },
  postCaptionInput: {
    minHeight: 92,
    marginHorizontal: 16,
    marginTop: 14,
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
    textAlignVertical: "top",
  },
  postCaptionCount: {
    alignSelf: "flex-end",
    marginTop: 6,
    marginRight: 18,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
