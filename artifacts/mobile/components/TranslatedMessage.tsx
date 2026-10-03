import { t, useAppLanguage } from "@/i18n";
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
import { dmBubbleLayout } from "@/utils/dmBubbleLayout";
import { useWindowDimensions } from "react-native";

function DmMessageText({ text, trailing, translationControl, style, longPress, accessibilityHint }: {
  text: string; trailing: React.ReactNode; translationControl: React.ReactNode;
  style?: StyleProp<TextStyle>; longPress?: () => void; accessibilityHint?: string;
}) {
  const { width } = useWindowDimensions();
  // Match the DM row's 16-point side padding, 72% bubble cap and 14-point inner padding.
  const maxWidth = Math.max(1, (width - 32) * 0.72 - 28);
  const [body, setBody] = useState<{ text: string; maxWidth: number; width: number; multiline: boolean } | null>(null);
  const [metadata, setMetadata] = useState<{ maxWidth: number; width: number } | null>(null);
  const measured = body?.text === text && body.maxWidth === maxWidth && metadata?.maxWidth === maxWidth;
  const layout = measured ? dmBubbleLayout(maxWidth, body.width, metadata.width, body.multiline) : { inline: false, width: maxWidth };
  const metadataContent = <>{trailing}{translationControl}</>;
  return <TouchableOpacity activeOpacity={1} onLongPress={longPress} accessibilityHint={accessibilityHint}
    style={{ width: layout.width, maxWidth: "100%", flexShrink: 1, flexDirection: layout.inline ? "row" : "column", alignItems: layout.inline ? "baseline" : "stretch" }}>
    <Text style={[style, { flexShrink: 0, maxWidth: "100%" }]}>{text}</Text>
    <View style={{ flexDirection: "row", alignItems: "center", alignSelf: layout.inline ? undefined : "flex-end", marginLeft: layout.inline ? 4 : 0, maxWidth: "100%" }}>
      {metadataContent}
    </View>
    {/* Measure at a stable cap so shrinking the visible bubble cannot start a layout loop. */}
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", width: maxWidth, opacity: 0 }}>
      <Text style={[style, { width: maxWidth }]} onTextLayout={({ nativeEvent }) => {
        const textWidth = Math.min(maxWidth, Math.ceil(Math.max(0, ...nativeEvent.lines.map(line => line.width))) + 1);
        const multiline = nativeEvent.lines.length > 1;
        setBody(previous => previous?.text === text && previous.maxWidth === maxWidth && previous.width === textWidth && previous.multiline === multiline
          ? previous : { text, maxWidth, width: textWidth, multiline });
      }}>{text}</Text>
      <View style={{ flexDirection: "row", alignSelf: "flex-start", maxWidth }} onLayout={({ nativeEvent }) => {
        const measuredWidth = Math.ceil(nativeEvent.layout.width);
        setMetadata(previous => previous?.maxWidth === maxWidth && previous.width === measuredWidth ? previous : { maxWidth, width: measuredWidth });
      }}>{metadataContent}</View>
    </View>
  </TouchableOpacity>;
}

export function TranslatedMessage({ text, messageId, kind, channelId, peerId, incoming, style, trailing, onLongPress }: {
  text: string; messageId: string; kind: "live" | "dm"; channelId?: string; peerId?: string; incoming: boolean; style?: StyleProp<TextStyle>; trailing?: React.ReactNode;
  onLongPress?: (translate?: () => void) => void;
}) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
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
    queryKey: ["message-translation", user?.uid, kind, channelId, messageId, language, text],
    queryFn: ({ signal }) => queueTranslation(signal, () => translateChatMessage({ kind, channelId, messageId, targetLanguage: language }, { signal })),
    enabled: focused && !!user && ready && preferences.consent && eligible && (automatic || requested),
    staleTime: Infinity, gcTime: 10 * 60_000, retry: false, refetchOnWindowFocus: false,
  });
  const translation = (automatic || requested) && query.data?.translated ? query.data : null;
  const shown = translation && !original ? translation.text : text;
  const press = async () => {
    if (translation) { setOriginalLanguage(value => value === language ? null : language); return; }
    if (query.data && !query.data.translated) { Alert.alert(t("Already in your language")); return; }
    if (!preferences.consent) {
      if (!await confirmTranslation(false)) return;
      try { await update({ consent: true }); }
      catch { Alert.alert(t("Couldn't translate"), t("Please try again.")); return; }
    }
    setRequested(true);
    if (query.isError) {
      const result = await query.refetch();
      if (result.isError) Alert.alert(t("Couldn't translate"), t("Please try again later."));
    }
  };
  const longPress = onLongPress ? () => onLongPress(eligible ? () => { void press(); } : undefined) : eligible ? () => { void press(); } : undefined;
  const accessibilityHint = onLongPress ? t("Message options") : eligible ? t("Long press to translate") : undefined;
  // Manual translation is available via long press; the icon only appears after translation.
  const translationControl = translation ? <TouchableOpacity onPress={() => void press()} hitSlop={8} accessibilityLabel={original ? t("Show translation") : t("Show original")} style={{ marginLeft: 5 }}>
      <Ionicons name="globe-outline" size={13} color={original ? "#999" : "#B9B4FF"} />
    </TouchableOpacity> : query.isFetching ? <ActivityIndicator size="small" color="#999" style={{ marginLeft: 4 }} /> : requested && query.isError ?
      <TouchableOpacity onPress={() => void press()} hitSlop={8} accessibilityLabel={t("Retry translation")}><Ionicons name="refresh-outline" size={14} color="#999" /></TouchableOpacity> : null;
  if (kind === "dm" && trailing) {
    return <DmMessageText text={shown} trailing={trailing} translationControl={translationControl}
      style={style} longPress={longPress} accessibilityHint={accessibilityHint} />;
  }
  return <View style={{ flexShrink: 1, flexDirection: "row", alignItems: "center" }}>
    <Text style={[style, { flexShrink: 1 }]} accessibilityHint={accessibilityHint} onLongPress={longPress}>
      {shown}{trailing ? <> {trailing}</> : null}
    </Text>
    {translationControl}
  </View>;
}
