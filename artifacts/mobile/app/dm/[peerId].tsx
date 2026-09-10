import { SwipeToReply } from "@/components/SwipeToReply";
import { useAuth as useClerkAuth } from "@clerk/expo";
import { AccountSafetyMenu } from "@/components/AccountSafetyMenu";
import { useAccountSafety } from "@/hooks/useAccountSafety";
import { TranslatedMessage } from "@/components/TranslatedMessage";
import { TranslationToggle } from "@/components/TranslationToggle";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const { getMessages, sendDm, markRead, conversations } = useRtm();
  const queryClient = useQueryClient();

  const { peerId, peerName } = useLocalSearchParams<{ peerId: string; peerName: string }>();
  const peerIdStr = peerId ?? "";
  const name = peerName ?? "User";
  const safety = useAccountSafety(Number(peerIdStr));
  const contactBlocked = safety.data?.contactBlocked === true;
  const {getToken}=useClerkAuth();
  const peerStatus=useQuery({queryKey:["message-peer",user?.uid,peerIdStr],enabled:!!user?.uid&&!!peerIdStr&&!contactBlocked,refetchInterval:5000,queryFn:async():Promise<{online:boolean;lastSeen:number|null;needsGift:boolean}>=>{
    const token=await getToken();const base=process.env.EXPO_PUBLIC_DOMAIN?`https://${process.env.EXPO_PUBLIC_DOMAIN}`:"";
    const res=await fetch(`${base}/api/messages/peers/${encodeURIComponent(peerIdStr)}`,{headers:{Authorization:`Bearer ${token}`}});if(!res.ok)throw new Error("Couldn’t load chat status.");return res.json();
  }});
  const needsGift=peerStatus.data?.needsGift===true;
  const roseRequestKey=useRef(createGiftRequestKey());
  const [sendingRose,setSendingRose]=useState(false);
  useEffect(()=>{roseRequestKey.current=createGiftRequestKey();},[peerIdStr]);
  const myUidStr = user?.uid != null ? String(user.uid) : null;

  const [inputText, setInputText] = useState("");
  const [replyTo, setReplyTo] = useState<DmMessage | null>(null);
  const inputRef = useRef<TextInput>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  useEffect(() => { setReplyTo(null); }, [peerIdStr]);
  const replyText = (message: DmMessage) => message.kind === "media" ? (message.mediaType === "video" ? "Video" : "Photo") : message.kind === "media_pack" ? "Media pack" : message.kind === "private_stream_invitation" ? "Private live invitation" : message.text;
  const [messages, setMessages] = useState<DmMessage[]>(() => getMessages(peerIdStr));
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [showPackPicker, setShowPackPicker] = useState(false);
  const [showMediaChooser, setShowMediaChooser] = useState(false);
  const [showInviteComposer, setShowInviteComposer] = useState(false);
  const [inviteGiftId, setInviteGiftId] = useState<string | null>(null);
  const [listPositioned, setListPositioned] = useState(false);
  const listRef = useRef<FlatList>(null);
  const isNearBottomRef = useRef(true);
  const [followingBottom, setFollowingBottom] = useState(true);
  const updateFollowingBottom = useCallback((following: boolean) => {
    isNearBottomRef.current = following;
    setFollowingBottom(following);
  }, []);
  const draggingRef = useRef(false);
  const initialTargetRef = useRef<string | null>(null);
  const positionedRef = useRef(false);
  const positionFailedRef = useRef(false);
  const positionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const focusedRef = useRef(false);
  const latestMessageRef = useRef<string | undefined>(undefined);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const reversedMessagesRef = useRef(reversedMessages);
  reversedMessagesRef.current = reversedMessages;
  const paymentBalanceStateRef = useRef("");

  // An inverted list starts at the newest message without scrolling through history.
  // Only unread openings need an explicit (hidden, nonanimated) position change.
  const positionOnOpen = useCallback(() => {
    if (!focusedRef.current || positionedRef.current) return;
    if (scrollFrameRef.current != null) {
      cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
    const data = reversedMessagesRef.current;
    if (!data.length) return;
    const index = initialTargetRef.current
      ? data.findIndex((message) => message.messageId === initialTargetRef.current)
      : -1;
    positionFailedRef.current = false;
    if (index >= 0) {
      listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 1 });
    } else {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
    if (positionFailedRef.current) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = requestAnimationFrame(() => {
        positionedRef.current = true;
        updateFollowingBottom(index <= 0);
        setListPositioned(true);
        markRead(peerIdStr);
        scrollFrameRef.current = null;
      });
    });
  }, [markRead, peerIdStr, updateFollowingBottom]);

  // At the bottom, keep offset zero instead of anchoring an older message and
  // then animating back to the newest one after insertion or keyboard layout.
  const keepAtBottom = useCallback(() => {
    if (focusedRef.current && positionedRef.current && isNearBottomRef.current && !draggingRef.current) {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, []);

  const handleListLayout = useCallback(() => {
    if (!positionedRef.current) positionOnOpen();
    else if (isNearBottomRef.current) keepAtBottom();
  }, [keepAtBottom, positionOnOpen]);

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

  // Conversation updates are published as soon as the message store changes.
  // Read that update directly instead of waiting for a separate 500 ms poll.
  useEffect(() => {
    const next = getMessages(peerIdStr);
    const latest = next[next.length - 1];
    if (focusedRef.current && positionedRef.current && latest &&
        latest.messageId !== latestMessageRef.current && latest.senderId === myUidStr) {
      // Switch anchoring in the same render that inserts our outgoing message.
      updateFollowingBottom(true);
      keepAtBottom();
    }
    setMessages((current) => current.length === 0 && next.length === 0 ? current : next);
  }, [peerIdStr, getMessages, conversations, myUidStr, updateFollowingBottom, keepAtBottom]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      draggingRef.current = false;
      positionedRef.current = false;
      setListPositioned(false);
      const cached = getMessages(peerIdStr);
      const unread = conversationsRef.current.find((c) => c.peerId === peerIdStr)?.unread ?? 0;
      const incoming = cached.filter((message) => message.senderId === peerIdStr);
      initialTargetRef.current = unread > 0
        ? incoming[Math.max(0, incoming.length - unread)]?.messageId ?? null
        : null;
      latestMessageRef.current = cached[cached.length - 1]?.messageId;
      updateFollowingBottom(initialTargetRef.current === null);
      setMessages(cached);
      // Also handles returning to an already mounted conversation.
      positionTimerRef.current = setTimeout(positionOnOpen, 0);
      return () => {
        focusedRef.current = false;
        if (positionTimerRef.current != null) clearTimeout(positionTimerRef.current);
        if (scrollFrameRef.current != null) cancelAnimationFrame(scrollFrameRef.current);
      };
    }, [getMessages, peerIdStr, positionOnOpen, updateFollowingBottom]),
  );

  useEffect(() => {
    if (!focusedRef.current) return;
    const latest = messages[messages.length - 1];
    const hasNewMessage = latest && latest.messageId !== latestMessageRef.current;
    latestMessageRef.current = latest?.messageId;
    if (!positionedRef.current) return;
    if (hasNewMessage && (isNearBottomRef.current || latest.senderId === myUidStr)) {
      updateFollowingBottom(true);
      keepAtBottom();
    }
    if (messages.length > 0) markRead(peerIdStr);
  }, [messages, markRead, peerIdStr, myUidStr, keepAtBottom, updateFollowingBottom]);

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
    if (!text || contactBlocked || sendingMessage) return;
    setSendingMessage(true);
    setInputText("");
    setSendError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await sendDm(peerIdStr, name, text, replyTo?.messageId);
    setSendingMessage(false);
    if (result.ok) setReplyTo(null);
    if (!result.ok && result.error) {
      setSendError(result.error);
      setInputText(text);void peerStatus.refetch();
    }
  };

  const activateChat = async () => {
    if(!user?.uid||sendingRose)return;
    setSendingRose(true);setSendError(null);
    try {
      const result=await spendMutation.mutateAsync({data:{uid:user.uid,recipientUid:Number(peerIdStr),amount:1,giftName:"Rose",senderName:user.name??"Viewer",description:"🌹 Rose to open chat",idempotencyKey:roseRequestKey.current}});
      queryClient.setQueryData(getGetCoinBalanceQueryKey({uid:user.uid}),{balance:result.balance});
      const receipt=await sendDm(peerIdStr,name,"🎁 🌹 Rose gift • 1 coin");
      await peerStatus.refetch();
      if(!receipt.ok)setSendError("Rose sent. Your chat is activated, but the gift receipt could not be delivered.");
    }catch(error){setSendError(error instanceof Error?error.message:"Couldn’t send Rose. Please try again.");}
    finally{setSendingRose(false);}
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
        <View style={{flex:1}}><Text style={[styles.headerName, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
        {!contactBlocked&&peerStatus.data?.lastSeen!=null&&<Text style={{fontSize:11,color:colors.mutedForeground}}>{peerStatus.data.online?"Online":`Last seen ${new Date(peerStatus.data.lastSeen).toLocaleString()}`}</Text>}</View>
        <TranslationToggle peerId={peerIdStr} color={colors.foreground} />
        <TouchableOpacity onPress={() => setShowInviteComposer(true)} disabled={createInviteMutation.isPending || contactBlocked || needsGift} accessibilityLabel={`Invite ${name} to a private live stream`}>
          {createInviteMutation.isPending ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="videocam-outline" size={23} color={colors.primary} />}
        </TouchableOpacity>
        <AccountSafetyMenu uid={Number(peerIdStr)} source="dm" color={colors.foreground} />
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={reversedMessages}
        inverted={messages.length > 0}
        maintainVisibleContentPosition={followingBottom ? undefined : { minIndexForVisible: 0 }}
        style={{ flex: 1, minHeight: 0, opacity: messages.length === 0 || listPositioned ? 1 : 0 }}
        keyExtractor={(item) => item.messageId}
        contentContainerStyle={[styles.listContent, { paddingBottom: 8 }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          draggingRef.current = true;
        }}
        onScroll={({ nativeEvent }) => {
          // Native anchoring can change the offset when a message is inserted.
          // Only a user's scroll should switch off following the conversation.
          if (draggingRef.current) {
            updateFollowingBottom(nativeEvent.contentOffset.y <= 80);
          }
        }}
        onScrollEndDrag={({ nativeEvent }) => {
          draggingRef.current = false;
          updateFollowingBottom(nativeEvent.contentOffset.y <= 80);
        }}
        onMomentumScrollBegin={() => {
          draggingRef.current = true;
        }}
        onMomentumScrollEnd={({ nativeEvent }) => {
          draggingRef.current = false;
          updateFollowingBottom(nativeEvent.contentOffset.y <= 80);
        }}
        onLayout={handleListLayout}
        onContentSizeChange={handleListLayout}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          // Variable-height rows outside the render window must be measured first.
          // Keep the list hidden until the exact unread index can be positioned.
          positionFailedRef.current = true;
          listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
          if (positionTimerRef.current != null) clearTimeout(positionTimerRef.current);
          positionTimerRef.current = setTimeout(positionOnOpen, 100);
        }}
        renderItem={({ item }) => {
          const isMe = item.senderId === myUidStr;
          const isGift = item.text.startsWith("🎁");
          return (
            <SwipeToReply color={colors.primary} disabled={contactBlocked || needsGift || sendingMessage} onReply={() => { setReplyTo(item); inputRef.current?.focus(); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
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
                    <TouchableOpacity disabled={invitationAction.isPending || contactBlocked} onPress={() => invitationAction.mutate({ id: Number(item.invitation!.id), action: "accept" }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCoinBalanceQueryKey({ uid: user?.uid ?? 0 }) }), onError: (error: any) => { const message = error?.message ?? "Unable to accept invitation."; setSendError(message.includes("Insufficient") ? "Insufficient coins to accept this invitation." : message); if (message.includes("Insufficient")) Alert.alert("Insufficient coins", `You need ${item.invitation!.requiredGiftAmount} coins to accept this private live.`); } })} style={styles.invitePrimary}><Text style={styles.invitePrimaryText}>{item.invitation.requiredGiftAmount > 0 ? `Pay ${item.invitation.requiredGiftAmount} coins & Accept` : "Accept"}</Text></TouchableOpacity>
                  </View> : null}
                  {item.invitation.status === "pending" && isMe ? <TouchableOpacity disabled={invitationAction.isPending} onPress={() => invitationAction.mutate({ id: Number(item.invitation!.id), action: "cancel" })}><Text style={[styles.inviteSecondary, { color: colors.mutedForeground }]}>Cancel invitation</Text></TouchableOpacity> : null}
                  {item.invitation.status === "accepted" && isMe ? <TouchableOpacity disabled={invitationAction.isPending || contactBlocked} onPress={() => router.push({ pathname: "/go-live", params: { invitationId: item.invitation!.id, channelId: item.invitation!.channelId } } as any)} style={styles.invitePrimary}><Text style={styles.invitePrimaryText}>Start private live</Text></TouchableOpacity> : null}
                  {item.invitation.status === "active" && !isMe ? <TouchableOpacity onPress={() => {
                    router.push({ pathname: "/stream/[channelId]", params: { channelId: item.invitation!.channelId, privateInvitationId: item.invitation!.id } } as any);
                  }} style={styles.invitePrimary}><Text style={styles.invitePrimaryText}>Join live</Text></TouchableOpacity> : null}
                {isMe ? <Ionicons name="checkmark-done" size={16} color={item.readAt != null ? colors.primary : colors.mutedForeground} accessibilityLabel={item.readAt != null ? "Read" : "Sent"} style={{ alignSelf: "flex-end" }} /> : null}
                </View>
              ) : item.kind === "media_pack" && item.mediaPackId ? (
                <MediaPackMessage packId={item.mediaPackId} mine={isMe} read={isMe && item.readAt != null} />
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
                {item.replyTo && <View style={{ borderLeftWidth: 3, borderLeftColor: isMe ? "#FFF" : colors.primary, backgroundColor: "rgba(0,0,0,0.12)", borderRadius: 6, padding: 8, marginBottom: 6 }}><Text style={{ color: isMe ? "#FFF" : colors.primary, fontWeight: "600", fontSize: 12 }}>{item.replyTo.senderId === myUidStr ? "You" : item.replyTo.senderName}</Text><Text numberOfLines={2} style={{ color: isMe ? "#FFF" : colors.foreground, fontSize: 13 }}>{item.replyTo.text}</Text></View>}
                <TranslatedMessage trailing={<Text style={{ fontSize: 10, color: isGift ? "#FFD700" : isMe ? "rgba(255,255,255,0.8)" : colors.mutedForeground }}>{new Date(item.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{isMe ? <> <Ionicons name="checkmark-done" size={16} color={item.readAt != null ? (isGift ? "#FFD700" : "#FFF") : (isGift ? "rgba(255,215,0,0.45)" : "rgba(255,255,255,0.45)")} accessibilityLabel={item.readAt != null ? "Read" : "Sent"} /></> : null}</Text>} text={item.text} messageId={item.messageId} kind="dm" peerId={peerIdStr} incoming={!isMe && !isGift} style={[styles.bubbleText, { color: isGift ? "#FFD700" : isMe ? "#FFF" : colors.foreground }]} />
              </View>}
            </View>
            </SwipeToReply>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Avatar uid={parseInt(peerIdStr)} name={name} size={64} />
            <Text style={[styles.emptyName, { color: colors.foreground }]}>{name}</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              {needsGift ? "Send a Rose to activate this chat." : "Say hi to start the conversation!"}
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
      {replyTo && !contactBlocked && !needsGift && <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, marginHorizontal: 16, borderLeftWidth: 3, borderLeftColor: colors.primary, backgroundColor: colors.card }}><View style={{ flex: 1 }}><Text style={{ color: colors.primary, fontWeight: "600" }}>Replying to {replyTo.senderId === myUidStr ? "yourself" : replyTo.senderName}</Text><Text numberOfLines={2} style={{ color: colors.mutedForeground, marginTop: 4 }}>{replyText(replyTo)}</Text></View><TouchableOpacity accessibilityLabel="Cancel reply" disabled={sendingMessage} onPress={() => setReplyTo(null)}><Ionicons name="close" size={22} color={colors.mutedForeground} /></TouchableOpacity></View>}
      {/* Input bar */}
      {contactBlocked ? <Text style={{ color: colors.mutedForeground, textAlign: "center", padding: 16, paddingBottom: insets.bottom + 16 }}>{safety.data?.blockedByMe ? "You blocked this user. Use the user menu to unblock." : "Messaging is unavailable with this account."}</Text> : peerStatus.isPending ? <ActivityIndicator color={colors.primary} style={{padding:20}}/> : peerStatus.isError ? <TouchableOpacity onPress={()=>void peerStatus.refetch()} style={{padding:20}}><Text style={{color:colors.mutedForeground,textAlign:"center"}}>Couldn’t load chat settings. Tap to retry.</Text></TouchableOpacity> : needsGift ? <View style={{padding:20,paddingBottom:insets.bottom+20,gap:10}}><Text style={{color:colors.mutedForeground,textAlign:"center"}}>Send a Rose to activate your chat with {name}.</Text><TouchableOpacity disabled={sendingRose} onPress={()=>void activateChat()} style={{padding:16,borderRadius:14,backgroundColor:colors.primary,alignItems:"center"}}>{sendingRose?<ActivityIndicator color="#FFF"/>:<Text style={{color:"#FFF",fontWeight:"600"}}>🌹 Send Rose · 1 coin</Text>}</TouchableOpacity></View> : <View style={[styles.inputBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          ref={inputRef}
          editable={!sendingMessage}
          style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type..."
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
          disabled={!inputText.trim() || sendingMessage}
        >
          <Ionicons name="send" size={18} color={inputText.trim() ? "#FFF" : "rgba(255,255,255,0.4)"} />
        </TouchableOpacity>
      </View>}

      <MediaChooser
        visible={showMediaChooser && !contactBlocked}
        peerId={peerIdStr}
        onClose={() => setShowMediaChooser(false)}
        onOpenPackPicker={() => setShowPackPicker(true)}
        onMediaSent={() => {
          setTimeout(() => setMessages(getMessages(peerIdStr)), 500);
        }}
      />
      <GiftPicker
        visible={showGiftPicker && !contactBlocked}
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
       <Modal visible={showInviteComposer && !contactBlocked} transparent animationType="slide" onRequestClose={() => setShowInviteComposer(false)}>
         <View style={styles.pickerShade}><View style={[styles.packPicker, { backgroundColor: colors.card }]}>
           <View style={styles.pickerHead}><Text style={[styles.pickerTitle, { color: colors.foreground }]}>Private live invite</Text><TouchableOpacity onPress={() => setShowInviteComposer(false)}><Ionicons name="close" size={23} color={colors.foreground} /></TouchableOpacity></View>
           <TouchableOpacity style={[styles.packOption, { borderColor: colors.border }, !inviteGiftId && styles.inviteChoice]} onPress={() => setInviteGiftId(null)}><Text style={[styles.packOptionName, { color: colors.foreground }]}>Free</Text><Text style={[styles.packOptionMeta, { color: colors.mutedForeground }]}>No gift required</Text></TouchableOpacity>
           <Text style={[styles.packOptionMeta, { color: colors.mutedForeground }]}>Paid — recipient pays when accepting</Text>
           {GIFTS.map((gift) => <TouchableOpacity key={gift.id} style={[styles.packOption, { borderColor: colors.border }, inviteGiftId === gift.id && styles.inviteChoice]} onPress={() => setInviteGiftId(gift.id)}><Text style={{ fontSize: 21 }}>{gift.emoji}</Text><Text style={[styles.packOptionName, { color: colors.foreground }]}>{gift.name}</Text><Text style={styles.price}>🪙 {gift.coins}</Text></TouchableOpacity>)}
           <TouchableOpacity disabled={createInviteMutation.isPending || contactBlocked || needsGift} onPress={() => void invitePeer()} style={styles.inviteSend}><Text style={styles.invitePrimaryText}>{createInviteMutation.isPending ? "Sending…" : "Send invite"}</Text></TouchableOpacity>
         </View></View>
       </Modal>
      <Modal visible={showPackPicker && !contactBlocked} transparent animationType="slide" onRequestClose={() => setShowPackPicker(false)}>
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
