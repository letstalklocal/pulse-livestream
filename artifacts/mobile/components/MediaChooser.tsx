import { t, useAppLanguage, localizedTextStyle } from "@/i18n";
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform, Alert, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRequestMediaPackUpload, useSendMediaDm } from '@workspace/api-client-react';
// @ts-ignore
import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { useRouter } from 'expo-router';

interface MediaChooserProps {
  visible: boolean;
  peerId: string;
  onClose: () => void;
  onOpenPackPicker: () => void;
  onMediaSent: () => void;
}

export function MediaChooser({ visible, peerId, onClose, onOpenPackPicker, onMediaSent }: MediaChooserProps) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  const requestUpload = useRequestMediaPackUpload();
  const sendMediaDm = useSendMediaDm();
  
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePickMedia = async () => {
    if (Platform.OS === "web") {
      Alert.alert(t("Native app required"), t("Selecting and uploading media is available in the iOS or Android app."));
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t("Permission needed"), t("Allow photo library access to add media."));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: false,
      quality: 0.85,
    });
    
    if (!result.canceled && result.assets.length > 0) {
      setAsset(result.assets[0]!);
      setIsPaid(false);
      setPrice("");
      setError(null);
    }
  };

  const handleSend = () => {
    const coinPrice = isPaid ? Number(price) : 0;
    if (isPaid && (!Number.isInteger(coinPrice) || coinPrice <= 0)) {
      setError("Price must be a valid positive number.");
      return;
    }
    
    if (coinPrice > 0) {
      Alert.alert(
        t("Send Paid Media?"),
        t("Users will need to pay {v0} coins to view this media.", { v0: coinPrice }),
        [
          { text: t("Cancel"), style: "cancel" },
          { text: t("Send"), style: "default", onPress: () => void performUpload(coinPrice) }
        ]
      );
    } else {
      void performUpload(0);
    }
  };

  const performUpload = async (coinPrice: number) => {
    if (!asset) return;
    setUploading(true);
    setError(null);
    
    try {
      const upload = await requestUpload.mutateAsync({
        data: {
          contentType: asset.mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg")
        }
      } as any);
      
      const response = await fetch((upload as any).uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": asset.mimeType ?? "application/octet-stream" },
        body: new File(asset.uri) as any
      });
      
      if (!response.ok) throw new Error("Upload failed. Please try again.");
      
      await sendMediaDm.mutateAsync({
        data: {
          recipientId: Number(peerId),
          objectPath: (upload as any).objectPath,
          mediaType: asset.type === "video" ? "video" : "image",
          contentType: asset.mimeType ?? "image/jpeg",
          width: asset.width,
          height: asset.height,
          durationMs: asset.duration ?? undefined,
          price: coinPrice,
          idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
        } as any
      });
      
      setAsset(null);
      setUploading(false);
      onMediaSent();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send media");
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (uploading) return;
    setAsset(null);
    setError(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.overlay, { paddingBottom: insets.bottom + (Platform.OS === "android" ? 28 : 0) }]}>
        <View style={[styles.content, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.header}>
            <Text style={[localizedTextStyle(), [styles.title, { color: colors.foreground }]]}>
              {asset ? t("Send Media") : t("Share Media")}
            </Text>
            <TouchableOpacity onPress={handleClose} disabled={uploading}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          
          {error && (
            <Text style={styles.error}>{t(error)}</Text>
          )}

          {asset ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: asset.uri }} style={styles.previewImage} contentFit="cover" />
              {asset.type === "video" && (
                <View style={styles.videoIndicator}>
                  <Ionicons name="videocam" size={24} color="#FFF" />
                </View>
              )}
              
              <View style={styles.pricingSection}>
                <View style={[styles.pricingToggle, { backgroundColor: "rgba(0,0,0,0.05)" }]}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, !isPaid && [styles.toggleBtnActive, { backgroundColor: colors.card, borderColor: colors.border }]]}
                    onPress={() => setIsPaid(false)}
                    disabled={uploading}
                  >
                    <Text style={[localizedTextStyle(), [styles.toggleText, !isPaid && { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]]}>{t("Free")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, isPaid && [styles.toggleBtnActive, { backgroundColor: colors.card, borderColor: colors.border }]]}
                    onPress={() => setIsPaid(true)}
                    disabled={uploading}
                  >
                    <Text style={[localizedTextStyle(), [styles.toggleText, isPaid && { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]]}>{t("Paid")}</Text>
                  </TouchableOpacity>
                </View>

                {isPaid && (
                  <View style={styles.priceInputContainer}>
                    <Ionicons name="cash-outline" size={20} color={colors.primary} />
                    <TextInput
                      style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                      placeholder={t("Amount of coins")}
                      placeholderTextColor={colors.mutedForeground}
                      value={price}
                      onChangeText={setPrice}
                      keyboardType="number-pad"
                      testID="price-input"
                      editable={!uploading}
                    />
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: uploading ? colors.muted : colors.primary }]}
                onPress={handleSend}
                disabled={uploading}
                testID="confirm-send"
              >
                {uploading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={[localizedTextStyle(), styles.sendButtonText]}>{t("Send")}</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.optionsList}>
              <TouchableOpacity
                style={[styles.option, { borderBottomColor: colors.border }]}
                onPress={handlePickMedia}
                testID="send-media"
              >
                <View style={[styles.optionIcon, { backgroundColor: "rgba(255,25,102,0.1)" }]}>
                  <Ionicons name="image" size={22} color={colors.primary} />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={[localizedTextStyle(), [styles.optionTitle, { color: colors.foreground }]]}>{t("Send photo or video")}</Text>
                  <Text style={[localizedTextStyle(), [styles.optionSubtitle, { color: colors.mutedForeground }]]}>{t("Upload directly from your device")}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.option, { borderBottomColor: colors.border }]}
                onPress={() => {
                  onClose();
                  onOpenPackPicker();
                }}
                testID="send-pack"
              >
                <View style={[styles.optionIcon, { backgroundColor: "rgba(255,25,102,0.1)" }]}>
                  <Ionicons name="images" size={22} color={colors.primary} />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={[localizedTextStyle(), [styles.optionTitle, { color: colors.foreground }]]}>{t("Send a media pack")}</Text>
                  <Text style={[localizedTextStyle(), [styles.optionSubtitle, { color: colors.mutedForeground }]]}>{t("Choose from your existing packs")}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.option}
                onPress={() => {
                  onClose();
                  router.push({ pathname: "/media-packs", params: { create: "1", recipientId: peerId } });
                }}
                testID="create-pack"
              >
                <View style={[styles.optionIcon, { backgroundColor: "rgba(255,25,102,0.1)" }]}>
                  <Ionicons name="add-circle" size={22} color={colors.primary} />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={[localizedTextStyle(), [styles.optionTitle, { color: colors.foreground }]]}>{t("Create new pack")}</Text>
                  <Text style={[localizedTextStyle(), [styles.optionSubtitle, { color: colors.mutedForeground }]]}>{t("Upload a collection to sell")}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  content: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderTopWidth: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  error: {
    color: "#FF4444",
    marginBottom: 16,
    fontFamily: "Inter_400Regular",
  },
  optionsList: {
    gap: 8,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  optionSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  previewContainer: {
    gap: 16,
  },
  previewImage: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  videoIndicator: {
    position: "absolute",
    top: 90,
    left: "50%",
    marginLeft: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  pricingSection: {
    gap: 12,
  },
  pricingToggle: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  toggleBtnActive: {
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "#666",
  },
  priceInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  sendButton: {
    paddingVertical: 16,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  sendButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  }
});