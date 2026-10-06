import React, { useEffect, useRef, useState } from "react";
import { AppState, Platform, StyleSheet, Text, TouchableOpacity, TurboModuleRegistry, View } from "react-native";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import type { WebViewProps } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppLanguage } from "@/i18n";
import { webmGiftHtml } from "@/utils/webmGiftHtml";

function getWebView(): React.ComponentType<WebViewProps> | null {
  try {
    if (!TurboModuleRegistry.get("RNCWebViewModule")) return null;
    return require("react-native-webview").WebView;
  } catch { return null; }
}

// Retain only this test's prepared HTML, not a growing collection of video bytes.
let preparedHtml: Promise<string> | null = null;
function loadTestHtml(): Promise<string> {
  if (!preparedHtml) {
    preparedHtml = (async () => {
      const asset = Asset.fromModule(require("../assets/gifts/webm/PumpkinBrute_march_9x16.webm"));
      await asset.downloadAsync();
      return webmGiftHtml(await new File(asset.localUri ?? asset.uri).base64());
    })().catch(error => { preparedHtml = null; throw error; });
  }
  return preparedHtml;
}
export async function preloadWebmGiftTest(): Promise<void> {
  if (getWebView()) await loadTestHtml();
}

/** Native WebView alpha-video probe: local, one-shot and never a paid gift. */
export function WebmGiftTest({ onDone }: { onDone: () => void }) {
  const { t } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const done = useRef(onDone);
  done.current = onDone;
  const WebView = getWebView();
  const [html, setHtml] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    if (!WebView) return;
    let active = true;
    void loadTestHtml().then(html => { if (active) setHtml(html); })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [WebView]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => { if (state !== "active") done.current(); });
    return () => subscription.remove();
  }, []);
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {WebView && html && status !== "error" ? <WebView testID="webm-test-player" source={{ html }}
        style={[StyleSheet.absoluteFill, { backgroundColor: "transparent" }]} containerStyle={{ backgroundColor: "transparent" }}
        scrollEnabled={false} mediaPlaybackRequiresUserAction={false} allowsFullscreenVideo={false}
        {...(Platform.OS === "ios" ? { allowsInlineMediaPlayback: true, automaticallyAdjustContentInsets: false,
          onContentProcessDidTerminate: () => setStatus("error") } : {})}
        originWhitelist={["about:blank"]} allowFileAccess={false} allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false} mixedContentMode="never" androidLayerType="hardware"
        onShouldStartLoadWithRequest={request => request.url === "about:blank"}
        onMessage={event => {
          if (event.nativeEvent.data === "ended") done.current();
          else if (event.nativeEvent.data === "ready") setStatus("ready");
          else if (event.nativeEvent.data === "error") setStatus("error");
        }} onError={() => setStatus("error")} onRenderProcessGone={() => setStatus("error")} /> : null}
      {!WebView || status === "error" ? <Text style={styles.status}>{t("Playback unavailable")}{!WebView ? `\nRNCWebView · ${Platform.OS === "ios" ? "iOS" : "Android"} build` : ""}</Text> : null}
    </View>
    <TouchableOpacity testID="webm-test-close" onPress={onDone} accessibilityRole="button" accessibilityLabel={t("Close")}
      style={[styles.close, { top: insets.top + 8 }]}><Text style={styles.label}>{t("Close")}</Text></TouchableOpacity>
  </View>;
}
const styles = StyleSheet.create({
  close: { position: "absolute", right: 16, minHeight: 44, paddingHorizontal: 16, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 22 },
  label: { color: "#FFF", fontWeight: "600" },
  status: { position: "absolute", top: "45%", alignSelf: "center", color: "#FFF", backgroundColor: "rgba(0,0,0,0.6)", padding: 12 },
});
