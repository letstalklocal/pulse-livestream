import { t, useAppLanguage, localizedTextStyle } from "@/i18n";
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, Animated, Easing, AccessibilityInfo, Platform, Alert, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRequestMediaPackUpload, useSendMediaDm } from '@workspace/api-client-react';
import { uploadPrivateMedia, type MediaUploadSession } from '@/utils/resumableMediaUpload';
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
  const slide = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const opened = useRef(false);
  const sheetHeight = useRef(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  useLayoutEffect(() => {
    closing.current = false;
    opened.current = false;
    opacity.setValue(0);
    return () => {
      slide.stopAnimation();
      opacity.stopAnimation();
    };
  }, [visible, slide, opacity]);

  const handleSheetLayout = (height: number) => {
    sheetHeight.current = height;
    if (!visible || opened.current || closing.current || height <= 0) return;
    opened.current = true;
    // Measure first; never change the slide's distance halfway through opening.
    slide.setValue(height);
    Animated.parallel([
      Animated.timing(slide, {
        toValue: 0,
        duration: reduceMotion ? 0 : 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: reduceMotion ? 0 : 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const requestUpload = useRequestMediaPackUpload();
  const sendMediaDm = useSendMediaDm();
  
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uploadProgress, setUploadProgress] = useState(0);
  const [sending, setSending] = useState(false);
  const transfer = useRef<AbortController | null>(null);
  const pending = useRef<{ session?: MediaUploadSession; key: string; price: number } | null>(null);
  const sendingNow = useRef(false);
  useEffect(() => {
    setUploading(false);
    setSending(false);
    return () => { transfer.current?.abort(); pending.current = null; };
  }, [peerId, visible]);

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
      pending.current = null;
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
    if (!asset || sendingNow.current) return;
    sendingNow.current = true;
    const controller = new AbortController();
    transfer.current = controller;
    const attempt = pending.current ??= { key: `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`, price: coinPrice };
    setUploading(true);
    setSending(false);
    setError(null);
    const contentType = asset.mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg");
    try {
      if (!attempt.session) {
        setUploadProgress(0);
        attempt.session = await requestUpload.mutateAsync({ data: { contentType, resumable: true } });
      }
      await uploadPrivateMedia(asset.uri, contentType, attempt.session, controller.signal,
        value => { if (!controller.signal.aborted) setUploadProgress(value); });
      if (controller.signal.aborted) return;
      setSending(true);
      await sendMediaDm.mutateAsync({
        data: {
          recipientId: Number(peerId),
          objectPath: attempt.session.objectPath,
          mediaType: asset.type === "video" ? "video" : "image",
          contentType,
          width: asset.width,
          height: asset.height,
          durationMs: asset.duration ?? undefined,
          price: attempt.price,
          idempotencyKey: attempt.key
        } as any
      });
      
      if (controller.signal.aborted) return;
      pending.current = null;
      setAsset(null);
      setUploading(false);
      onMediaSent();
      onClose();
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Failed to send media");
    } finally {
      sendingNow.current = false;
      if (transfer.current === controller) {
        setUploading(false);
        setSending(false);
        transfer.current = null;
      }
    }
  };

  const handleClose = () => {
    if (uploading || closing.current) return;
    closing.current = true;
    Animated.parallel([
      Animated.timing(slide, {
        toValue: sheetHeight.current,
        duration: reduceMotion ? 0 : 150,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: reduceMotion ? 0 : 150,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      pending.current = null;
      setAsset(null);
      setError(null);
      onClose();
    });
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      {visible && <View style={styles.overlay}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.6)", opacity }]}
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel={t("Close")}
          testID="media-chooser-backdrop"
        />
        <Animated.View
          onLayout={(event) => handleSheetLayout(event.nativeEvent.layout.height)}
          style={{
            paddingBottom: insets.bottom + (Platform.OS === "android" ? 28 : 0),
            opacity,
            transform: [{ translateY: slide }],
          }}
        >
        <View style={[styles.content, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.header}>
            <Text style={[localizedTextStyle(), [styles.title, { color: colors.foreground }]]}>
              {asset ? t("Send Media") : t("Share Media")}
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              disabled={uploading}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t("Close")}
              testID="media-chooser-close"
            >
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
                    disabled={uploading || !!pending.current}
                  >
                    <Text style={[localizedTextStyle(), [styles.toggleText, !isPaid && { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]]}>{t("Free")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, isPaid && [styles.toggleBtnActive, { backgroundColor: colors.card, borderColor: colors.border }]]}
                    onPress={() => setIsPaid(true)}
                    disabled={uploading || !!pending.current}
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
                      editable={!uploading && !pending.current}
                    />
                  </View>
                )}
              </View>

              {uploading && <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
                <Text style={{ color: colors.foreground }}>{sending ? t("Sending…") : t("Uploading: {v0}%", { v0: uploadProgress })}</Text>
                <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden" }}>
                  <View style={{ height: 4, backgroundColor: colors.primary, width: `${uploadProgress}%` }} />
                </View>
                {!sending && <TouchableOpacity onPress={() => transfer.current?.abort()}>
                  <Text style={{ color: colors.foreground }}>{t("Cancel upload")}</Text>
                </TouchableOpacity>}
              </View>}
              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: uploading ? colors.muted : colors.primary }]}
                onPress={handleSend}
                disabled={uploading}
                testID="confirm-send"
              >
                {uploading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={[localizedTextStyle(), styles.sendButtonText]}>{pending.current ? t("Retry") : t("Send")}</Text>
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
        </Animated.View>
      </View>}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
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