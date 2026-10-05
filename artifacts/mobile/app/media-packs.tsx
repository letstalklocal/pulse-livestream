import { GiftImageArtwork, hasGiftImage } from "@/components/GiftImageArtwork";
import { DirectVideoThumbnail } from "@/components/DirectVideoThumbnail";
import { GoldCoinIcon } from "@/components/GoldCoinIcon";
import { GIFTS } from "@/components/GiftPicker";
import { CrownArtwork } from "@/components/CrownArtwork";
import { useQueryClient } from "@tanstack/react-query";
import { t, useAppLanguage, localizedTextStyle } from "@/i18n";
import { Ionicons } from "@expo/vector-icons";
import { uploadPrivateMedia, type MediaUploadSession } from "@/utils/resumableMediaUpload";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useRouter, useLocalSearchParams } from "expo-router";
import React, { useState, useEffect, useRef } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// Pack operations are generated from the API spec during the API build.
// @ts-ignore generated media-pack hooks
import {
  useCreateMediaPack,
  useUpdateMediaPack,
  type UpdateMediaPackRequest,
  useDeleteMediaPack,
  useGetMediaPacks,
  useRequestMediaPackUpload,
  useSendMediaPack,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type PickedAsset = ImagePicker.ImagePickerAsset & { savedItemId?: string };
const nativeOnly = () => Platform.OS === "web";

export default function MediaPacksScreen() {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    create: createParam,
    recipientId,
    returnToSticker,
  } = useLocalSearchParams<{
    create?: string;
    recipientId?: string;
    returnToSticker?: string;
  }>();
  const queryClient = useQueryClient();
  const packsQuery = useGetMediaPacks({
    query: { refetchOnWindowFocus: false },
  } as any);
  const create = useCreateMediaPack();
  const update = useUpdateMediaPack();
  const busyRef = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const remove = useDeleteMediaPack();
  const requestUpload = useRequestMediaPackUpload();
  const sendPack = useSendMediaPack();
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState("");
  const [giftId, setGiftId] = useState<string | null>(null);
  const [assets, setAssets] = useState<PickedAsset[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const uploadSessions = useRef(new Map<string, MediaUploadSession>());
  const uploadController = useRef<AbortController | null>(null);
  useEffect(() => () => { uploadController.current?.abort(); uploadSessions.current.clear(); }, []);

  const openCreate = () => {
    if (busyRef.current) return;
    uploadSessions.current.clear();
    setEditingId(null);
    setName("");
    setGiftId(null);
    setAssets([]);
    setError(null);
    setVisible(true);
  };
  const openEdit = (pack: any) => {
    if (busyRef.current) return;
    uploadSessions.current.clear();
    setEditingId(pack.id);
    setName(pack.name);
    setGiftId(pack.giftId ?? "rose");
    setError(null);
    setAssets(
      pack.items.map((item: any) => ({
        savedItemId: item.id,
        uri: item.mediaUrl,
        type: item.mediaType,
        mimeType: item.contentType,
        width: item.width ?? 1,
        height: item.height ?? 1,
        duration: item.durationMs,
      })),
    );
    setVisible(true);
  };
  const closeEditor = () => {
    if (!busyRef.current) setVisible(false);
  };
  useEffect(() => {
    if (createParam === "1") openCreate();
  }, [createParam]);
  const choose = async () => {
    if (busyRef.current || assets.length >= 20) return;
    if (nativeOnly()) {
      Alert.alert(
        t("Native app required"),
        t(
          "Selecting and uploading media packs is available in the iOS or Android app.",
        ),
      );
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        t("Permission needed"),
        t(
          "Allow photo library access to add media. You can enable it in Settings.",
        ),
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      selectionLimit: 20 - assets.length,
      quality: 0.85,
    });
    if (!result.canceled)
      setAssets((old) => [...old, ...result.assets].slice(0, 20));
  };
  const save = async () => {
    if (busyRef.current) return;
    if (!giftId) {
      setError("Choose a gift");
      return;
    }
    if (!name.trim() || assets.length < 1) {
      setError("Add a name and between 1 and 20 items.");
      return;
    }
    busyRef.current = true;
    setSaving(true);
    setError(null);
    setUploadProgress(0);
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      const items: UpdateMediaPackRequest["items"] = [];
      for (let i = 0; i < assets.length; i += 1) {
        const asset = assets[i]!;
        if (asset.savedItemId) {
          items.push({ id: asset.savedItemId });
          setUploadProgress(Math.floor((i + 1) / assets.length * 100));
          continue;
        }
        const contentType =
          asset.mimeType ??
          (asset.type === "video" ? "video/mp4" : "image/jpeg");
        let upload = uploadSessions.current.get(asset.uri);
        if (!upload) {
          upload = await requestUpload.mutateAsync({ data: { contentType, resumable: true } });
          uploadSessions.current.set(asset.uri, upload);
        }
        await uploadPrivateMedia(asset.uri, contentType, upload, controller.signal,
          percent => { if (!controller.signal.aborted) setUploadProgress(Math.floor((i + percent / 100) / assets.length * 100)); });
        items.push({
          mediaType:
            asset.type === "video" ? ("video" as const) : ("image" as const),
          contentType,
          width: asset.width,
          height: asset.height,
          durationMs: asset.duration ?? undefined,
          objectPath: (upload as any).objectPath,
        });
      }
      if (controller.signal.aborted) return;
      setUploadProgress(null);
      const selectedGift = giftId as UpdateMediaPackRequest["giftId"];
      const createdPack = editingId
        ? await update.mutateAsync({
            packId: Number(editingId),
            data: { giftId: selectedGift, items },
          })
        : await create.mutateAsync({
            data: {
              name: name.trim(),
              giftId: selectedGift,
              items: items as Exclude<
                UpdateMediaPackRequest["items"][number],
                { id: string }
              >[],
            },
          });
      await packsQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["sticker-packs"] });
      await queryClient.invalidateQueries({ queryKey: ["live-stickers"] });
      if (editingId) {
        await queryClient.invalidateQueries({
          queryKey: [`/api/media-packs/${editingId}`],
        });
        setVisible(false);
        setEditingId(null);
        return;
      }
      if (returnToSticker === "1" && !recipientId) {
        setVisible(false);
        router.back();
        return;
      }

      if (recipientId) {
        const createdPackId =
          (createdPack as any)?.pack?.id ?? (createdPack as any)?.id;
        await sendPack.mutateAsync({
          packId: createdPackId,
          data: {
            recipientId: Number(recipientId),
            idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
          } as any,
        });
        setVisible(false);
        router.back();
        return;
      }

      setVisible(false);
      setName("");
      setGiftId(null);
      setAssets([]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Your pack could not be created. Check your connection and try again.",
      );
    } finally {
      busyRef.current = false;
      setSaving(false);
      setUploadProgress(null);
      if (uploadController.current === controller) uploadController.current = null;
    }
  };
  const packs = ((packsQuery.data as any)?.packs ??
    packsQuery.data ??
    []) as any[];
  return (
    <View
      style={[
        styles.page,
        { backgroundColor: colors.background, paddingTop: insets.top + 8 },
      ]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={25} color={colors.foreground} />
        </TouchableOpacity>
        <Text
          style={[
            localizedTextStyle(),
            [styles.title, { color: colors.foreground }],
          ]}
        >
          {t("Media Packs")}
        </Text>
        <TouchableOpacity onPress={openCreate} testID="pack-create-open">
          <Ionicons name="add-circle" size={28} color={colors.primary} />
        </TouchableOpacity>
      </View>
      <Text
        style={[
          localizedTextStyle(),
          [styles.subtitle, { color: colors.mutedForeground }],
        ]}
      >
        {t("Sell a reusable set of photos and videos in DMs.")}
      </Text>
      <FlatList
        data={packs}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.pack,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.packIcon,
                { backgroundColor: "rgba(255,25,102,.14)" },
              ]}
            >
              <Ionicons name="images" size={21} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.packName, { color: colors.foreground }]}>
                {item.name}
              </Text>
              <Text
                style={[
                  localizedTextStyle(),
                  [styles.meta, { color: colors.mutedForeground }],
                ]}
              >
                {t("{v0} items · 🪙 {v1}", {
                  v0: item.itemCount,
                  v1: item.price,
                })}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => openEdit(item)}
              testID={`pack-edit-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={t("Edit pack")}
              hitSlop={10}
              disabled={saving}
            >
              <Ionicons
                name="create-outline"
                size={21}
                color={colors.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => remove.mutate({ packId: item.id } as any)}
              testID={`pack-delete-${item.id}`}
            >
              <Ionicons
                name="trash-outline"
                size={19}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name="albums-outline"
              size={48}
              color={colors.mutedForeground}
            />
            <Text
              style={[
                localizedTextStyle(),
                [styles.emptyTitle, { color: colors.foreground }],
              ]}
            >
              {t("Your vault is empty")}
            </Text>
            <Text
              style={[
                localizedTextStyle(),
                [styles.emptyCopy, { color: colors.mutedForeground }],
              ]}
            >
              {t("Create a pack once, then share it with anyone.")}
            </Text>
            <TouchableOpacity
              onPress={openCreate}
              style={[styles.create, { backgroundColor: colors.primary }]}
              testID="pack-create-empty"
            >
              <Text style={[localizedTextStyle(), styles.createText]}>
                {t("Create a pack")}
              </Text>
            </TouchableOpacity>
          </View>
        }
      />
      <Modal
        visible={visible}
        animationType="slide"
        onRequestClose={closeEditor}
      >
        <View
          style={[
            styles.modal,
            { backgroundColor: colors.background, paddingTop: insets.top + 12 },
          ]}
        >
          <View style={styles.header}>
            <Text
              style={[
                localizedTextStyle(),
                [styles.title, { color: colors.foreground }],
              ]}
            >
              {t(editingId ? "Edit pack" : "New pack")}
            </Text>
            <TouchableOpacity onPress={closeEditor} disabled={saving}>
              <Ionicons name="close" size={26} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.form}>
            <TextInput
              editable={!editingId && !saving}
              value={name}
              onChangeText={setName}
              placeholder={t("Pack name")}
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                },
              ]}
            />
            <Text style={[styles.packName, { color: colors.foreground }]}>
              {t("Choose a gift")}
            </Text>
            <View
              testID="pack-gift-options"
              style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
            >
              {GIFTS.map((gift) => (
                <TouchableOpacity
                  key={gift.id}
                  testID={`pack-gift-${gift.id}`}
                  disabled={saving}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: giftId === gift.id }}
                  accessibilityLabel={t(gift.name)}
                  onPress={() => setGiftId(gift.id)}
                  style={{
                    width: 78,
                    padding: 8,
                    alignItems: "center",
                    borderWidth: 1,
                    borderRadius: 12,
                    borderColor:
                      giftId === gift.id ? colors.primary : colors.border,
                    backgroundColor: colors.card,
                  }}
                >
                  {gift.id === "crown" ? (
                    <CrownArtwork size={32} />
                  ) : hasGiftImage(gift.id) ? (
                    <GiftImageArtwork gift={gift.id} size={28} />
                  ) : (
                    <Text style={{ fontSize: 28 }}>{gift.emoji}</Text>
                  )}
                  <Text style={{ color: colors.foreground, fontSize: 12 }}>
                    {t(gift.name)}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      marginTop: 4,
                    }}
                  >
                    <GoldCoinIcon size={13} />
                    <Text style={{ color: colors.foreground, fontSize: 12 }}>
                      {appNumber(gift.coins)}
                    </Text>
                  </View>
                  {giftId === gift.id ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={colors.primary}
                    />
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              disabled={saving || assets.length >= 20}
              onPress={choose}
              style={[styles.addMedia, { borderColor: colors.primary }]}
              testID="pack-media-picker"
            >
              <Ionicons name="add" size={23} color={colors.primary} />
              <Text
                style={[
                  localizedTextStyle(),
                  [styles.addMediaText, { color: colors.primary }],
                ]}
              >
                {t("Add photos or videos · {v0}/20", { v0: assets.length })}
              </Text>
            </TouchableOpacity>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbs}
            >
              {assets.map((asset, index) => (
                <View key={`${asset.uri}-${index}`} style={styles.thumb}>
                  {asset.type === "video" ? <DirectVideoThumbnail uri={asset.uri} style={styles.image} /> : <Image source={{ uri: asset.uri }} style={styles.image} />}
                  {asset.type === "video" && (
                    <Ionicons
                      name="videocam"
                      size={16}
                      color="#FFF"
                      style={styles.video}
                    />
                  )}
                  <TouchableOpacity
                    disabled={saving}
                    onPress={() =>
                      setAssets((a) => a.filter((_, i) => i !== index))
                    }
                    style={styles.remove}
                    testID={`pack-media-remove-${index}`}
                  >
                    <Ionicons name="close" size={13} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            {error && <Text style={styles.error}>{t(error)}</Text>}
            {saving && uploadProgress !== null && <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
              <Text style={{ color: colors.foreground }}>{t("Uploading: {v0}%", { v0: uploadProgress })}</Text>
              <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden" }}>
                <View style={{ height: 4, backgroundColor: colors.primary, width: `${uploadProgress}%` }} />
              </View>
            </View>}
            <TouchableOpacity
              onPress={save}
              disabled={saving || !giftId}
              style={[
                styles.create,
                {
                  backgroundColor:
                    saving || !giftId ? colors.muted : colors.primary,
                },
              ]}
              testID="pack-create-submit"
            >
              <Text style={[localizedTextStyle(), styles.createText]}>
                {saving
                  ? uploadProgress === null ? t("Saving…") : t("Uploading: {v0}%", { v0: uploadProgress })
                  : t(editingId ? "Save changes" : "Create media pack")}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 25, fontFamily: "Inter_700Bold" },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  pack: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  packIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  packName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 3 },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 9,
    paddingBottom: 70,
  },
  emptyTitle: { fontSize: 19, fontFamily: "Inter_700Bold", marginTop: 7 },
  emptyCopy: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  create: {
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 12,
  },
  createText: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 14 },
  modal: { flex: 1 },
  form: { padding: 20, gap: 12, paddingBottom: 50 },
  input: {
    borderWidth: 1,
    borderRadius: 13,
    padding: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  addMedia: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 13,
    padding: 17,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 7,
  },
  addMediaText: { fontFamily: "Inter_600SemiBold" },
  thumbs: { gap: 10 },
  thumb: {
    width: 82,
    height: 82,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
  },
  image: { width: "100%", height: "100%" },
  remove: {
    position: "absolute",
    right: 4,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  video: { position: "absolute", left: 6, bottom: 6 },
  error: {
    color: "#FF4444",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
  },
});
