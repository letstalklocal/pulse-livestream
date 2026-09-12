import React, { useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useAppLanguage } from "@/i18n";
import { backgroundCropRect } from "@/utils/backgroundCrop";

import type { StreamBackgroundCropperProps as Props } from "./StreamBackgroundCropper.types";
export type { BackgroundCropSource } from "./StreamBackgroundCropper.types";

/** iOS-only UI: the system image picker's editor supports square crops only. */
export function StreamBackgroundCropper(props: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const frameWidth = Math.min(width - 32, Math.max(1, height - insets.top - insets.bottom - 160) * 9 / 16);
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={props.onCancel}>
      <CropEditor key={`${props.source.uri}:${frameWidth}`} {...props} frameWidth={frameWidth} />
    </Modal>
  );
}

function CropEditor({ source, onCancel, onConfirm, frameWidth }: Props & { frameWidth: number }) {
  const { t, localizedTextStyle } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const saving = useRef(false);
  const frameHeight = frameWidth * 16 / 9;
  const scale = Math.max(frameWidth / source.width, frameHeight / source.height);
  const imageWidth = source.width * scale;
  const imageHeight = source.height * scale;
  const initialOffset = useRef({ x: (imageWidth - frameWidth) / 2, y: (imageHeight - frameHeight) / 2 }).current;
  const position = useRef({ ...initialOffset, zoomScale: 1 });

  async function save() {
    if (saving.current || !loaded) return;
    saving.current = true;
    setBusy(true);
    try {
      const rect = backgroundCropRect(source, frameWidth, position.current);
      const context = ImageManipulator.manipulate(source.uri).crop(rect);
      if (rect.width > 1080) context.resize({ width: 1080, height: 1920 });
      const image = await context.renderAsync();
      const cropped = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      await onConfirm({ uri: cropped.uri, mimeType: "image/jpeg" });
    } catch {
      Alert.alert(t("Background not saved"), t("Choose another image and try again."));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.toolbar}>
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onCancel} style={styles.button}>
          <Text style={[styles.text, localizedTextStyle()]}>{t("Cancel")}</Text>
        </TouchableOpacity>
        <Text style={styles.text}>9:16</Text>
        <TouchableOpacity accessibilityRole="button" disabled={busy || !loaded} onPress={() => void save()} style={styles.button}>
          {busy ? <ActivityIndicator color="#FF1966" /> : <Text style={[styles.text, localizedTextStyle(), { color: loaded ? "#FF1966" : "#777" }]}>{t("Continue")}</Text>}
        </TouchableOpacity>
      </View>
      <View style={styles.preview}>
        <View style={{ width: frameWidth, height: frameHeight, overflow: "hidden" }}>
          <ScrollView
            style={StyleSheet.absoluteFill}
            contentContainerStyle={{ width: imageWidth, height: imageHeight }}
            contentOffset={initialOffset}
            minimumZoomScale={1}
            maximumZoomScale={4}
            bounces={false}
            bouncesZoom={false}
            scrollEnabled={!busy}
            pinchGestureEnabled={!busy}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
            scrollEventThrottle={16}
            onScroll={({ nativeEvent }) => {
              position.current = { ...nativeEvent.contentOffset, zoomScale: nativeEvent.zoomScale || 1 };
            }}
          >
            <Image source={{ uri: source.uri }} style={{ width: imageWidth, height: imageHeight }} resizeMode="stretch"
              onLoad={() => setLoaded(true)}
              onError={() => { setLoaded(false); Alert.alert(t("Background not saved"), t("Choose another image and try again.")); }}
            />
          </ScrollView>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.frame]} />
        </View>
      </View>
      <Text style={[styles.hint, localizedTextStyle()]}>{t("Drag to position. Pinch to zoom.")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#08080F" },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  button: { minHeight: 48, minWidth: 88, padding: 12, alignItems: "center", justifyContent: "center" },
  text: { color: "#FFF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  preview: { flex: 1, justifyContent: "center", alignItems: "center" },
  frame: { borderWidth: 1, borderColor: "rgba(255,255,255,0.8)" },
  hint: { color: "#AAA", fontSize: 14, textAlign: "center", paddingHorizontal: 16, paddingVertical: 12 },
});
