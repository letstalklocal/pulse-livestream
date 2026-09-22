import { PostGiftTotal } from "@/components/PostGiftTotal";
import SignedOutProfile from "@/components/SignedOutProfile";
import { t, useAppLanguage, localizedTextStyle, appLocale } from "@/i18n";
import { usePrivacyPreferences } from "@/hooks/usePrivacyPreferences";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { fetch as expoFetch } from "expo/fetch";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
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
  getGetUserQueryKey,
  getGetUserPostsQueryKey,
  getSavedPosts,
  useCreatePost,
  useDeletePost,
  useGetCoinBalance,
  useGetUser,
  useGetUserPosts,
  useGetUserStreams,
  useRequestAvatarUpload,
  useRequestProfileBackgroundUpload,
  useRequestPostUpload,
  useUpsertUser,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PostFooter } from "@/components/PostFooter";
import { Avatar } from "@/components/Avatar";
import { GoldCoinIcon } from "@/components/GoldCoinIcon";
import {
  ProfileBackgroundCropper,
  type ProfileBackgroundCropSource,
} from "@/components/ProfileBackgroundCropper";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { POST_ASPECT_RATIO } from "@/utils/postLayout";

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

function formatDate(iso: string, locale: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export default function ProfileScreen() {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const locationPrivacy = usePrivacyPreferences();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, updateUser } = useAuth();

  const [editing, setEditing] = useState(false);
  const [historyView, setHistoryView] = useState<"grid" | "feed" | "saved">("grid");
  const [editName, setEditName] = useState(user?.name ?? "");
  const [editBio, setEditBio] = useState(user?.bio ?? "");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [profileBackgroundToCrop, setProfileBackgroundToCrop] = useState<ProfileBackgroundCropSource | null>(null);
  const [postImage, setPostImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [postCaption, setPostCaption] = useState("");
  const [isPublishingPost, setIsPublishingPost] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const queryClient = useQueryClient();
  const { data: profileData, refetch: refetchProfile } = useGetUser(user?.uid ?? 0, {
    query: { queryKey: getGetUserQueryKey(user?.uid ?? 0), enabled: !!user?.uid },
  });
  useFocusEffect(useCallback(() => {
    if (user?.uid) void refetchProfile();
  }, [user?.uid, refetchProfile]));


  const { data: historyData } = useGetUserStreams(user?.uid ?? 0, {
    query: { refetchOnWindowFocus: false } as any,
  });
  const streamHistory = historyData?.streams ?? [];
  const { data: postsData } = useGetUserPosts(user?.uid ?? 0, {
    query: { enabled: !!user?.uid, refetchOnWindowFocus: false } as any,
  });
  const savedPosts = useQuery({ queryKey: ["saved-posts", user?.uid], queryFn: () => getSavedPosts(), enabled: !!user && historyView === "saved" });
  const posts = (historyView === "saved" ? savedPosts.data?.posts : postsData?.posts) ?? [];

  const { data: coinData, refetch: refetchCoins } = useGetCoinBalance(
    { uid: user?.uid ?? 0 },
    { query: { enabled: !!user?.uid, refetchOnWindowFocus: false } as any },
  );
  const coinBalance = coinData?.balance ?? 0;

  const requestAvatarUpload = useRequestAvatarUpload();
  const requestProfileBackgroundUpload = useRequestProfileBackgroundUpload();
  const requestPostUpload = useRequestPostUpload();
  const createPost = useCreatePost();
  const deletePost = useDeletePost();
  const upsertUser = useUpsertUser();

  const choosePostImage = async () => {
    if (!user || isPublishingPost) return;
    if (Platform.OS === "web") {
      Alert.alert(t("Not available"), t("Creating posts requires the native app."));
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t("Permission needed"), t("Allow photo access to create a post."));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
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
      Alert.alert(t("Post not shared"), error instanceof Error ? error.message : t("Try again."));
    } finally {
      setIsPublishingPost(false);
    }
  };

  const confirmDeletePost = (postId: number) => {
    if (!user) return;
    Alert.alert(t("Delete post?"), t("This post will be permanently removed."), [
      { text: t("Cancel"), style: "cancel" },
      {
        text: t("Delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await deletePost.mutateAsync({ postId });
            await queryClient.invalidateQueries({ queryKey: getGetUserPostsQueryKey(user.uid) });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (error) {
            Alert.alert(t("Post not deleted"), error instanceof Error ? error.message : t("Try again."));
          }
        },
      },
    ]);
  };

  const pickAvatar = async () => {
    if (!user || isUploadingAvatar) return;
    if (Platform.OS === "web") {
      Alert.alert(t("Not available"), t("Avatar upload requires the native app."));
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("Permission needed"), t("Allow photo access to upload an avatar."));
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
          t("Avatar not saved"),
          error instanceof Error ? error.message : t("Choose another image and try again."),
        );
      } finally {
        setIsUploadingAvatar(false);
      }
    }
  };

  const saveProfileCover = async (asset: ProfileBackgroundCropSource) => {
    if (!user || isUploadingCover) return;
    setIsUploadingCover(true);
    try {
      const sourceWidth = asset.width;
      const sourceHeight = asset.height;
      const targetRatio = 16 / 9;
      const cropWidth = sourceWidth / sourceHeight > targetRatio
        ? sourceHeight * targetRatio
        : sourceWidth;
      const cropHeight = sourceWidth / sourceHeight > targetRatio
        ? sourceHeight
        : sourceWidth / targetRatio;
      const image = await ImageManipulator.manipulate(asset.uri)
        .crop({
          originX: Math.round((sourceWidth - cropWidth) / 2),
          originY: Math.round((sourceHeight - cropHeight) / 2),
          width: Math.round(cropWidth),
          height: Math.round(cropHeight),
        })
        .resize({ width: 1280, height: 720 })
        .renderAsync();
      const normalized = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.86 });
      const upload = await requestProfileBackgroundUpload.mutateAsync({ uid: user.uid });
      const sourceResponse = await expoFetch(normalized.uri);
      const uploadResponse = await expoFetch(upload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: await sourceResponse.blob(),
      });
      if (!uploadResponse.ok) throw new Error(`Profile background upload failed (${uploadResponse.status}).`);
      const updated = await upsertUser.mutateAsync({
        uid: user.uid,
        data: {
          name: user.name,
          bio: user.bio,
          profileBackgroundImagePath: upload.objectPath,
        },
      });
      updateUser({
        profileBackgroundImagePath: updated.user.profileBackgroundImagePath,
        profileBackgroundImageUrl: updated.user.profileBackgroundImageUrl,
      });
      setProfileBackgroundToCrop(null);
      await queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(user.uid) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert(
        t("Background not saved"),
        error instanceof Error ? error.message : t("Choose another image and try again."),
      );
    } finally {
      setIsUploadingCover(false);
    }
  };

  const pickProfileCover = async () => {
    if (!user || isUploadingCover || profileBackgroundToCrop || Platform.OS === "web") return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t("Permission needed"), t("Allow photo access to update your profile background."));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: Platform.OS !== "ios",
      aspect: [16, 9],
      quality: Platform.OS === "ios" ? 1 : 0.86,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    if (Platform.OS === "ios") {
      if (asset.width < 16 || asset.height < 9) {
        Alert.alert(t("Background not saved"), t("Choose another image and try again."));
        return;
      }
      setProfileBackgroundToCrop(asset);
      return;
    }
    await saveProfileCover(asset);
  };

  const saveProfile = () => {
    if (!editName.trim()) {
      Alert.alert(t("Name required"), t("Please enter a display name."));
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
  if (!user) return <SignedOutProfile />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {profileBackgroundToCrop ? (
        <ProfileBackgroundCropper
          source={profileBackgroundToCrop}
          onCancel={() => setProfileBackgroundToCrop(null)}
          onConfirm={saveProfileCover}
        />
      ) : null}
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false}>

        <View style={styles.cover}>
          <Image
            source={profileData?.user.profileBackgroundImageUrl || user.profileBackgroundImageUrl
              ? { uri: profileData?.user.profileBackgroundImageUrl ?? user.profileBackgroundImageUrl ?? undefined }
              : require("@/assets/images/profile-cover-sunset.png")}
            style={styles.absoluteFill}
            resizeMode="cover"
          />
          <View style={styles.coverShade} />
          <View style={[styles.header, { paddingTop: topInset + 12 }]}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Buy Coins")} onPress={() => router.push("/coin-store")} style={styles.headerCoinBalance}>
            <GoldCoinIcon />
            <Text style={styles.headerCoinAmount}>
              {coinBalance === 0 ? t("Buy Coins") : coinBalance.toLocaleString(appLocale())}
            </Text>
          </TouchableOpacity>
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
              style={styles.headerMenuBtn}
              onPress={() => router.push("/settings" as any)}
              accessibilityRole="button"
              accessibilityLabel={t("Open settings")}
              activeOpacity={0.8}
            >
              <Ionicons name="menu-outline" size={30} color="#FFF" />
            </TouchableOpacity>
          )}
          </View>
          <TouchableOpacity
            style={styles.coverEditButton}
            onPress={() => void pickProfileCover()}
            disabled={isUploadingCover}
            accessibilityRole="button"
            accessibilityLabel={t("Update profile background")}
          >
            <Ionicons name={isUploadingCover ? "hourglass-outline" : "camera-outline"} size={17} color="#FFF" />
          </TouchableOpacity>
          {user.country && locationPrivacy.isSuccess && !locationPrivacy.preferences.hideLocation ? <View style={styles.coverLocation}><Ionicons name="location" size={16} color="#FFF" /><Text style={styles.coverLocationText}>{user.country}</Text></View> : null}
        </View>

        {/* Avatar + info */}
        <View style={styles.profileBlock}>
          <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8} style={styles.avatarWrapper}>
            <Avatar uid={user.uid} name={user.name} avatarUri={user.avatarUri} size={120} borderWidth={3} borderColor="#080A10" />
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={15} color="#FFF" />
            </View>
          </TouchableOpacity>

          {editing ? (
            <View style={styles.editFields}>
              <TextInput
                style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                value={editName}
                onChangeText={setEditName}
                placeholder={t("Display name")}
                placeholderTextColor={colors.mutedForeground}
                maxLength={32}
              />
              <TextInput
                style={[styles.bioInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                value={editBio}
                onChangeText={setEditBio}
                placeholder={t("Bio")}
                placeholderTextColor={colors.mutedForeground}
                multiline
                maxLength={120}
              />
            </View>
          ) : (
            <>
              <View style={styles.nameRow}>
                <Text style={styles.displayName}>{user.name}</Text>
                <TouchableOpacity style={styles.nameEditButton} onPress={() => { setEditName(user.name ?? ""); setEditBio(user.bio ?? ""); setEditing(true); }} accessibilityRole="button" accessibilityLabel={t("Edit Profile")}>
                  <Ionicons name="pencil" size={14} color="#FFF" />
                </TouchableOpacity>
              </View>
              {user.bio ? (
                <Text style={styles.bio}>{user.bio}</Text>
              ) : null}
            </>
          )}

          {/* Stats */}
          <View style={styles.statsRow}>
            <TouchableOpacity style={styles.stat} accessibilityRole="button" accessibilityLabel={t("View followers")}
              onPress={() => router.push({ pathname: "/connections/[uid]", params: { uid: String(user.uid), tab: "followers", name: user.name } })}>
              <Text style={styles.statValue}>{profileData?.user.followersCount ?? user.followersCount}</Text>
              <Text style={[localizedTextStyle(), styles.statLabel]}>{t("Followers")}</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity style={styles.stat} accessibilityRole="button" accessibilityLabel={t("View following")}
              onPress={() => router.push({ pathname: "/connections/[uid]", params: { uid: String(user.uid), tab: "following", name: user.name } })}>
              <Text style={styles.statValue}>{profileData?.user.followingCount ?? user.followingCount}</Text>
              <Text style={[localizedTextStyle(), styles.statLabel]}>{t("Following")}</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{streamHistory.length}</Text>
              <Text style={[localizedTextStyle(), styles.statLabel]}>{t("Streams")}</Text>
            </View>
          </View>

        </View>

        {/* Grid divider */}
        <View style={styles.gridHeader}>
          <TouchableOpacity
            style={[
              styles.viewOption,
              historyView === "grid" && { borderBottomColor: colors.primary },
            ]}
            onPress={() => setHistoryView("grid")}
            activeOpacity={0.7}
            accessibilityLabel={t("Grid view")}
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
            accessibilityLabel={t("Feed view")}
          >
            <Ionicons
              name={historyView === "feed" ? "list" : "list-outline"}
              size={22}
              color={historyView === "feed" ? colors.primary : colors.mutedForeground}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.viewOption,
              historyView === "saved" && { borderBottomColor: colors.primary },
            ]}
            onPress={() => setHistoryView("saved")}
            activeOpacity={0.7}
            accessibilityLabel={t("Saved posts")}
            accessibilityRole="tab"
            accessibilityState={{ selected: historyView === "saved" }}
          >
            <Ionicons
              name={historyView === "saved" ? "bookmark" : "bookmark-outline"}
              size={20}
              color={historyView === "saved" ? colors.primary : colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>

        {/* Past streams grid */}
        {historyView === "saved" && (savedPosts.isPending || savedPosts.isError) ? <TouchableOpacity style={styles.emptyGrid} disabled={savedPosts.isPending} onPress={() => void savedPosts.refetch()}><Text style={[localizedTextStyle(), { color: colors.mutedForeground }]}>{savedPosts.isPending ? t("Loading saved posts...") : t("Couldn't load saved posts. Retry")}</Text></TouchableOpacity> : posts.length === 0 ? (
          <View style={styles.emptyGrid}>
            <Ionicons name="images-outline" size={36} color={colors.mutedForeground} />
            <Text style={[localizedTextStyle(), [styles.emptyText, { color: colors.mutedForeground }]]}>
              {historyView === "saved" ? t("No saved posts yet") : t("No posts yet")}
            </Text>
            {historyView !== "saved" ? <Text style={[localizedTextStyle(), [styles.emptySubText, { color: colors.mutedForeground }]]}>{t("Tap + to share your first photo")}</Text> : null}
          </View>
        ) : historyView !== "feed" ? (
          <View style={styles.grid}>
            {posts.map((post) => (
              <TouchableOpacity
                key={post.id}
                style={styles.gridCell}
                onPress={() => router.push({ pathname: "/posts/[uid]", params: { uid: String(user.uid), name: user.name, postId: String(post.id), saved: historyView === "saved" ? "1" : "0" } })}
                accessibilityLabel={t("Open photo")}
                onLongPress={post.ownerUserId === user.uid ? () => confirmDeletePost(post.id) : undefined}
                activeOpacity={0.85}
              >
                <Image source={{ uri: post.imageUrl }} style={styles.absoluteFill} resizeMode="cover" />
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
                      <Text style={[styles.feedDate, { color: colors.mutedForeground }]}>{formatDate(post.createdAt, appLocale())}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => confirmDeletePost(post.id)}
                      hitSlop={10}
                      accessibilityLabel={t("Post options")}
                    >
                      <Ionicons name="ellipsis-horizontal" size={20} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.feedMedia}>
                    <Image source={{ uri: post.imageUrl }} style={styles.absoluteFill} resizeMode="contain" />
                    <PostGiftTotal postId={post.id} />
                  </View>

                  <PostFooter postId={post.id} ownerUid={post.ownerUserId} caption={post.caption} />
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
        accessibilityLabel={t("Create a new post")}
      >
        <Ionicons name="add" size={30} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={!!postImage} transparent animationType="slide" onRequestClose={() => { if (!isPublishingPost) setPostImage(null); }}>
        <KeyboardAvoidingView style={styles.postModalBackdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[styles.postModal, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={[styles.postModalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[localizedTextStyle(), [styles.postModalTitle, { color: colors.foreground }]]}>{t("New Post")}</Text>
            </View>
            <View style={styles.postPreviewArea}>
              {postImage ? <Image source={{ uri: postImage.uri }} style={styles.absoluteFill} resizeMode="contain" /> : null}
            </View>
            <View style={[styles.postComposerControls, { borderTopColor: colors.border }]}>
              <TextInput
                value={postCaption}
                onChangeText={setPostCaption}
                placeholder={t("Write a caption…")}
                placeholderTextColor={colors.mutedForeground}
                maxLength={2200}
                multiline
                style={[styles.postCaptionInput, { color: colors.foreground, borderColor: colors.border }]}
                editable={!isPublishingPost}
              />
              <Text style={[styles.postCaptionCount, { color: colors.mutedForeground }]}>
                {postCaption.length}/2200
              </Text>
            <View style={styles.postModalFooter}>
              <TouchableOpacity style={styles.postModalButton} onPress={() => setPostImage(null)} disabled={isPublishingPost} accessibilityRole="button">
                <Text style={[localizedTextStyle(), [styles.postModalAction, { color: colors.mutedForeground }]]}>{t("Cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.postModalButton, { backgroundColor: colors.primary, opacity: isPublishingPost ? 0.6 : 1 }]} onPress={publishPost} disabled={isPublishingPost} accessibilityRole="button" accessibilityState={{ disabled: isPublishingPost, busy: isPublishingPost }}>
                <Text style={[localizedTextStyle(), [styles.postModalAction, { color: "#FFF" }]]}>
                  {isPublishingPost ? t("Posting…") : t("Post")}
                </Text>
              </TouchableOpacity>
            </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  cover: { height: 232, position: "relative", overflow: "hidden", borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  coverShade: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(3,5,12,0.28)" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    zIndex: 1,
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
    color: "#FFF",
  },
  headerMenuBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  coverEditButton: { position: "absolute", left: 16, bottom: 12, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(8,10,16,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  coverLocation: { position: "absolute", right: 16, bottom: 16, flexDirection: "row", alignItems: "center", gap: 4 },
  coverLocationText: { color: "#FFF", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  profileBlock: { alignItems: "center", paddingHorizontal: 24, gap: 6, paddingBottom: 10, marginTop: -58 },
  avatarWrapper: { position: "relative", marginBottom: 1 },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#080A10",
    backgroundColor: "#FF1966",
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 1 },
  displayName: { fontSize: 20, lineHeight: 25, color: "#FFF", fontFamily: "Inter_600SemiBold" },
  nameEditButton: {
    width: 32,
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#44306D",
  },
  bio: { color: "#C2BDE9", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
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
  statsRow: { width: "92%", flexDirection: "row", alignItems: "center", marginTop: 8 },
  stat: { flex: 1, alignItems: "center", gap: 3 },
  statDivider: { width: 1, height: 32, marginHorizontal: 8, backgroundColor: "#5C4A85" },
  statValue: { color: "#FFF", fontSize: 18, lineHeight: 22, fontFamily: "Inter_600SemiBold" },
  statLabel: { color: "#BDB8E8", fontSize: 11, fontFamily: "Inter_400Regular" },
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
    gap: 36,
    marginTop: 0,
    borderTopWidth: 2,
    borderBottomWidth: 1,
    borderColor: "#44306D",
  },
  viewOption: {
    width: 56,
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
    height: GRID_CELL / POST_ASPECT_RATIO,
    flexShrink: 0,
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
    aspectRatio: POST_ASPECT_RATIO,
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
    height: "90%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
  },
  postModalHeader: {
    height: 58,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderBottomWidth: 1,
  },
  postModalTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  postModalAction: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  postModalFooter: {
    flexDirection: "row",
    flexShrink: 0,
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  postModalButton: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  postPreviewArea: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  postComposerControls: {
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  postCaptionInput: {
    height: 80,
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
