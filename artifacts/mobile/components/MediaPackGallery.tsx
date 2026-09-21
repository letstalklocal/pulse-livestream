import React from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppLanguage } from "@/i18n";
export type PackMediaItem = {
  id: string;
  mediaType: string;
  mediaUrl?: string;
};
function PackVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return (
    <VideoView
      player={player}
      style={styles.media}
      nativeControls
      contentFit="contain"
    />
  );
}
export function MediaPackGallery({
  items,
  onClose,
  embedded = false,
}: {
  items: PackMediaItem[];
  embedded?: boolean;
  onClose: () => void;
}) {
  const window = useWindowDimensions();
  const [layout, setLayout] = React.useState<{
    width: number;
    height: number;
  } | null>(null);
  const { width, height } = layout ?? window;
  const insets = useSafeAreaInsets();
  const { t } = useAppLanguage();
  const [active, setActive] = React.useState(0);
  const activeIndex = Math.min(active, Math.max(0, items.length - 1));
  const content = (
    <View
      style={styles.gallery}
      onLayout={({ nativeEvent }) => {
        const { width: nextWidth, height: nextHeight } = nativeEvent.layout;
        if (nextWidth > 0 && nextHeight > 0)
          setLayout((previous) =>
            previous?.width === nextWidth && previous?.height === nextHeight
              ? previous
              : { width: nextWidth, height: nextHeight },
          );
      }}
    >
      <FlatList
        key={`${width}:${height}`}
        style={styles.list}
        showsHorizontalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        initialScrollIndex={items.length ? activeIndex : undefined}
        extraData={activeIndex}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        horizontal
        pagingEnabled
        data={items}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={(event) =>
          setActive(
            Math.max(
              0,
              Math.min(
                items.length - 1,
                Math.round(event.nativeEvent.contentOffset.x / width),
              ),
            ),
          )
        }
        renderItem={({ item, index }) => (
          <View
            style={{
              width,
              height,
              flexShrink: 0,
              overflow: "hidden",
              justifyContent: "center",
            }}
          >
            <View style={styles.frame}>
              {item.mediaUrl &&
                (item.mediaType === "image" ? (
                  <Image
                    source={{ uri: item.mediaUrl }}
                    style={styles.media}
                    contentFit="contain"
                  />
                ) : index === activeIndex ? (
                  <PackVideo uri={item.mediaUrl} />
                ) : (
                  <Ionicons name="videocam" size={42} color="white" />
                ))}
            </View>
          </View>
        )}
      />
      <TouchableOpacity
        testID="media-gallery-close"
        style={[styles.close, { top: insets.top + 8 }]}
        onPress={onClose}
        accessibilityLabel={t("Close")}
      >
        <Ionicons name="close" size={28} color="white" />
      </TouchableOpacity>
    </View>
  );
  return embedded ? (
    content
  ) : (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}
const styles = StyleSheet.create({
  gallery: { flex: 1, backgroundColor: "#000" },
  list: { flex: 1 },
  frame: {
    flex: 1,
    width: "100%",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  media: { width: "100%", height: "100%" },
  close: { position: "absolute", right: 16, padding: 12 },
});
