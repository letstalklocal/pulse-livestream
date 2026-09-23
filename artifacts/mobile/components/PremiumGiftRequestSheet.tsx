import { GiftImageArtwork, hasGiftImage } from "@/components/GiftImageArtwork";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useAppLanguage } from "@/i18n";
import { GIFTS } from "./GiftPicker";
import { CrownArtwork } from "./CrownArtwork";
import {
  premiumGiftRequestApi,
  premiumGiftRequestKey,
  type PremiumGiftRequest,
} from "@/hooks/usePremiumGiftRequest";

export function PremiumGiftRequestSheet({
  channelId,
  request,
  remaining,
  onClose,
}: {
  channelId: string;
  request: PremiumGiftRequest | null;
  remaining: number;
  onClose: () => void;
}) {
  const { t } = useAppLanguage();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const insets = useSafeAreaInsets();
  const [giftId, setGiftId] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<30 | 60>(30);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(Crypto.randomUUID());
  const running = !!request && remaining > 0;
  const close = () => {
    if (!inFlight.current) onClose();
  };
  const submit = async () => {
    if (!giftId || inFlight.current || running) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await premiumGiftRequestApi(channelId, getToken, "POST", {
        giftId,
        durationSeconds,
        idempotencyKey: key.current,
      });
      void client.invalidateQueries({
        queryKey: premiumGiftRequestKey(channelId),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request a gift");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityLabel={t("Close")}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{t("Request a gift")}</Text>
            <TouchableOpacity
              onPress={close}
              disabled={busy}
              accessibilityLabel={t("Close")}
            >
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          {running ? (
            <Text style={styles.copy}>
              {t("{v0} · {v1}s remaining · {v2}/{v3} sent", {
                v0: request.gift.name,
                v1: remaining,
                v2: request.paidViewers ?? 0,
                v3: request.viewers ?? 0,
              })}
            </Text>
          ) : (
            <>
              <Text style={styles.copy}>
                {t(
                  "Current viewers must send this gift before time runs out to keep watching, including viewers with free entry.",
                )}
              </Text>
              <ScrollView contentContainerStyle={styles.grid}>
                {GIFTS.map((gift) => (
                  <TouchableOpacity
                    key={gift.id}
                    disabled={busy}
                    onPress={() => {
                      setGiftId(gift.id);
                      key.current = Crypto.randomUUID();
                    }}
                    style={[styles.gift, giftId === gift.id && styles.selected]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: giftId === gift.id }}
                  >
                    {gift.id === "crown" ? (
                      <CrownArtwork size={30} />
                    ) : hasGiftImage(gift.id) ? (
                      <GiftImageArtwork gift={gift.id} size={30} />
                    ) : (
                      <Text style={{ fontSize: 30 }}>{gift.emoji}</Text>
                    )}
                    <Text style={styles.label}>{gift.name}</Text>
                    <Text style={styles.cost}>
                      {t("{v0} coins", { v0: gift.coins })}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.copy}>{t("Time to send")}</Text>
              <View style={styles.durations}>
                {([30, 60] as const).map((seconds) => (
                  <TouchableOpacity
                    key={seconds}
                    disabled={busy}
                    onPress={() => {
                      setDurationSeconds(seconds);
                      key.current = Crypto.randomUUID();
                    }}
                    style={[
                      styles.duration,
                      durationSeconds === seconds && styles.selected,
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{
                      selected: durationSeconds === seconds,
                    }}
                  >
                    <Text style={styles.label}>
                      {t("{v0} seconds", { v0: seconds })}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {error ? <Text style={styles.error}>{t(error)}</Text> : null}
              <TouchableOpacity
                onPress={() => void submit()}
                disabled={!giftId || busy}
                style={[styles.submit, (!giftId || busy) && { opacity: 0.5 }]}
                accessibilityRole="button"
              >
                {busy ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.label}>{t("Request gift")}</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    maxHeight: "85%",
    padding: 18,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#17171D",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: { color: "#FFF", fontSize: 22, fontFamily: "Inter_700Bold" },
  copy: { color: "#CCC", fontSize: 14, marginBottom: 12, lineHeight: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingBottom: 12 },
  gift: {
    width: "31%",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#444",
  },
  selected: { borderColor: "#FFD700", backgroundColor: "rgba(255,215,0,0.12)" },
  label: { color: "#FFF", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cost: { color: "#FFD700", fontSize: 12, marginTop: 4 },
  durations: { flexDirection: "row", gap: 12 },
  duration: {
    flex: 1,
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#444",
  },
  error: { color: "#FF879E", marginTop: 12 },
  submit: {
    backgroundColor: "#FF1966",
    padding: 16,
    borderRadius: 24,
    alignItems: "center",
    marginTop: 16,
  },
});
