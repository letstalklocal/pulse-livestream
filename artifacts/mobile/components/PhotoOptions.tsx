import { t, useAppLanguage } from "@/i18n";
import React, { useState } from "react";
import { Alert, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { ReportPhotoSheet } from "./ReportPhotoSheet";

export function PhotoOptions({ postId, ownerUid, color }: { postId: number; ownerUid: number; color: string }) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  if (user?.uid === ownerUid) return null;
  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Photo options")} hitSlop={10}
      onPress={() => Alert.alert(t("Photo options"), undefined, [
        { text: t("Report photo"), onPress: () => {
          if (!user) { router.push("/(auth)/sign-in"); return; }
          setReporting(true);
        } },
        { text: t("Cancel"), style: "cancel" },
      ])}>
      <Ionicons name="ellipsis-horizontal" size={22} color={color} />
    </TouchableOpacity>
    {reporting ? <ReportPhotoSheet postId={postId} onClose={() => setReporting(false)} /> : null}
  </>;
}
