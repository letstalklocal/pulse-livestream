import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
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
import { useQueryClient } from "@tanstack/react-query";
import { getGetCoinBalanceQueryKey, useGetCoinBalance, useSpendCoins } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useRtm, type DmMessage } from "@/context/RtmContext";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "@/components/Avatar";
import { GiftPicker, type Gift } from "@/components/GiftPicker";

export default function DmScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { getMessages, sendDm, markRead } = useRtm();
  const queryClient = useQueryClient();

  const { peerId, peerName } = useLocalSearchParams<{ peerId: string; peerName: string }>();
  const peerIdStr = peerId ?? "";
  const name = peerName ?? "User";

  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const listRef = useRef<FlatList>(null);

  const coinBalanceQuery = useGetCoinBalance(
    { uid: user?.uid ?? 0 },
    { query: { enabled: !!user?.uid, refetchOnWindowFocus: false } as any },
  );
  const spendMutation = useSpendCoins();
  const viewerCoins = coinBalanceQuery.data?.balance ?? 0;

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

  const [sendError, setSendError] = useState<string | null>(null);

  const send = async () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText("");
    setSendError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await sendDm(peerIdStr, name, text);
    if (!result.ok && result.error) {
      setSendError(result.error);
    }
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
          const isGift = item.text.startsWith("🎁");
          return (
            <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
              {!isMe && (
                <Avatar uid={parseInt(item.senderId)} name={item.senderName} size={28} />
              )}
              <View
                style={[
                  styles.bubble,
                  isMe
                    ? [styles.bubbleMe, { backgroundColor: isGift ? "rgba(255,215,0,0.18)" : "#FF1966" }]
                    : [styles.bubbleThem, { backgroundColor: isGift ? "rgba(255,215,0,0.12)" : colors.card }],
                  isGift && styles.giftBubble,
                ]}
              >
                <Text style={[styles.bubbleText, { color: isGift ? "#FFD700" : isMe ? "#FFF" : colors.foreground }]}>
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

      {/* Send error */}
      {sendError && (
        <View style={[styles.errorBanner, { backgroundColor: "rgba(255,25,102,0.12)" }]}>
          <Text style={styles.errorText}>{sendError}</Text>
        </View>
      )}

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
          style={styles.giftBtn}
          onPress={() => {
            setShowGiftPicker(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          activeOpacity={0.75}
          testID="send-gift-button"
          accessibilityRole="button"
          accessibilityLabel={`Send a gift to ${name}`}
          aria-label={`Send a gift to ${name}`}
        >
          <Ionicons name="gift-outline" size={22} color="#FFD700" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: inputText.trim() ? "#FF1966" : "rgba(255,25,102,0.2)" }]}
          onPress={send}
          activeOpacity={0.75}
          disabled={!inputText.trim()}
        >
          <Ionicons name="send" size={18} color={inputText.trim() ? "#FFF" : "rgba(255,255,255,0.4)"} />
        </TouchableOpacity>
      </View>

      <GiftPicker
        visible={showGiftPicker}
        coins={viewerCoins}
        hintText="Tap a gift to send it in chat"
        onClose={() => setShowGiftPicker(false)}
        onSend={(gift: Gift) => {
          const recipientId = Number.parseInt(peerIdStr, 10);
          if (!user?.uid || !Number.isInteger(recipientId)) {
            Alert.alert("Unable to send gift", "This conversation is unavailable.");
            return;
          }

          setShowGiftPicker(false);
          setSendError(null);
          void (async () => {
            try {
              const result = await spendMutation.mutateAsync({
                data: {
                  uid: user.uid,
                  recipientUid: recipientId,
                  amount: gift.coins,
                  giftName: gift.name,
                  senderName: user.name ?? "Viewer",
                  description: `${gift.emoji} ${gift.name}`,
                },
              });

              queryClient.setQueryData(
                getGetCoinBalanceQueryKey({ uid: user.uid }),
                { balance: result.balance },
              );

              const dmResult = await sendDm(
                peerIdStr,
                name,
                `🎁 ${gift.emoji} ${gift.name} gift • ${gift.coins} coins`,
              );
              if (!dmResult.ok) {
                setSendError(`Gift sent, but the chat receipt could not be delivered. ${dmResult.error ?? ""}`.trim());
              } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
            } catch {
              Alert.alert("Gift couldn't be sent", "You may not have enough coins. Try a smaller gift or top up from your profile.");
            }
          })();
        }}
      />
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
  giftBubble: {
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.45)",
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
  giftBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,215,0,0.1)",
  },
  errorBanner: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  errorText: {
    color: "#FF1966",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
});
