import { queueTranslation } from "@/utils/translationQueue";
import { useFocusEffect } from "expo-router";
import { confirmTranslation } from "@/utils/confirmTranslation";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View, type StyleProp, type TextStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { translateChatMessage } from "@workspace/api-client-react";
import { useTranslationPreferences } from "@/hooks/useTranslationPreferences";
import { useAuth } from "@/context/AuthContext";

export function TranslatedMessage({ text, messageId, kind, channelId, peerId, incoming, style }: {
  text: string; messageId: string; kind: "live" | "dm"; channelId?: string; peerId?: string; incoming: boolean; style?: StyleProp<TextStyle>;
}) {
  const { user } = useAuth();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const { language, preferences, ready, update } = useTranslationPreferences();
  const [requested, setRequested] = useState(false);
  const [originalLanguage, setOriginalLanguage] = useState<string | null>(null);
  const original = originalLanguage === language;
  const automatic = kind === "live" ? preferences.live : !!peerId && preferences.conversations[peerId] === true;
  const eligible = incoming && !!text.trim() && !text.startsWith("🎁") && !!messageId;
  const query = useQuery({
    queryKey: ["message-translation", user?.uid, kind, channelId, messageId, language],
    queryFn: ({ signal }) => queueTranslation(signal, () => translateChatMessage({ kind, channelId, messageId, targetLanguage: language }, { signal })),
    enabled: focused && !!user && ready && preferences.consent && eligible && (automatic || requested),
    staleTime: Infinity, gcTime: 10 * 60_000, retry: false, refetchOnWindowFocus: false,
  });
  const translation = (automatic || requested) && query.data?.translated ? query.data : null;
  const shown = translation && !original ? translation.text : text;
  const press = async () => {
    if (translation) { setOriginalLanguage(value => value === language ? null : language); return; }
    if (query.data && !query.data.translated) { Alert.alert("Already in your language"); return; }
    if (!preferences.consent) {
      if (!await confirmTranslation(false)) return;
      try { await update({ consent: true }); }
      catch { Alert.alert("Couldn't translate", "Please try again."); return; }
    }
    setRequested(true);
    if (query.isError) {
      const result = await query.refetch();
      if (result.isError) Alert.alert("Couldn't translate", "Please try again later.");
    }
  };
  // Manual translation is available via long press; the icon only appears after translation.
  return <View style={{ flexShrink: 1, flexDirection: "row", alignItems: "center" }}>
    <Text style={[style, { flexShrink: 1 }]} accessibilityHint={eligible ? "Long press to translate" : undefined} onLongPress={eligible ? () => { void press(); } : undefined}>
      {shown}
    </Text>
    {translation ? <TouchableOpacity onPress={() => void press()} hitSlop={8} accessibilityLabel={original ? "Show translation" : "Show original"} style={{ marginLeft: 5 }}>
      <Ionicons name="language-outline" size={13} color={original ? "#999" : "#B9B4FF"} />
    </TouchableOpacity> : query.isFetching ? <ActivityIndicator size="small" color="#999" style={{ marginLeft: 4 }} /> : requested && query.isError ?
      <TouchableOpacity onPress={() => void press()} hitSlop={8} accessibilityLabel="Retry translation"><Ionicons name="refresh-outline" size={14} color="#999" /></TouchableOpacity> : null}
  </View>;
}
