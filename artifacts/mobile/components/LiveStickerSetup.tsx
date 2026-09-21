import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { MediaPackGallery, type PackMediaItem } from "./MediaPackGallery";
import { GoldCoinIcon } from "./GoldCoinIcon";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth as useClerkAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useAppLanguage } from "@/i18n";
import { GIFTS } from "./GiftPicker";
import { LiveStickerCard } from "./LiveStickerCard";
import {
  stickerApi,
  type StickerDraft,
  type LiveSticker,
} from "@/utils/liveStickers";
type Pack = {
  id: string;
  name: string;
  price: number;
  giftId: string;
  items: PackMediaItem[];
};
function useStickerPacks(enabled: boolean) {
  const { getToken } = useClerkAuth();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sticker-packs", user?.uid],
    enabled: !!user && enabled,
    queryFn: ({ signal }) =>
      stickerApi<{ packs: Pack[] }>(
        "/media-packs",
        getToken,
        "GET",
        undefined,
        signal,
      ),
  });
}
function preview(
  draft: StickerDraft,
  id: string,
  packs: Pack[] = [],
): LiveSticker {
  const gift = GIFTS.find((g) => g.id === draft.giftId)!;
  const pack = packs.find((p) => Number(p.id) === draft.packId);
  return {
    ...draft,
    id,
    giftId: pack?.giftId ?? draft.giftId,
    name: pack?.name ?? gift.name,
    price: pack?.price ?? gift.coins,
    owned: false,
    videos: pack?.items.filter((i) => i.mediaType === "video").length ?? 0,
    pictures: pack?.items.filter((i) => i.mediaType === "image").length ?? 0,
  };
}
export function LiveStickerSetup({
  value,
  onChange,
  disabled,
  onUploadVideo,
}: {
  value: StickerDraft[];
  onChange: (value: StickerDraft[]) => void;
  disabled: boolean;
  onUploadVideo?: () => void;
}) {
  const { t } = useAppLanguage();
  const [editing, setEditing] = useState<{
    index: number | null;
    kind: "gift" | "pack";
  } | null>(null);
  const packs = useStickerPacks(value.some((s) => s.kind === "pack"));
  const manage = (draft: StickerDraft, index: number) =>
    Alert.alert(t("Sticker options"), undefined, [
      {
        text: t("Close sticker"),
        style: "destructive",
        onPress: () => onChange(value.filter((_, i) => i !== index)),
      },
      {
        text: t("Replace sticker"),
        onPress: () => setEditing({ index, kind: draft.kind }),
      },
      { text: t("Cancel"), style: "cancel" },
    ]);
  return (
    <View>
      <View style={styles.row}>
        {(["gift", "pack"] as const).map((kind) => (
          <TouchableOpacity
            key={kind}
            disabled={disabled || value.length >= 2}
            onPress={() => setEditing({ index: null, kind })}
            style={[
              styles.add,
              (disabled || value.length >= 2) && { opacity: 0.4 },
            ]}
            accessibilityRole="button"
          >
            <Ionicons
              name={kind === "gift" ? "gift-outline" : "images-outline"}
              size={24}
              color="white"
            />
            <Text style={styles.label}>
              {t(kind === "gift" ? "Add gift sticker" : "Add pack sticker")}
            </Text>
          </TouchableOpacity>
        ))}
        {onUploadVideo ? (
          <TouchableOpacity
            testID="stream-entry-video"
            disabled={disabled}
            onPress={onUploadVideo}
            style={[styles.add, disabled && { opacity: 0.4 }]}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t("Upload Video")}
          >
            <Ionicons name="videocam-outline" size={24} color="white" />
            <Text style={styles.label}>{t("Upload Video")}</Text>
          </TouchableOpacity>
        ) : null}
        {value.map((draft, index) => (
          <LiveStickerCard
            key={index}
            sticker={preview(draft, String(index), packs.data?.packs)}
            onDoublePress={() => manage(draft, index)}
            disabled={disabled}
          />
        ))}
      </View>
      {editing ? (
        <LiveStickerPicker
          initialKind={editing.kind}
          replacing={editing.index !== null}
          disabled={disabled}
          excludedPackIds={value
            .filter((_, i) => i !== editing.index)
            .map((s) => s.packId)
            .filter((id): id is number => id !== undefined)}
          onClose={() => setEditing(null)}
          onSelect={(draft) => {
            if (editing.index !== null)
              onChange(value.map((s, i) => (i === editing.index ? draft : s)));
            else if (value.length < 2) onChange([...value, draft]);
            setEditing(null);
          }}
        />
      ) : null}
    </View>
  );
}
/** Shared selector for pre-live setup and replacing one active sticker. */
export function LiveStickerPicker({
  initialKind,
  replacing = false,
  excludedPackIds,
  disabled,
  onClose,
  onSelect,
}: {
  initialKind: "gift" | "pack";
  replacing?: boolean;
  excludedPackIds: number[];
  disabled: boolean;
  onClose: () => void;
  onSelect: (draft: StickerDraft) => void;
}) {
  const { t } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [previewPack, setPreviewPack] = useState<Pack | null>(null);
  const createPack = () => {
    onClose();
    router.push({
      pathname: "/media-packs",
      params: { create: "1", returnToSticker: "1" },
    });
  };
  const [kind, setKind] = useState(initialKind);
  const [giftId, setGiftId] = useState<string | null>(null);
  const packs = useStickerPacks(kind === "pack");
  const available =
    packs.data?.packs.filter((p) => !excludedPackIds.includes(Number(p.id))) ??
    [];
  const submit = () => {
    if (!disabled && giftId) onSelect({ kind: "gift", giftId });
  };
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (previewPack) setPreviewPack(null);
        else if (!disabled) onClose();
      }}
    >
      {previewPack ? (
        <MediaPackGallery
          embedded
          items={previewPack.items}
          onClose={() => setPreviewPack(null)}
        />
      ) : (
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.heading}>
              <Text style={styles.title}>
                {t(kind === "pack" ? "Pick a pack" : "Choose gift artwork")}
              </Text>
              <View style={styles.headerActions}>
                {kind === "pack" ? (
                  <TouchableOpacity
                    disabled={disabled}
                    testID="sticker-create-pack"
                    onPress={createPack}
                    style={styles.newPackAction}
                    accessibilityRole="button"
                    accessibilityLabel={t("Create a pack")}
                  >
                    <Ionicons name="add" size={20} color="#FF5A8D" />
                    <Text style={styles.newPackText}>{t("New")}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  disabled={disabled}
                  onPress={onClose}
                  accessibilityLabel={t("Close")}
                  style={{ padding: 12 }}
                >
                  <Ionicons name="close" size={24} color="white" />
                </TouchableOpacity>
              </View>
            </View>
            {replacing ? (
              <View style={styles.row}>
                {(["gift", "pack"] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    disabled={disabled}
                    style={[styles.tab, type === kind && styles.selectedTab]}
                    onPress={() => {
                      setKind(type);
                      setGiftId(null);
                    }}
                  >
                    <Text style={styles.label}>
                      {t(type === "gift" ? "Gift sticker" : "Pack sticker")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <ScrollView>
              {kind === "pack" ? (
                <>
                  {packs.isLoading ? (
                    <ActivityIndicator />
                  ) : packs.isError ? (
                    <TouchableOpacity onPress={() => void packs.refetch()}>
                      <Text style={styles.title}>{t("Please try again.")}</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <Text style={styles.title}>
                        {t("Choose from your existing packs")}
                      </Text>
                      {!available.length ? (
                        <Text style={styles.label}>
                          {t(
                            packs.data?.packs.length
                              ? "All your packs are already on stickers."
                              : "Create a media pack first",
                          )}
                        </Text>
                      ) : (
                        available.map((pack) => (
                          <TouchableOpacity
                            key={pack.id}
                            style={styles.packCard}
                            testID={`sticker-pack-option-${pack.id}`}
                            disabled={disabled}
                            accessibilityRole="button"
                            onPress={() => {
                              if (!disabled)
                                onSelect({
                                  kind: "pack",
                                  packId: Number(pack.id),
                                  giftId: pack.giftId ?? "rose",
                                });
                            }}
                          >
                            <View style={styles.thumbnails}>
                              {pack.items.slice(0, 4).map((item) => (
                                <View key={item.id} style={styles.thumbnail}>
                                  {item.mediaType === "image" &&
                                  item.mediaUrl ? (
                                    <Image
                                      source={{ uri: item.mediaUrl }}
                                      style={styles.thumbnailImage}
                                      contentFit="cover"
                                    />
                                  ) : (
                                    <Ionicons
                                      name="videocam"
                                      size={28}
                                      color="white"
                                    />
                                  )}
                                </View>
                              ))}
                            </View>
                            <View style={styles.packTitle}>
                              <Text style={[styles.title, { flex: 1 }]}>
                                {pack.name}
                              </Text>
                            </View>
                            <View style={styles.packMeta}>
                              <Ionicons
                                name="videocam"
                                color="white"
                                size={16}
                              />
                              <Text style={styles.label}>
                                {
                                  pack.items.filter(
                                    (item) => item.mediaType === "video",
                                  ).length
                                }
                              </Text>
                              <Ionicons name="image" color="white" size={16} />
                              <Text style={styles.label}>
                                {
                                  pack.items.filter(
                                    (item) => item.mediaType === "image",
                                  ).length
                                }
                              </Text>
                              <GoldCoinIcon size={16} />
                              <Text style={styles.label}>{pack.price}</Text>
                              <TouchableOpacity
                                disabled={disabled}
                                testID={`sticker-pack-preview-${pack.id}`}
                                onPress={(event) => {
                                  event?.stopPropagation();
                                  setPreviewPack(pack);
                                }}
                                style={styles.previewAction}
                                hitSlop={8}
                                accessibilityRole="button"
                              >
                                <Ionicons
                                  name="eye-outline"
                                  size={14}
                                  color="#FF5A8D"
                                />
                                <Text style={styles.previewText}>
                                  {t("Preview")}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </TouchableOpacity>
                        ))
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <View style={styles.gifts}>
                    {GIFTS.map((gift) => {
                      const draft: StickerDraft = {
                        kind: "gift",
                        giftId: gift.id,
                      };
                      return (
                        <View
                          key={gift.id}
                          style={[
                            styles.giftOption,
                            giftId === gift.id && styles.selectedPack,
                          ]}
                        >
                          <LiveStickerCard
                            sticker={preview(draft, gift.id, packs.data?.packs)}
                            disabled={disabled}
                            onPress={() => setGiftId(gift.id)}
                          />
                          {giftId === gift.id ? (
                            <Ionicons
                              name="checkmark-circle"
                              size={18}
                              color="#FF1966"
                              style={styles.giftCheck}
                            />
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
            </ScrollView>
            {kind === "gift" ? (
              <View style={styles.footer}>
                <TouchableOpacity
                  testID="sticker-picker-next"
                  disabled={disabled || !giftId}
                  onPress={submit}
                  style={[
                    styles.primary,
                    (disabled || !giftId) && styles.primaryDisabled,
                  ]}
                >
                  <Text style={styles.primaryText}>
                    {t(replacing ? "Replace sticker" : "Add sticker")}
                  </Text>
                  {disabled ? <ActivityIndicator color="white" /> : null}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      )}
    </Modal>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginVertical: 8,
  },
  headerActions: { flexDirection: "row", alignItems: "center" },
  newPackAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    minHeight: 44,
    paddingHorizontal: 8,
  },
  newPackText: {
    color: "#FF5A8D",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  selectedPack: {
    borderColor: "#FF1966",
    backgroundColor: "rgba(255,25,102,.12)",
  },
  giftOption: {
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 10,
    padding: 5,
  },
  giftCheck: { position: "absolute", top: -5, right: -5 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 16,
  },
  primary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 23,
    backgroundColor: "#FF1966",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryDisabled: { opacity: 0.4 },
  primaryText: {
    color: "white",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  packTitle: { flexDirection: "row", alignItems: "center", gap: 10 },
  packCard: {
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.25)",
    borderRadius: 14,
    marginVertical: 8,
  },
  thumbnails: { flexDirection: "row", gap: 6 },
  thumbnail: {
    width: 64,
    height: 76,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#303040",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnailImage: { width: "100%", height: "100%" },
  packMeta: { flexDirection: "row", gap: 7, alignItems: "center" },
  previewAction: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    minHeight: 28,
    paddingHorizontal: 4,
  },
  previewText: {
    color: "#FF5A8D",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  add: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: "rgba(0,0,0,.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.4)",
  },
  label: { color: "white", textAlign: "center", fontSize: 11 },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,.5)",
  },
  sheet: {
    backgroundColor: "#17171D",
    padding: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "70%",
  },
  heading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { color: "white", fontSize: 16 },
  option: { padding: 16, gap: 6 },
  gifts: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
  },
  tab: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#777" },
  selectedTab: { borderColor: "#FF1966", backgroundColor: "#42202C" },
});
