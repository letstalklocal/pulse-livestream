import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useRtm, type DmMessage } from "@/context/RtmContext";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "@/components/Avatar";

export default function DmScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { getMessages, sendDm, markRead } = useRtm();

  const { peerId, peerName } = useLocalSearchParams<{ peerId: string; peerName: string }>();
  const peerIdStr = peerId ?? "";
  const name = peerName ?? "User";

  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const listRef = useRef<FlatList>(null);

  // Sync messages from RtmContext store
  useEffect(() => {
    const interval = setInterval(() => {
      setMessages(getMessages(peerIdStr));
    }, 500);
    setMessages(getMessages(peerIdStr));
    return () => clearInterval(interval);
  }, [peerIdStr, getMessages]);

  useEffect(() => {
    markRead(peerIdStr);
  }, [peerIdStr, markRead]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  const send = async () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await sendDm(peerIdStr, name, text);
  };

  const myUidStr = user?.uid != null ? String(user.uid) : null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Avatar uid={parseInt(peerIdStr)} name={name} size={34} />
        <Text style={[styles.headerName, { color: colors.foreground }]} numberOfLines={1}>
          {name}
        </Text>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.messageId}
        contentContainerStyle={[styles.listContent, { paddingBottom: 8 }]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isMe = item.senderId === myUidStr;
          return (
            <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
              {!isMe && (
                <Avatar uid={parseInt(item.senderId)} name={item.senderName} size={28} />
              )}
              <View
                style={[
                  styles.bubble,
                  isMe
                    ? [styles.bubbleMe, { backgroundColor: "#FF1966" }]
                    : [styles.bubbleThem, { backgroundColor: colors.card }],
                ]}
              >
                <Text style={[styles.bubbleText, { color: isMe ? "#FFF" : colors.foreground }]}>
                  {item.text}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Avatar uid={parseInt(peerIdStr)} name={name} size={64} />
            <Text style={[styles.emptyName, { color: colors.foreground }]}>{name}</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Say hi to start the conversation!
            </Text>
          </View>
        }
      />

      {/* Input bar */}
      <View style={[styles.inputBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          value={inputText}
          onChangeText={setInputText}
          placeholder={`Message ${name}…`}
          placeholderTextColor={colors.mutedForeground}
          onSubmitEditing={send}
          returnKeyType="send"
          blurOnSubmit={false}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: inputText.trim() ? "#FF1966" : "rgba(255,25,102,0.2)" }]}
          onPress={send}
          activeOpacity={0.75}
          disabled={!inputText.trim()}
        >
          <Ionicons name="send" size={18} color={inputText.trim() ? "#FFF" : "rgba(255,255,255,0.4)"} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  headerName: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    flexGrow: 1,
  },
  bubbleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 8,
    gap: 8,
  },
  bubbleRowMe: {
    flexDirection: "row-reverse",
  },
  bubble: {
    maxWidth: "72%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  bubbleMe: {
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    paddingTop: 60,
    gap: 10,
  },
  emptyName: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    marginTop: 4,
  },
  emptySub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
});
