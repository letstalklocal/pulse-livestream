import { confirmTranslation } from "@/utils/confirmTranslation";
import React, { useState } from "react";
import { ActivityIndicator, Alert, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getTranslationStatus } from "@workspace/api-client-react";
import { useTranslationPreferences } from "@/hooks/useTranslationPreferences";

export function TranslationToggle({ peerId, color = "#FFF" }: { peerId?: string; color?: string }) {
  const { preferences, ready, update } = useTranslationPreferences();
  const enabled = peerId ? preferences.conversations[peerId] === true : preferences.live;
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      if (!enabled && !(await getTranslationStatus()).available) {
        Alert.alert("Translation unavailable", "Translation is not available yet. Please try again later.");
        return;
      }
      if (!enabled && !preferences.consent && !await confirmTranslation(true)) return;
      await update(peerId ? { consent: true, conversations: { [peerId]: !enabled } } : { consent: true, live: !enabled });
    } catch { Alert.alert("Couldn't update translation", "Please try again."); }
    finally { setBusy(false); }
  };
  return <TouchableOpacity onPress={() => void toggle()} disabled={!ready || busy} hitSlop={8}
    accessibilityRole="switch" accessibilityState={{ checked: enabled, disabled: !ready || busy }}
    accessibilityLabel={peerId ? "Auto-translate this conversation" : "Translate live chat"}
    style={{ padding: 6 }}>
    {busy ? <ActivityIndicator size="small" color={color} /> : <Ionicons name="language-outline" size={21} color={enabled ? "#FF1966" : color} />}
  </TouchableOpacity>;
}
