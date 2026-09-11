import React from "react";
import { Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function MyVaultScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 10, paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderColor: colors.border }}>
      <TouchableOpacity accessibilityLabel="Back" onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={colors.foreground} /></TouchableOpacity>
      <Text style={{ fontSize: 21, fontFamily: "Inter_700Bold", color: colors.foreground }}>My Vault</Text><View style={{ width: 24 }} />
    </View>
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
      <TouchableOpacity testID="media-packs-entry" accessibilityRole="button" onPress={() => router.push("/media-packs")} style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card }}>
        <Ionicons name="images-outline" size={22} color={colors.primary} />
        <Text style={{ flex: 1, fontSize: 16, fontFamily: "Inter_500Medium", color: colors.foreground }}>Media Packs</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
      </TouchableOpacity>
    </ScrollView>
  </View>;
}
