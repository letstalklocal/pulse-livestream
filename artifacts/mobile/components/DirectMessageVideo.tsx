import React, { useEffect } from "react";
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useAppLanguage } from "@/i18n";

/** Mounted only while an authorized DM video's full-screen viewer is open. */
export function DirectMessageVideo({ uri }: { uri: string }) {
  const { t } = useAppLanguage();
  const player = useVideoPlayer(
    { uri, contentType: "progressive" },
    (player) => {
      player.play();
    },
  );
  const { status } = useEvent(player, "statusChange", {
    status: player.status,
  });
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") player.pause();
    });
    return () => subscription.remove();
  }, [player]);
  return (
    <View style={styles.container}>
      <VideoView
        testID="dm-video-player"
        player={player}
        style={styles.video}
        nativeControls
        contentFit="contain"
      />
      {status === "loading" ? (
        <View pointerEvents="none" style={styles.overlay}>
          <ActivityIndicator color="#FFF" />
        </View>
      ) : null}
      {status === "error" ? (
        <View pointerEvents="none" style={styles.overlay}>
          <Text style={styles.error}>{t("Playback unavailable")}</Text>
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, width: "100%" },
  video: { width: "100%", height: "100%" },
  overlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { color: "#FFF", textAlign: "center", padding: 20 },
});
