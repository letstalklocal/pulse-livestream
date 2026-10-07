import React, { useEffect, useRef, useState } from "react";
import { AppState, Platform, StyleSheet, TurboModuleRegistry, View, type ViewProps } from "react-native";
import { File } from "expo-file-system";
import { requireNativeView, requireOptionalNativeModule } from "expo";
import type { WebViewProps } from "react-native-webview";
import { acquireGiftAsset } from "@/utils/giftAssetCache";
import type { GiftSnapshot } from "@/utils/giftCatalog";
import { webmGiftHtml } from "@/utils/webmGiftHtml";
import { prepareLocalCatalogGiftSound } from "@/utils/localCatalogGiftSound";

type AlphaProps = ViewProps & { source: string; muted: boolean; onFinish: () => void; onError: () => void };
type SvgaProps = { source: string; loops: number; muteBuiltInAudio: boolean; style: object; onFinish: () => void; onError: () => void };
function players() {
  let WebView: React.ComponentType<WebViewProps> | null = null;
  let Alpha: React.ComponentType<AlphaProps> | null = null;
  let Svga: React.ComponentType<SvgaProps> | null = null;
  try { if (Platform.OS === "android" && TurboModuleRegistry.get("RNCWebViewModule")) WebView = require("react-native-webview").WebView; } catch {}
  try {
    const module = Platform.OS === "ios" ? requireOptionalNativeModule("PulseAlphaPlayer") as { supportsMutedPlayback?: boolean } | null : null;
    if (module?.supportsMutedPlayback === true) Alpha = requireNativeView<AlphaProps>("PulseAlphaPlayer");
  } catch {}
  try { if (Platform.OS !== "web") Svga = require("@dasimems/react-native-svga").SvgaPlayer; } catch {}
  return { WebView, Alpha, Svga };
}
const nativePlayers = players();
/** One-shot, touch-through playback. Success is removed by the player's completion callback. */
export function RemoteGiftPlayer({ snapshot, width, height, muted = true, onFinish, onUnavailable }: {
  snapshot: GiftSnapshot; width: number; height: number; muted?: boolean; onFinish: () => void; onUnavailable: () => void;
}) {
  const callbacks = useRef({ onFinish, onUnavailable }); callbacks.current = { onFinish, onUnavailable };
  const [source, setSource] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const asset = snapshot.animation ?? (Platform.OS === "android" ? snapshot.androidAnimation : snapshot.iosAnimation);
  const format = asset?.format;
  const active = useRef(true);
  const finished = useRef(false);
  const sound = useRef<{ play: () => void; stop: () => void } | null>(null);
  const animationMuted = muted || !!snapshot.sound;
  const finish = () => { if (active.current && !finished.current) { finished.current = true; sound.current?.stop(); setSource(null); setHtml(null); callbacks.current.onFinish(); } };
  const fail = () => { if (active.current && !finished.current) { finished.current = true; sound.current?.stop(); setSource(null); setHtml(null); callbacks.current.onUnavailable(); } };
  useEffect(() => {
    active.current = true; finished.current = false;
    let release: (() => void) | undefined;
    const supported = format === "svga" ? nativePlayers.Svga : format === "webm-alpha" || format === "webm" ? nativePlayers.WebView : format === "packed-alpha-mp4" ? nativePlayers.Alpha : null;
    if (!asset || !supported) { fail(); return; }
    // Only startup is bounded. There is no timer truncating successful playback.
    const timeout = setTimeout(fail, 20_000);
    const preparedSound = (!muted && snapshot.sound ? prepareLocalCatalogGiftSound(snapshot.sound).catch(() => null) : Promise.resolve(null)).then(localSound => {
      if (!active.current || finished.current) { localSound?.stop(); return null; }
      sound.current = localSound;
      return localSound;
    });
    void acquireGiftAsset(asset).then(async lease => {
      if (!active.current || finished.current) { lease.release(); return; }
      release = lease.release;
      const localSound = await preparedSound;
      if (!active.current || finished.current) { localSound?.stop(); return; }
      if (nativePlayers.WebView && (format === "webm-alpha" || format === "webm")) {
        const data = await new File(lease.uri).base64();
        if (!active.current || finished.current) return;
        setHtml(webmGiftHtml(data, animationMuted));
      } else setSource(lease.uri);
      // SVGA/Alpha expose completion only; WebM aligns its audio to playing.
      if (format !== "webm-alpha" && format !== "webm") localSound?.play();
      clearTimeout(timeout);
    }).catch(fail);
    const background = AppState.addEventListener("change", state => { if (state !== "active") finish(); });
    return () => { active.current = false; clearTimeout(timeout); background.remove(); sound.current?.stop(); sound.current = null; release?.(); };
  }, [asset?.id, asset?.sha256, muted, snapshot.sound?.id]);
  const framing = snapshot.framing;
  const assetWidth = (asset?.width ?? width) / (format === "packed-alpha-mp4" ? 2 : 1);
  const assetHeight = asset?.height ?? height;
  const fit = framing.preset === "fullscreen" ? Math.max(width / assetWidth, height / assetHeight) : Math.min(width / assetWidth, height / assetHeight);
  const framedWidth = assetWidth * fit * framing.scale;
  const framedHeight = assetHeight * fit * framing.scale;
  const style = { width: framedWidth, height: framedHeight,
    left: (width - framedWidth) / 2 + width * framing.x,
    top: (height - framedHeight) / 2 + height * framing.y, position: "absolute" as const };
  const { WebView, Alpha, Svga } = nativePlayers;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {source && format === "svga" && Svga ? <Svga source={source} loops={1} muteBuiltInAudio={animationMuted} style={style} onFinish={finish} onError={fail} /> : null}
    {source && format === "packed-alpha-mp4" && Alpha ? <Alpha source={source} muted={animationMuted} style={style} onFinish={finish} onError={fail} /> : null}
    {html && WebView ? <WebView source={{ html }} style={[style, { backgroundColor: "transparent" }]} containerStyle={{ backgroundColor: "transparent" }}
      scrollEnabled={false} mediaPlaybackRequiresUserAction={false} allowsFullscreenVideo={false}
      originWhitelist={["about:blank"]} allowFileAccess={false} allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false} mixedContentMode="never" androidLayerType="hardware"
      onShouldStartLoadWithRequest={request => request.url === "about:blank"}
      onMessage={event => { if (event.nativeEvent.data === "ended") finish(); else if (event.nativeEvent.data === "error") fail(); else if (event.nativeEvent.data === "ready") sound.current?.play(); }}
      onError={fail} onRenderProcessGone={fail} /> : null}
  </View>;
}
