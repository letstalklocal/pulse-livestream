import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useRtm } from "@/context/RtmContext";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "@/components/Avatar";

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { conversations } = useRtm();

  const openDm = (peerId: number, peerName: string) => {
    router.push({ pathname: "/dm/[peerId]", params: { peerId: String(peerId), peerName } });
  };

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Messages</Text>
        <View style={styles.guestWrap}>
          <Ionicons name="chatbubbles-outline" size={52} color={colors.mutedForeground} />
          <Text style={[styles.guestTitle, { color: colors.foreground }]}>Sign in to message</Text>
          <Text style={[styles.guestSub, { color: colors.mutedForeground }]}>
            Connect with the streamers you follow
          </Text>
          <TouchableOpacity
            style={[styles.signInBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/(auth)/sign-in")}
            activeOpacity={0.8}
          >
            <Text style={styles.signInBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Messages</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => Alert.alert("Search", "Message search will be available soon.")}
            activeOpacity={0.7}
            accessibilityLabel="Search messages"
          >
            <Ionicons name="search-outline" size={23} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => router.push("/new-chat")}
            activeOpacity={0.7}
            accessibilityLabel="Start a new chat"
          >
            <Ionicons name="create-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {conversations.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={52} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No messages yet</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            Tap the pencil icon to start a conversation
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.peerId}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.convoRow, { borderBottomColor: colors.border }]}
              onPress={() => openDm(parseInt(item.peerId), item.peerName)}
              activeOpacity={0.75}
            >
              <Avatar uid={parseInt(item.peerId)} name={item.peerName} size={46} />
              <View style={styles.convoInfo}>
                <View style={styles.convoTopRow}>
                  <Text style={[styles.convoName, { color: colors.foreground }]} numberOfLines={1}>
                    {item.peerName}
                  </Text>
                  <Text style={[styles.convoTime, { color: colors.mutedForeground }]}>
                    {formatTime(item.lastTs)}
                  </Text>
                </View>
                <View style={styles.convoBottomRow}>
                  <Text style={[styles.convoPreview, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {item.lastMessage}
                  </Text>
                  {item.unread > 0 && (
                    <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                      <Text style={styles.unreadText}>{item.unread > 9 ? "9+" : item.unread}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

    </View>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - ts) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  headerActionBtn: {
    width: 30,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 18, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  guestWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  guestTitle: { fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold" },
  guestSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  signInBtn: {
    marginTop: 8,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  signInBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15, fontFamily: "Inter_700Bold" },
  convoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  convoInfo: { flex: 1 },
  convoTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  convoName: { fontSize: 15, fontWeight: "600", fontFamily: "Inter_600SemiBold", flex: 1 },
  convoTime: { fontSize: 12, fontFamily: "Inter_400Regular", marginLeft: 8 },
  convoBottomRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  convoPreview: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    marginLeft: 8,
  },
  unreadText: { color: "#FFF", fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold" },
});
