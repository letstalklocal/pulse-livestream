import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useAppLanguage } from "@/i18n";

import type { ProfileBackgroundCropperProps as Props } from "./ProfileBackgroundCropper.types";
export type { ProfileBackgroundCropSource } from "./ProfileBackgroundCropper.types";

export function ProfileBackgroundCropper(props: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableHeight = Math.max(1, height - insets.top - insets.bottom - 180);
  const frameWidth = Math.min(width - 32, availableHeight * 16 / 9);

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
  const frameHeight = frameWidth * 9 / 16;
  const initialScale = Math.max(frameWidth / source.width, frameHeight / source.height);
  const imageWidth = source.width * initialScale;
  const imageHeight = source.height * initialScale;
  const initialOffset = useRef({
    x: (imageWidth - frameWidth) / 2,
    y: (imageHeight - frameHeight) / 2,
  }).current;
  const position = useRef({ ...initialOffset, zoomScale: 1 });

  async function save() {
    if (saving.current || !loaded) return;
    saving.current = true;
    setBusy(true);
    try {
      const scale = initialScale * Math.max(1, position.current.zoomScale);
      const unit = Math.floor(
        Math.min(frameWidth / scale / 16, source.width / 16, source.height / 9) + 1e-8,
      );
      if (unit < 1) throw new Error("Image is too small to crop");
      const cropWidth = unit * 16;
      const cropHeight = unit * 9;
      const originX = Math.max(
        0,
        Math.min(source.width - cropWidth, Math.round(position.current.x / scale)),
      );
      const originY = Math.max(
        0,
        Math.min(source.height - cropHeight, Math.round(position.current.y / scale)),
      );
      const image = await ImageManipulator.manipulate(source.uri)
        .crop({ originX, originY, width: cropWidth, height: cropHeight })
        .resize({ width: 1280, height: 720 })
        .renderAsync();
      const cropped = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.86 });
      await onConfirm({
        uri: cropped.uri,
        width: 1280,
        height: 720,
        mimeType: "image/jpeg",
      });
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
        <Text style={styles.text}>16:9</Text>
        <TouchableOpacity accessibilityRole="button" disabled={busy || !loaded} onPress={() => void save()} style={styles.button}>
          {busy
            ? <ActivityIndicator color="#FF1966" />
            : <Text style={[styles.text, localizedTextStyle(), { color: loaded ? "#FF1966" : "#777" }]}>{t("Continue")}</Text>}
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
            <Image
              source={{ uri: source.uri }}
              style={{ width: imageWidth, height: imageHeight }}
              resizeMode="stretch"
              onLoad={() => setLoaded(true)}
              onError={() => {
                setLoaded(false);
                Alert.alert(t("Background not saved"), t("Choose another image and try again."));
              }}
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