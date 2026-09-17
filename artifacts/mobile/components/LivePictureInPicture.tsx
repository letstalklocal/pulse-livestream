import { DemoVideo } from "@/components/DemoVideo";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, LayoutAnimation, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { FullWindowOverlay } from "react-native-screens";
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useLivePlayback } from "@/context/LivePlaybackContext";
import { useStreamKeepAwake } from "@/hooks/useStreamKeepAwake";
import { useAppLanguage } from "@/i18n";
import { RtcSurfaceViewComponent, RtcTextureViewComponent, VideoSourceType } from "@/utils/agora";

function FloatingKeepAwake() { useStreamKeepAwake(); return null; }

function FloatingPlayer() {
  const { t, appNumber } = useAppLanguage();
  const playback = useLivePlayback();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const keyboardHeight = useKeyboardState(state => state.height);
  const [large, setLarge] = useState(false);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });
  const touchStart = useRef({ x: 0, y: 0, drag: { x: 0, y: 0 } });
  const restore = () => {
    if (!playback.session) return;
    router.navigate({ pathname: "/stream/[channelId]", params: {
      channelId: playback.session.channelId,
      ...(playback.session.privateInvitationId ? { privateInvitationId: playback.session.privateInvitationId } : {}),
    } });
  };
  // New admission requirements use the existing full viewer UI.
  // Timed gifts stay visible below and do not undo the viewer's Back action.
  const needsAttention = !playback.canEnterStream;
  useEffect(() => { if (needsAttention) restore(); }, [needsAttention]);
  const bottom = keyboardHeight > 0 ? keyboardHeight + 12 : insets.bottom + 76;
  // Keep the player at a portrait 9:16 ratio at both sizes.
  const availableWidth = window.width - insets.left - insets.right - 24;
  const availableHeight = window.height - bottom - insets.top - 12;
  const width = Math.min(large ? 192 : 112, availableWidth, availableHeight * 9 / 16);
  const height = width * 16 / 9;
  const baseLeft = window.width - insets.right - 12 - width;
  const baseTop = window.height - bottom - height;
  const clampX = (value: number) => Math.max(-(baseLeft - insets.left - 12), Math.min(0, value));
  const clampY = (value: number) => Math.max(-(baseTop - insets.top - 12), Math.min(0, value));
  const geometry = (isLarge: boolean) => {
    const nextWidth = Math.min(isLarge ? 192 : 112, availableWidth, availableHeight * 9 / 16);
    const nextHeight = nextWidth * 16 / 9;
    return { width: nextWidth, height: nextHeight, baseLeft: window.width - insets.right - 12 - nextWidth, baseTop: window.height - bottom - nextHeight };
  };
  const resize = (nextLarge: boolean) => {
    const next = geometry(nextLarge);
    const currentLeft = baseLeft + drag.x;
    const onLeft = currentLeft + width / 2 < window.width / 2;
    const currentRight = currentLeft + width;
    const currentBottom = baseTop + height + drag.y;
    const targetLeft = onLeft ? currentLeft : currentRight - next.width;
    const targetTop = currentBottom - next.height;
    LayoutAnimation.configureNext({ duration: 550, update: { type: LayoutAnimation.Types.easeInEaseOut } });
    setDrag({ x: targetLeft - next.baseLeft, y: targetTop - next.baseTop });
    setLarge(nextLarge);
  };
  const toggleLarge = () => resize(!large);

  const beginTouchDrag = (event: any) => {
    touchStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, drag };
  };
  const moveTouchDrag = (event: any) => {
    const { pageX, pageY } = event.nativeEvent;
    setDrag({ x: clampX(touchStart.current.drag.x + pageX - touchStart.current.x), y: clampY(touchStart.current.drag.y + pageY - touchStart.current.y) });
  };
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
    onPanResponderGrant: () => { dragStart.current = drag; },
    onPanResponderMove: (_, gesture) => setDrag({ x: clampX(dragStart.current.x + gesture.dx), y: clampY(dragStart.current.y + gesture.dy) }),
    onPanResponderRelease: () => { setDrag(current => ({ x: clampX(current.x), y: clampY(current.y) })); },
  });
  const Video = Platform.OS === "android" ? RtcTextureViewComponent : RtcSurfaceViewComponent;
  const isDemo = playback.channelId.endsWith("-demo");
  const peer = playback.partyMedia.peer;
  const content = (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {playback.canEnterStream ? <FloatingKeepAwake /> : null}
      <View {...panResponder.panHandlers} onTouchStart={beginTouchDrag} onTouchMove={moveTouchDrag} style={[styles.player, { width, height, right: insets.right + 12, bottom, transform: [{ translateX: drag.x }, { translateY: drag.y }] }]}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {playback.backgroundImageUrl ? <Image source={{ uri: playback.backgroundImageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          {isDemo ? <DemoVideo category={playback.demoCategory} compact /> : null}
          {playback.joined && playback.remoteUid !== null && Video ? <Video
            canvas={{ uid: playback.remoteUid, sourceType: VideoSourceType.VideoSourceRemote }}
            style={StyleSheet.absoluteFill}
          /> : null}
          {peer && playback.partyMedia.connection && Video ? <Video
            canvas={{ uid: peer.uid, sourceType: VideoSourceType.VideoSourceRemote }}
            connection={playback.partyMedia.connection}
            style={styles.partner}
          /> : null}
          {!isDemo && !playback.remoteVideoReady ? <View style={styles.loading}><ActivityIndicator color="#FFF" /></View> : null}
        </View>
        <Pressable style={StyleSheet.absoluteFill} onPress={toggleLarge}
          accessibilityRole="button" accessibilityLabel={t("Picture in picture")}
          accessibilityHint={t("Tap to change size and show controls.")} />
        {playback.premiumGift.request?.required ? <Pressable style={styles.giftPrompt}
          accessibilityRole="button" accessibilityLabel={t("Return to live")} onPress={restore}>
          <Text style={styles.giftText}>{t("Send Gift")} · {appNumber(playback.premiumGift.remaining)}</Text>
        </Pressable> : null}
        {large ? <View pointerEvents="box-none" style={styles.topControls}>
          <Pressable style={styles.control} accessibilityRole="button" accessibilityLabel={t("Picture in picture settings")}
            onPress={() => { resize(false); if (pathname !== "/general") router.push("/general"); }}>
            <Ionicons name="settings-outline" size={21} color="#FFF" />
          </Pressable>
          <Pressable style={styles.control} accessibilityRole="button" accessibilityLabel={t("Picture in picture")}
            onPress={() => resize(false)}><Ionicons name="contract-outline" size={24} color="#FFF" /></Pressable>
          <Pressable style={styles.control} accessibilityRole="button" accessibilityLabel={t("Close picture in picture")}
            onPress={playback.close}><Ionicons name="close" size={25} color="#FFF" /></Pressable>
        </View> : null}
      </View>
    </View>
  );
  return Platform.OS === "ios" ? <FullWindowOverlay>{content}</FullWindowOverlay> : content;
}

export function LivePictureInPicture() {
  const playback = useLivePlayback();
  if (!playback.minimized || !playback.session || playback.ended || playback.accessRestricted) return null;
  return <FloatingPlayer key={playback.channelId} />;
}
const styles = StyleSheet.create({
  player: { position: "absolute", borderRadius: 12, overflow: "hidden", backgroundColor: "#15151C", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", elevation: 20, zIndex: 100 },
  control: { width: 44, height: 44, alignItems: "center", justifyContent: "center", zIndex: 21, elevation: 21 },
  topControls: { position: "absolute", top: 4, left: 4, right: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 20, elevation: 20 },
  loading: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" },
  giftPrompt: { position: "absolute", left: 0, right: 0, bottom: 0, minHeight: 44, backgroundColor: "#8A1742", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  giftText: { color: "#FFF", fontSize: 11, fontWeight: "600", textAlign: "center" },
  partner: { position: "absolute", right: 4, bottom: 4, width: "36%", height: "36%" },
});
