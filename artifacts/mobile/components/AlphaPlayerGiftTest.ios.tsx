import React, { useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Text, TouchableOpacity, View, type ViewProps } from "react-native";
import { requireNativeView, requireOptionalNativeModule } from "expo";
import { Asset } from "expo-asset";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppLanguage } from "@/i18n";

type PlayerProps = ViewProps & {
  source: string;
  onFinish: () => void;
  onError: (event: { nativeEvent: { message: string } }) => void;
};
function getPlayer(): React.ComponentType<PlayerProps> | null {
  try {
    if (!requireOptionalNativeModule("PulseAlphaPlayer")) return null;
    return requireNativeView<PlayerProps>("PulseAlphaPlayer");
  } catch { return null; }
}
const Player = getPlayer();

export function AlphaPlayerGiftTest({ onDone }: { onDone: () => void }) {
  const { t } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const done = useRef(onDone); done.current = onDone;
  const active = useRef(true);
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(Player ? null : "AlphaPlayer · iOS build");
  const finish = () => { if (active.current) { active.current = false; setSource(null); done.current(); } };
  useEffect(() => {
    active.current = true;
    if (Player) void (async () => {
      const asset = Asset.fromModule(require("../assets/gifts/ios/pumpkin.compact-crf26.mp4"));
      await asset.downloadAsync();
      if (!active.current) return;
      if (!asset.localUri?.startsWith("file://")) throw new Error("AlphaPlayer · local MP4 unavailable");
      setSource(asset.localUri);
    })().catch(reason => {
      if (active.current) setError(reason instanceof Error ? reason.message : "AlphaPlayer");
    });
    const background = AppState.addEventListener("change", state => { if (state !== "active") finish(); });
    return () => { active.current = false; background.remove(); };
  }, []);
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Player && source && !error ? <Player testID="alpha-gift-test-player" source={source} style={StyleSheet.absoluteFill}
        onFinish={finish} onError={event => { if (active.current) { setSource(null); setError(`AlphaPlayer · ${event.nativeEvent.message}`); } }} /> : null}
      {error ? <Text style={styles.error}>{t("Playback unavailable")}{`\n${error}`}</Text> : null}
    </View>
    <TouchableOpacity testID="alpha-gift-test-close" onPress={finish} accessibilityRole="button" accessibilityLabel={t("Close")}
      style={[styles.close, { top: insets.top + 8 }]}><Text style={styles.label}>{t("Close")}</Text></TouchableOpacity>
  </View>;
}
const styles = StyleSheet.create({
  close: { position: "absolute", right: 16, minHeight: 44, paddingHorizontal: 16, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 22 },
  label: { color: "#FFF", fontWeight: "600" },
  error: { position: "absolute", top: "45%", alignSelf: "center", color: "#FFF", backgroundColor: "rgba(0,0,0,0.6)", padding: 12 },
});
