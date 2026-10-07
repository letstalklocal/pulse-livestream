import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Image, Platform, Text, type ImageStyle, type StyleProp } from "react-native";
import { acquireGiftAsset } from "@/utils/giftAssetCache";
import type { GiftSnapshot } from "@/utils/giftCatalog";
import { GiftImageArtwork, hasGiftImage } from "./GiftImageArtwork";
import { CrownArtwork } from "./CrownArtwork";

let drawerPlayer: React.ComponentType<any> | null | undefined;
function getDrawerPlayer() {
  if (Platform.OS === "web") return null;
  if (drawerPlayer !== undefined) return drawerPlayer;
  try { drawerPlayer = require("@dasimems/react-native-svga").SvgaPlayer; }
  catch { drawerPlayer = null; }
  return drawerPlayer;
}

/** Purchase snapshots take precedence over the mutable published catalog. */
export function RemoteGiftArtwork({ snapshot, size, style, enabled = true, animated = false }: { snapshot: GiftSnapshot; size: number; style?: StyleProp<ImageStyle>; enabled?: boolean; animated?: boolean }) {
  const [uri, setUri] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; uri: string } | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  const [reduceMotion, setReduceMotion] = useState(true);
  const previewRelease = useRef<(() => void) | undefined>(undefined);
  const animation = snapshot.animation ?? (Platform.OS === "android" ? snapshot.androidAnimation : snapshot.iosAnimation);
  const Player = animated && snapshot.type !== "image" && animation?.format === "svga" ? getDrawerPlayer() : null;
  useEffect(() => {
    if (!animated) return;
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    const app = AppState.addEventListener("change", state => setForeground(state === "active"));
    return () => { active = false; motion.remove(); app.remove(); };
  }, [animated]);
  useEffect(() => {
    let active = true;
    let release: (() => void) | undefined;
    setPreview(null);
    if (animated && enabled && foreground && !reduceMotion && Player && animation) void acquireGiftAsset(animation).then(lease => {
      if (!active) { lease.release(); return; }
      release = lease.release; previewRelease.current = release;
      setPreview({ id: animation.id, uri: lease.uri });
    }).catch(() => {});
    return () => { active = false; release?.(); if (previewRelease.current === release) previewRelease.current = undefined; };
  }, [animated, enabled, foreground, reduceMotion, Player, animation?.id, animation?.sha256, snapshot.type]);
  useEffect(() => {
    let active = true;
    let release: (() => void) | undefined;
    setUri(null);
    if (enabled && snapshot.thumbnail) void acquireGiftAsset(snapshot.thumbnail).then(lease => {
      if (!active) { lease.release(); return; }
      release = lease.release; setUri(lease.uri);
    }).catch(() => {});
    return () => { active = false; release?.(); };
  }, [snapshot.thumbnail?.id, snapshot.thumbnail?.sha256, enabled]);
  if (animated && enabled && foreground && !reduceMotion && Player && preview && preview.id === animation?.id)
    return <Player source={preview.uri} loops={0} muteBuiltInAudio style={[{ width: size, height: size }, style]} onError={() => { setPreview(null); previewRelease.current?.(); previewRelease.current = undefined; }} />;
  if (uri) return <Image source={{ uri }} resizeMode="contain" accessibilityLabel={snapshot.name} style={[{ width: size, height: size }, style]} />;
  // Attached artwork must not turn into an unrelated emoji/bundled image
  // while loading or unavailable. Original asset-free legacy gifts stay intact.
  if (snapshot.thumbnail || snapshot.animation || snapshot.androidAnimation || snapshot.iosAnimation) return null;
  if (snapshot.id === "crown") return <CrownArtwork size={size} style={style} />;
  if (hasGiftImage(snapshot.id)) return <GiftImageArtwork gift={snapshot.id} size={size} style={style} />;
  return <Text accessibilityLabel={snapshot.name} style={{ fontSize: size * 0.8, lineHeight: size, textAlign: "center" }}>{snapshot.emoji || "🎁"}</Text>;
}
