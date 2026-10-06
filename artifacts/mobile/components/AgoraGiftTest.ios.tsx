import React, { useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Text, TouchableOpacity, TurboModuleRegistry, View } from "react-native";
import { Asset } from "expo-asset";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppLanguage } from "@/i18n";
import { createAgoraGiftProbe } from "@/utils/agoraGiftProbe";
import type { AgoraGiftTestProps } from "./AgoraGiftTest";

function getAgora() {
  try {
    if (!TurboModuleRegistry.get("AgoraRtcNg")) return null;
    return require("react-native-agora") as typeof import("react-native-agora");
  } catch { return null; }
}
export function AgoraGiftTest({ getEngine, onDone }: AgoraGiftTestProps) {
  const { t } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const done = useRef(onDone); done.current = onDone;
  const factory = useRef(getEngine);
  const probe = useRef<ReturnType<typeof createAgoraGiftProbe> | null>(null);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agora = getAgora();
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!agora) throw new Error("Agora · iOS build");
      const lease = factory.current();
      if (!lease) throw new Error("Agora · live session unavailable");
      const owned = createAgoraGiftProbe(lease, {
        opened: () => { if (active) setOpened(true); },
        ended: () => { if (active) done.current(); },
        error: code => { if (active) { probe.current?.dispose(); setError(`Agora · ${code}`); } },
      });
      probe.current = owned; setPlayerId(owned.id);
      const asset = Asset.fromModule(require("../assets/gifts/webm/PumpkinBrute_march_9x16.webm"));
      await asset.downloadAsync();
      if (!active) return;
      if (!lease.isCurrent()) { done.current(); return; }
      owned.open((asset.localUri ?? asset.uri).replace(/^file:\/\//, ""));
    })().catch(reason => {
      probe.current?.dispose();
      if (active) setError(reason instanceof Error ? reason.message : "Agora");
    });
    const background = AppState.addEventListener("change", state => { if (state !== "active") { probe.current?.dispose(); done.current(); } });
    return () => { active = false; background.remove(); probe.current?.dispose(); probe.current = null; };
  }, []);
  useEffect(() => {
    if (opened && playerId !== null && !error) {
      try { probe.current?.play(); } catch (reason) {
        probe.current?.dispose(); setError(reason instanceof Error ? reason.message : "Agora · playback");
      }
    }
  }, [opened, playerId, error]);
  const Canvas = agora?.RtcSurfaceView;
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Canvas && playerId !== null && !error ? <Canvas testID="agora-gift-test-player" style={[StyleSheet.absoluteFill, { backgroundColor: "transparent" }]}
        canvas={{ uid: 0, mediaPlayerId: playerId, sourceType: agora.VideoSourceType.VideoSourceMediaPlayer,
          renderMode: agora.RenderModeType.RenderModeFit, enableAlphaMask: true }} /> : null}
      {error ? <Text style={styles.error}>{t("Playback unavailable")}{`\n${error}`}</Text> : null}
    </View>
    <TouchableOpacity testID="agora-gift-test-close" onPress={() => { probe.current?.dispose(); onDone(); }} accessibilityRole="button" accessibilityLabel={t("Close")}
      style={[styles.close, { top: insets.top + 8 }]}><Text style={styles.label}>{t("Close")}</Text></TouchableOpacity>
  </View>;
}
const styles = StyleSheet.create({
  close: { position: "absolute", right: 16, minHeight: 44, paddingHorizontal: 16, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 22 },
  label: { color: "#FFF", fontWeight: "600" },
  error: { position: "absolute", top: "45%", alignSelf: "center", color: "#FFF", backgroundColor: "rgba(0,0,0,0.6)", padding: 12 },
});
