import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useListStreams } from "@workspace/api-client-react";
import { StreamCard } from "@/components/StreamCard";
import { useColors } from "@/hooks/useColors";

const CATEGORIES = ["All", "Gaming", "Music", "Talk", "Art"];

export default function DiscoveryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState("All");

  const { data, isLoading, refetch, isRefetching } = useListStreams({
    query: { refetchInterval: 5000 },
  });

  const streams = data?.streams ?? [];
  const filtered =
    selectedCategory === "All"
      ? streams
      : streams.filter((s) => s.category === selectedCategory);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View>
          <Text style={[styles.appName, { color: colors.primary }]}>PULSE</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Live streams
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.goLiveBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/go-live" as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="radio" size={14} color="#FFF" />
          <Text style={styles.goLiveBtnText}>Go Live</Text>
        </TouchableOpacity>
      </View>

      {/* Category filter */}
      <FlatList
        data={CATEGORIES}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryList}
        keyExtractor={(item) => item}
        renderItem={({ item }) => {
          const active = item === selectedCategory;
          return (
            <TouchableOpacity
              style={[
                styles.categoryChip,
                {
                  backgroundColor: active ? colors.primary : colors.secondary,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setSelectedCategory(item)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  { color: active ? "#FFF" : colors.mutedForeground },
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Stream grid */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          numColumns={2}
          keyExtractor={(item) => item.channelId}
          contentContainerStyle={[
            styles.grid,
            { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 80 },
          ]}
          columnWrapperStyle={styles.row}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          scrollEnabled={filtered.length > 0}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="radio-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                No live streams
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Be the first to go live
              </Text>
              <TouchableOpacity
                style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push("/go-live" as any)}
                activeOpacity={0.8}
              >
                <Text style={styles.emptyBtnText}>Go Live Now</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => <StreamCard stream={item} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  appName: {
    fontSize: 24,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    letterSpacing: 3,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  goLiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
  },
  goLiveBtnText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  categoryList: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  grid: {
    paddingHorizontal: 16,
  },
  row: {
    justifyContent: "space-between",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  emptyBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  emptyBtnText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
});
