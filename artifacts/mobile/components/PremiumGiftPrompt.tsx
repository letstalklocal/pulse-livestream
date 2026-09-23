import { GiftImageArtwork, hasGiftImage } from "@/components/GiftImageArtwork";
import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppLanguage } from "@/i18n";
import { CrownArtwork } from "./CrownArtwork";
import type { PremiumGiftRequest } from "@/hooks/usePremiumGiftRequest";

export function PremiumGiftPrompt({
  request,
  remaining,
  paying,
  error,
  onSend,
}: {
  request: PremiumGiftRequest;
  remaining: number;
  paying: boolean;
  error: string | null;
  onSend: () => void;
}) {
  const { t } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const blink = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const urgent = remaining > 0 && remaining <= 10;
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduceMotion(value);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  useEffect(() => {
    blink.setValue(1);
    if (!urgent || reduceMotion) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, {
          toValue: 0.35,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(blink, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
      blink.setValue(1);
    };
  }, [urgent, reduceMotion, blink]);
  return (
    <KeyboardStickyView
      offset={{ opened: insets.bottom }}
      style={[styles.position, { bottom: insets.bottom + 84 }]}
    >
      <View style={styles.card}>
        <View style={styles.row}>
          {request.gift.id === "crown" ? (
            <CrownArtwork size={28} />
          ) : hasGiftImage(request.gift.id) ? (
            <GiftImageArtwork gift={request.gift.id} size={28} />
          ) : (
            <Text style={{ fontSize: 28 }}>{request.gift.emoji}</Text>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              {t("Send {v0} to keep watching", { v0: request.gift.name })}
            </Text>
            <Text style={styles.copy}>
              {t("{v0} coins · Viewers who don't send are removed", {
                v0: request.gift.coinCost,
              })}
            </Text>
          </View>
          <Animated.Text
            style={[
              styles.countdown,
              urgent && { color: "#FF879E" },
              { opacity: blink },
            ]}
          >
            {t("{v0}s", { v0: remaining })}
          </Animated.Text>
        </View>
        {error ? <Text style={styles.error}>{t(error)}</Text> : null}
        <TouchableOpacity
          onPress={onSend}
          disabled={paying || remaining <= 0}
          style={[styles.send, (paying || remaining <= 0) && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={t("Send Gift")}
        >
          {paying ? (
            <ActivityIndicator color="#17171D" />
          ) : (
            <Text style={styles.sendText}>{t("Send Gift")}</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardStickyView>
  );
}
const styles = StyleSheet.create({
  position: { position: "absolute", left: 16, right: 16 },
  card: {
    backgroundColor: "#17171D",
    borderColor: "#FFD700",
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { color: "#FFF", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  copy: { color: "#CCC", fontSize: 12, marginTop: 4 },
  countdown: {
    color: "#FFD700",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    minWidth: 42,
    textAlign: "right",
  },
  error: { color: "#FF879E", marginTop: 8, fontSize: 12 },
  send: {
    padding: 11,
    marginTop: 10,
    borderRadius: 20,
    alignItems: "center",
    backgroundColor: "#FFD700",
  },
  sendText: { color: "#17171D", fontSize: 14, fontFamily: "Inter_700Bold" },
});
