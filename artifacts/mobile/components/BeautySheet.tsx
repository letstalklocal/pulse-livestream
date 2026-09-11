import { t, useAppLanguage, localizedTextStyle } from "@/i18n";
import { useBeautySlider } from "@/hooks/useBeautySlider";
import React, { useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, Switch, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type BeautySettings = { enabled: boolean; smoothness: number };
export const DEFAULT_BEAUTY: BeautySettings = { enabled: false, smoothness: 0.3 };

export function BeautySheet({ settings, onChange, error, onClose }: {
  settings: BeautySettings;
  onChange: (value: BeautySettings) => void;
  error: string | null;
  onClose: () => void;
}) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const trackWidth = useRef(1);
  const updateSmoothness = useBeautySlider(settings.smoothness, smoothness => onChange({ ...settings, smoothness }));
  const adjust = (x: number) => { if (settings.enabled && trackWidth.current > 0) updateSmoothness(x / trackWidth.current); };
  return <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: "flex-end" }}>
      <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={t("Close beauty effects")} />
      <View style={{ backgroundColor: "#17171D", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: insets.bottom + 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[localizedTextStyle(), { color: "#FFF", fontSize: 22, fontWeight: "700" }]}>{t("Beauty")}</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel={t("Close")} hitSlop={12}><Ionicons name="close" size={24} color="#FFF" /></TouchableOpacity>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 20 }}>
          <Text style={[localizedTextStyle(), { color: "#FFF", fontSize: 16 }]}>{t("Beauty effects")}</Text>
          <Switch value={settings.enabled} onValueChange={enabled => onChange({ ...settings, enabled })} trackColor={{ false: "#444", true: "#FF1966" }} accessibilityLabel={t("Beauty effects")} />
        </View>
        <View style={{ opacity: settings.enabled ? 1 : 0.4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[localizedTextStyle(), { color: "#FFF", fontSize: 15 }]}>{t("Smoothness")}</Text>
            <Text style={{ color: "#BBB" }}>{Math.round(settings.smoothness * 100)}%</Text>
          </View>
          <View
            style={{ height: 48, justifyContent: "center" }}
            onLayout={event => { trackWidth.current = event.nativeEvent.layout.width; }}
            onStartShouldSetResponder={() => settings.enabled}
            onMoveShouldSetResponder={() => settings.enabled}
            onResponderGrant={event => adjust(event.nativeEvent.locationX)}
            onResponderMove={event => adjust(event.nativeEvent.locationX)}
            accessible accessibilityRole="adjustable" accessibilityLabel={t("Smoothness")}
            accessibilityState={{ disabled: !settings.enabled }}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(settings.smoothness * 100) }}
            accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
            onAccessibilityAction={event => { if (settings.enabled) updateSmoothness(settings.smoothness + (event.nativeEvent.actionName === "increment" ? 0.1 : -0.1)); }}
          >
            <View pointerEvents="none" style={{ height: 4, borderRadius: 2, backgroundColor: "#444" }}>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: "#FF1966", width: `${settings.smoothness * 100}%` }} />
              <View style={{ position: "absolute", left: `${settings.smoothness * 100}%`, marginLeft: -10, top: -8, width: 20, height: 20, borderRadius: 10, backgroundColor: "#FFF" }} />
            </View>
          </View>
        </View>
        <Text style={[localizedTextStyle(), { color: error ? "#FF819A" : "#999", fontSize: 13 }]}>{error ?? t("Adjust your look in the preview. Your viewers will see the same effect.")}</Text>
      </View>
    </View>
  </Modal>;
}
