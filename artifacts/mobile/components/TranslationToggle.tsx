import { t, useAppLanguage, localizedTextStyle } from "@/i18n";
import { confirmTranslation } from "@/utils/confirmTranslation";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getTranslationStatus } from "@workspace/api-client-react";
import { useTranslationPreferences } from "@/hooks/useTranslationPreferences";

export function TranslationToggle({ peerId, color = "#FFF", menu = false }: { peerId?: string; color?: string; menu?: boolean }) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const { preferences, ready, update } = useTranslationPreferences();
  const enabled = peerId ? preferences.conversations[peerId] === true : preferences.live;
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      if (!enabled && !(await getTranslationStatus()).available) {
        Alert.alert(t("Translation unavailable"), t("Translation is not available yet. Please try again later."));
        return;
      }
      if (!enabled && !preferences.consent && !await confirmTranslation(true)) return;
      await update(peerId ? { consent: true, conversations: { [peerId]: !enabled } } : { consent: true, live: !enabled });
    } catch { Alert.alert(t("Couldn't update translation"), t("Please try again.")); }
    finally { setBusy(false); }
  };
  return <TouchableOpacity onPress={() => void toggle()} disabled={!ready || busy} hitSlop={menu ? undefined : 8}
    accessibilityRole="switch" accessibilityState={{ checked: enabled, disabled: !ready || busy }}
    accessibilityLabel={peerId ? t("Auto-translate this conversation") : t("Translate live chat")}
    style={menu ? { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 18, paddingHorizontal: 20 } : { padding: 6 }}>
    {busy ? <ActivityIndicator size="small" color={color} /> : <Ionicons name="globe-outline" size={21} color={enabled ? "#FF1966" : color} />}
    {menu ? <>
      <Text style={[localizedTextStyle(), { color, fontSize: 16, fontFamily: "Inter_500Medium", flex: 1 }]}>{t("Translate chat")}</Text>
      <Text style={[localizedTextStyle(), { color: enabled ? "#FF1966" : "#999", fontSize: 13 }]}>{enabled ? t("On") : t("Off")}</Text>
    </> : null}
  </TouchableOpacity>;
}
