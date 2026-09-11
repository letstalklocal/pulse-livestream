import { t, useAppLanguage, localizedTextStyle } from "@/i18n";
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal, SafeAreaView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useQueryClient } from "@tanstack/react-query";
import { useUnlockMediaDm, getGetCoinBalanceQueryKey } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import type { DmMessage } from "@/context/RtmContext";

export function DirectMediaMessage({ message, mine }: { message: DmMessage; mine: boolean }) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const colors = useColors();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const unlockMutation = useUnlockMediaDm();

  const [localUnlocked, setLocalUnlocked] = useState(message.unlocked ?? false);
  const [localMediaUrl, setLocalMediaUrl] = useState(message.mediaUrl);
  const [fullScreen, setFullScreen] = useState(false);

  const price = message.price ?? 0;
  const isFree = price === 0;
  const canView = mine || isFree || localUnlocked;

  const handleUnlock = () => {
    Alert.alert(
      t("Unlock Media?"),
      t("Pay {v0} coins to unlock this {v1}?", { v0: price, v1: message.mediaType || "media" }),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Unlock"),
          style: "default",
          onPress: async () => {
            try {
              const res = (await unlockMutation.mutateAsync({
                messageId: Number(message.messageId),
                data: {
                  idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
                } as any
              })) as any;
              setLocalUnlocked(true);
              if (res.mediaUrl) {
                setLocalMediaUrl(res.mediaUrl);
              }
              if (user?.uid) {
                queryClient.setQueryData(
                  getGetCoinBalanceQueryKey({ uid: user.uid }),
                  { balance: res.balance }
                );
              }
            } catch (err) {
              Alert.alert(t("Unlock failed"), t("You may not have enough coins."));
            }
          }
        }
      ]
    );
  };

  const handlePress = () => {
    if (canView) {
      if (localMediaUrl) {
        setFullScreen(true);
      }
    } else {
      handleUnlock();
    }
  };

  return (
    <View style={[styles.wrapper, mine ? styles.wrapperMe : styles.wrapperThem, { borderColor: colors.border }]}>
      {mine ? <View pointerEvents="none" style={{ position: "absolute", right: 8, bottom: 8, zIndex: 1, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 8, paddingHorizontal: 4 }}><Ionicons name="checkmark-done" size={16} color={message.readAt != null ? "#FFF" : "rgba(255,255,255,0.45)"} accessibilityLabel={message.readAt != null ? t("Read") : t("Sent")} /></View> : null}
      <TouchableOpacity activeOpacity={0.8} onPress={handlePress} accessibilityLabel={canView ? t("View media") : t("Unlock media for {v0} coins", { v0: price })} testID={`media-msg-${message.messageId}`}>
        {canView ? (
          <>
            {localMediaUrl ? (
              <Image source={{ uri: localMediaUrl }} style={styles.image} contentFit="cover" />
            ) : (
              <View style={[styles.image, styles.loading]}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
            {message.mediaType === "video" && (
              <View style={styles.videoOverlay}>
                <Ionicons name="play-circle" size={40} color="#FFF" />
              </View>
            )}
            {mine && price > 0 && (
              <View style={styles.priceTag}>
                <Ionicons name="logo-bitcoin" size={13} color="#FFF" />
                <Text style={styles.priceTagText}>{price}</Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.image}>
            {message.previewUrl && (
              <Image source={{ uri: message.previewUrl }} style={[styles.image, { position: "absolute" }]} contentFit="cover" blurRadius={28} />
            )}
            <View style={styles.lockedOverlay}>
              <Ionicons name="lock-closed" size={32} color="#FFF" />
              <View style={[styles.unlockButton, { backgroundColor: colors.primary }]}>
                <Ionicons name="logo-bitcoin" size={15} color="#FFF" />
                <Text style={[localizedTextStyle(), styles.unlockButtonText]}>{t("Unlock for {v0}", { v0: price })}</Text>
              </View>
            </View>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={fullScreen} transparent animationType="fade" onRequestClose={() => setFullScreen(false)}>
        <SafeAreaView style={styles.fullScreenContainer}>
          <TouchableOpacity style={styles.closeButton} onPress={() => setFullScreen(false)} accessibilityLabel={t("Close full screen")}>
            <Ionicons name="close" size={30} color="#FFF" />
          </TouchableOpacity>
          {localMediaUrl && (
            <Image source={{ uri: localMediaUrl }} style={styles.fullScreenImage} contentFit="contain" />
          )}
          {message.mediaType === "video" && (
            <View style={styles.videoOverlay} pointerEvents="none">
              <Ionicons name="play-circle" size={80} color="rgba(255,255,255,0.7)" />
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    maxWidth: "72%",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  wrapperMe: {
    borderBottomRightRadius: 4,
  },
  wrapperThem: {
    borderBottomLeftRadius: 4,
  },
  image: {
    width: 220,
    height: 220,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  loading: {
    alignItems: "center",
    justifyContent: "center",
  },
  videoOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  lockedOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  unlockButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  unlockButtonText: {
    color: "#FFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  priceTag: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  priceTagText: {
    color: "#FFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  closeButton: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  fullScreenImage: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
});
