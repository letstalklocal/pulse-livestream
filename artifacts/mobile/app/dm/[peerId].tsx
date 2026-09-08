import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
// @ts-ignore generated media-pack hooks
import { getGetCoinBalanceQueryKey, useActOnPrivateStreamInvitation, useCreatePrivateStreamInvitation, useGetCoinBalance, useSpendCoins, useGetMediaPacks, useSendMediaPack } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useRtm, type DmMessage } from "@/context/RtmContext";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "@/components/Avatar";
import { GiftPicker, GIFTS, type Gift } from "@/components/GiftPicker";
import { MediaPackMessage } from "@/components/MediaPackMessage";
import { MediaChooser } from "@/components/MediaChooser";
import { DirectMediaMessage } from "@/components/DirectMediaMessage";

const createGiftRequestKey = () =>
  Crypto.randomUUID();

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
  const myUidStr = user?.uid != null ? String(user.uid) : null;

  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [showPackPicker, setShowPackPicker] = useState(false);
  const [showMediaChooser, setShowMediaChooser] = useState(false);
  const [showInviteComposer, setShowInviteComposer] = useState(false);
  const [inviteGiftId, setInviteGiftId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const hasInitialScrolledRef = useRef(false);
  const paymentBalanceStateRef = useRef("");

  const coinBalanceQuery = useGetCoinBalance(
    { uid: user?.uid ?? 0 },
    { query: { enabled: !!user?.uid, refetchOnWindowFocus: false } as any },
  );
  const spendMutation = useSpendCoins();
  const packsQuery = useGetMediaPacks({ query: { enabled: !!user?.uid, refetchOnWindowFocus: false } } as any);
  const sendPackMutation = useSendMediaPack();
  const createInviteMutation = useCreatePrivateStreamInvitation();
  const invitationAction = useActOnPrivateStreamInvitation();
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
    hasInitialScrolledRef.current = false;
    markRead(peerIdStr);
  }, [peerIdStr, markRead]);

  useEffect(() => {
    if (messages.length > 0) {
      markRead(peerIdStr);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length, markRead, peerIdStr]);

  useEffect(() => {
    const paymentState = messages
      .filter((message) => message.invitation?.invitedUserId === myUidStr &&
        (message.invitation.paymentStatus === "paid" || message.invitation.paymentStatus === "refunded"))
      .map((message) => `${message.invitation!.id}:${message.invitation!.paymentStatus}`)
      .join(",");
    if (paymentState && paymentState !== paymentBalanceStateRef.current) {
      paymentBalanceStateRef.current = paymentState;
      void queryClient.invalidateQueries({ queryKey: getGetCoinBalanceQueryKey({ uid: user?.uid ?? 0 }) });
    }
  }, [messages, myUidStr, queryClient, user?.uid]);

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

  const invitePeer = async () => {
    const recipientId = Number(peerIdStr);
    if (!Number.isInteger(recipientId)) return;
    try {
      await createInviteMutation.mutateAsync({ data: { invitedUserId: recipientId, title: `Private live with ${name}`, requiredGiftId: inviteGiftId ?? undefined } as any });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowInviteComposer(false);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Invitation couldn't be sent.");
    }
  };

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
        <TouchableOpacity onPress={() => setShowInviteComposer(true)} disabled={createInviteMutation.isPending} accessibilityLabel={`Invite ${name} to a private live stream`}>
          {createInviteMutation.isPending ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="videocam-outline" size={23} color={colors.primary} />}
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.messageId}
        contentContainerStyle={[styles.listContent, { paddingBottom: 8 }]}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          if (hasInitialScrolledRef.current || messages.length === 0) return;
          hasInitialScrolledRef.current = true;
          requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
        }}
        renderItem={({ item }) => {
          const isMe = item.senderId === myUidStr;
          const isGift = item.text.startsWith("🎁");
          return (
            <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
              {!isMe && (
                <Avatar uid={parseInt(item.senderId)} name={item.senderName} size={28} />
              )}
              {item.kind === "private_stream_invitation" && item.invitation ? (
                <View style={[styles.inviteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Image source={{ uri: item.invitation.backgroundImageUrl }} style={styles.inviteImage} />
                  <Ionicons name="lock-closed" size={16} color={colors.primary} />
                  <Text style={[styles.inviteTitle, { color: colors.foreground }]}>{item.invitation.title}</Text>
                   <Text style={[styles.inviteStatus, { color: colors.mutedForeground }]}>Private 1:1 live · {item.invitation.status}</Text>
                   {item.invitation.requiredGiftAmount > 0 ? <Text style={styles.invitePrice}>🎁 {item.invitation.requiredGiftName} · 🪙 {item.invitation.requiredGiftAmount}{item.invitation.paymentStatus === "paid" ? " · paid" : item.invitation.paymentStatus === "refunded" ? " · refunded" : ""}</Text> : <Text style={[styles.inviteStatus, { color: colors.mutedForeground }]}>Free invitation</Text>}
                  {item.invitation.status === "pending" && !isMe ? <View style={styles.inviteActions}>
                    <TouchableOpacity disabled={invitationAction.isPending} onPress={() => invitationAction.mutate({ id: Number(item.invitation!.id), action: "decline" })}><Text style={[styles.inviteSecondary, { color: colors.mutedForeground }]}>Decline</Text></TouchableOpacity>
                    <TouchableOpacity disabled={invitationAction.isPending} onPress={() => invitationAction.mutate({ id: Number(item.invitation!.id), action: "accept" }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCoinBalanceQueryKey({ uid: user?.uid ?? 0 }) }), onError: (error: any) => { const message = error?.message ?? "Unable to accept invitation."; setSendError(message.includes("Insufficient") ? "Insufficient coins to accept this invitation." : message); if (message.includes("Insufficient")) Alert.alert("Insufficient coins", `You need ${item.invitation!.requiredGiftAmount} coins to accept this private live.`); } })} style={styles.invitePrimary}><Text style={styles.invitePrimaryText}>{item.invitation.requiredGiftAmount > 0 ? `Pay ${item.invitation.requiredGiftAmount} coins & Accept` : "Accept"}</Text></TouchableOpacity>
                  </View> : null}
                  {item.invitation.status === "pending" && isMe ? <TouchableOpacity disabled={invitationAction.isPending} onPress={() => invitationAction.mutate({ id: Number(item.invitation!.id), action: "cancel" })}><Text style={[styles.inviteSecondary, { color: colors.mutedForeground }]}>Cancel invitation</Text></TouchableOpacity> : null}
                  {item.invitation.status === "accepted" && isMe ? <TouchableOpacity disabled={invitationAction.isPending} onPress={() => router.push({ pathname: "/go-live", params: { invitationId: item.invitation!.id, channelId: item.invitation!.channelId } } as any)} style={styles.invitePrimary}><Text style={styles.invitePrimaryText}>Start private live</Text></TouchableOpacity> : null}
                  {item.invitation.status === "active" && !isMe ? <TouchableOpacity onPress={() => {
                    router.push({ pathname: "/stream/[channelId]", params: { channelId: item.invitation!.channelId, privateInvitationId: item.invitation!.id } } as any);
                  }} style={styles.invitePrimary}><Text style={styles.invitePrimaryText}>Join live</Text></TouchableOpacity> : null}
                </View>
              ) : item.kind === "media_pack" && item.mediaPackId ? (
                <MediaPackMessage packId={item.mediaPackId} mine={isMe} />
              ) : item.kind === "media" ? (
                <DirectMediaMessage message={item} mine={isMe} />
              ) : <View
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
              </View>}
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
          onPress={() => setShowMediaChooser(true)}
          activeOpacity={0.75}
          testID="chooser"
          accessibilityRole="button"
          accessibilityLabel={`Send media to ${name}`}
        >
          <Ionicons name="images-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
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

      <MediaChooser
        visible={showMediaChooser}
        peerId={peerIdStr}
        onClose={() => setShowMediaChooser(false)}
        onOpenPackPicker={() => setShowPackPicker(true)}
        onMediaSent={() => {
          setTimeout(() => setMessages(getMessages(peerIdStr)), 500);
        }}
      />
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
                  idempotencyKey: createGiftRequestKey(),
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
       <Modal visible={showInviteComposer} transparent animationType="slide" onRequestClose={() => setShowInviteComposer(false)}>
         <View style={styles.pickerShade}><View style={[styles.packPicker, { backgroundColor: colors.card }]}>
           <View style={styles.pickerHead}><Text style={[styles.pickerTitle, { color: colors.foreground }]}>Private live invite</Text><TouchableOpacity onPress={() => setShowInviteComposer(false)}><Ionicons name="close" size={23} color={colors.foreground} /></TouchableOpacity></View>
           <TouchableOpacity style={[styles.packOption, { borderColor: colors.border }, !inviteGiftId && styles.inviteChoice]} onPress={() => setInviteGiftId(null)}><Text style={[styles.packOptionName, { color: colors.foreground }]}>Free</Text><Text style={[styles.packOptionMeta, { color: colors.mutedForeground }]}>No gift required</Text></TouchableOpacity>
           <Text style={[styles.packOptionMeta, { color: colors.mutedForeground }]}>Paid — recipient pays when accepting</Text>
           {GIFTS.map((gift) => <TouchableOpacity key={gift.id} style={[styles.packOption, { borderColor: colors.border }, inviteGiftId === gift.id && styles.inviteChoice]} onPress={() => setInviteGiftId(gift.id)}><Text style={{ fontSize: 21 }}>{gift.emoji}</Text><Text style={[styles.packOptionName, { color: colors.foreground }]}>{gift.name}</Text><Text style={styles.price}>🪙 {gift.coins}</Text></TouchableOpacity>)}
           <TouchableOpacity disabled={createInviteMutation.isPending} onPress={() => void invitePeer()} style={styles.inviteSend}><Text style={styles.invitePrimaryText}>{createInviteMutation.isPending ? "Sending…" : "Send invite"}</Text></TouchableOpacity>
         </View></View>
       </Modal>
      <Modal visible={showPackPicker} transparent animationType="slide" onRequestClose={() => setShowPackPicker(false)}>
        <View style={[styles.pickerShade, { paddingBottom: Platform.OS === "android" ? 28 : 0 }]}><View style={[styles.packPicker,{backgroundColor:colors.card}]}>
          <View style={styles.pickerHead}><Text style={[styles.pickerTitle,{color:colors.foreground}]}>Send a media pack</Text><TouchableOpacity onPress={()=>setShowPackPicker(false)}><Ionicons name="close" size={23} color={colors.foreground}/></TouchableOpacity></View>
          {(((packsQuery.data as any)?.packs ?? packsQuery.data ?? []) as any[]).map((pack:any)=><TouchableOpacity key={pack.id} testID={`pack-send-${pack.id}`} disabled={sendPackMutation.isPending} onPress={async()=>{const recipientId=Number(peerIdStr); if(!Number.isInteger(recipientId)) return; try {await sendPackMutation.mutateAsync({packId:pack.id,data:{recipientId,idempotencyKey:createGiftRequestKey()}} as any);setShowPackPicker(false);setTimeout(()=>setMessages(getMessages(peerIdStr)),300);} catch {setSendError("Media pack couldn't be sent. Try again.");}}} style={[styles.packOption,{borderColor:colors.border}]}><Ionicons name="images" size={19} color={colors.primary}/><View style={{flex:1}}><Text style={[styles.packOptionName,{color:colors.foreground}]}>{pack.name}</Text><Text style={[styles.packOptionMeta,{color:colors.mutedForeground}]}>{pack.itemCount} items</Text></View><Text style={styles.price}>🪙 {pack.price}</Text></TouchableOpacity>)}
          {(((packsQuery.data as any)?.packs ?? packsQuery.data ?? []) as any[]).length===0&&<Text style={[styles.packOptionMeta,{color:colors.mutedForeground}]}>Create a pack in Profile before sending one.</Text>}
        </View></View>
      </Modal>
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
  inviteCard: { maxWidth: "78%", borderWidth: 1, borderRadius: 16, padding: 13, gap: 7 },
  inviteImage: { width: "100%", height: 120, borderRadius: 10, backgroundColor: "#171717" },
  inviteTitle: { fontFamily: "Inter_700Bold", fontSize: 15 },
  inviteStatus: { fontFamily: "Inter_400Regular", fontSize: 12, textTransform: "capitalize" },
  inviteActions: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 3 },
  invitePrimary: { backgroundColor: "#FF1966", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignSelf: "flex-start" },
  invitePrimaryText: { color: "#FFF", fontFamily: "Inter_700Bold", fontSize: 13 },
  inviteSecondary: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  invitePrice: { color: "#FFD700", fontFamily: "Inter_700Bold", fontSize: 13 },
  inviteChoice: { borderColor: "#FF1966", backgroundColor: "rgba(255,25,102,0.1)" },
  inviteSend: { backgroundColor: "#FF1966", padding: 13, alignItems: "center", borderRadius: 12, marginTop: 4 },
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
  pickerShade: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  packPicker:{borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,paddingBottom:36,gap:10},
  pickerHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:3},
  pickerTitle:{fontFamily:"Inter_700Bold",fontSize:18},
  packOption:{borderWidth:1,borderRadius:13,padding:12,flexDirection:"row",alignItems:"center",gap:10},
  packOptionName:{fontFamily:"Inter_600SemiBold",fontSize:15},
  packOptionMeta:{fontFamily:"Inter_400Regular",fontSize:12,marginTop:2},
  price:{color:"#FFD700",fontFamily:"Inter_700Bold"},
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
