import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { createVideoPlayer, type VideoThumbnail } from "expo-video";

/** Extract one authorized preview frame, then release the temporary decoder. */
export function DirectVideoThumbnail({ uri, style }: { uri: string; style?: StyleProp<ViewStyle> }) {
  const [result, setResult] = useState<{ uri: string; image: VideoThumbnail } | null>(null);
  useEffect(() => {
    if (Platform.OS === "web") return;
    let cancelled = false;
    let started = false;
    let released = false;
    let thumbnail: VideoThumbnail | undefined;
    let player: ReturnType<typeof createVideoPlayer> | undefined;
    let listener: { remove: () => void } | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const releasePlayer = () => {
      if (released) return;
      released = true;
      clearTimeout(timeout);
      listener?.remove();
      player?.release();
    };
    const generate = async () => {
      if (started || cancelled || !player) return;
      started = true;
      try {
        const [image] = await player.generateThumbnailsAsync(0, { maxWidth: 440, maxHeight: 440 });
        if (cancelled) image?.release();
        else if (image) { thumbnail = image; setResult({ uri, image }); }
      } catch {
        // Keep the existing play tile available if thumbnail extraction fails.
      } finally { releasePlayer(); }
    };
    try {
      player = createVideoPlayer(null);
      player.muted = true;
      listener = player.addListener("statusChange", ({ status }) => {
        if (status === "readyToPlay") void generate();
        else if (status === "error") releasePlayer();
      });
      timeout = setTimeout(() => { cancelled = true; releasePlayer(); }, 20_000);
      void player.replaceAsync({ uri, contentType: "progressive" }).then(() => {
        if (!released && player?.status === "readyToPlay") void generate();
      }).catch(releasePlayer);
    } catch { releasePlayer(); }
    return () => { cancelled = true; releasePlayer(); thumbnail?.release(); };
  }, [uri]);
  return <View style={style}>
    {result?.uri === uri ? <Image source={result.image} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
  </View>;
}
