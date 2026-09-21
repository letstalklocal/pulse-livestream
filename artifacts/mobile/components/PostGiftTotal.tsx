import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getPostActivity } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useAppLanguage } from "@/i18n";
import { GoldCoinIcon } from "./GoldCoinIcon";

export function PostGiftTotal({ postId }: { postId: number }) {
  const { user } = useAuth();
  const { t, appNumber } = useAppLanguage();
  const activity = useQuery({ queryKey: ["post-activity", postId, user?.uid], queryFn: () => getPostActivity(postId), staleTime: 10000, retry: 1 });
  const total = activity.data?.giftCoins;
  if (total === undefined) return null;
  return <View pointerEvents="none" accessible accessibilityLabel={`${t("Total coins")}: ${appNumber(total)}`} style={styles.badge}>
    <GoldCoinIcon size={16} />
    <Text style={styles.total}>{appNumber(total)}</Text>
  </View>;
}

const styles = StyleSheet.create({
  badge: { position: "absolute", top: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.6)" },
  total: { color: "#FFFFFF", fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
