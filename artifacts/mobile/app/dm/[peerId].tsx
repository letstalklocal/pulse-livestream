import { formatPrivateLiveTitle } from "@/utils/privateLiveLabels";
import { parseDmGiftReceipt } from "@/utils/dmGiftReceipt";
import { GoldCoinIcon } from "@/components/GoldCoinIcon";
import { CrownArtwork } from "@/components/CrownArtwork";
import { GiftImageArtwork, hasGiftImage } from "@/components/GiftImageArtwork";
import { t, useAppLanguage, localizedTextStyle, appLocale } from "@/i18n";
import { loadChatPeerStatus } from "@/utils/chatPeerStatus";
import { formatLastSeen } from "@/utils/lastSeen";
import { SwipeToReply } from "@/components/SwipeToReply";
import { useAuth as useClerkAuth } from "@clerk/expo";
import { AccountSafetyMenu } from "@/components/AccountSafetyMenu";
import { useAccountSafety } from "@/hooks/useAccountSafety";
import { TranslatedMessage } from "@/components/TranslatedMessage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  Alert,
  AccessibilityInfo,
  Animated,
  Easing,
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
// @ts-ignore generated media-pack hooks
import { getGetUserQueryKey, useGetUser, getGetCoinBalanceQueryKey, useActOnPrivateStreamInvitation, useCreatePrivateStreamInvitation, useGetCoinBalance, useSpendCoins, useGetMediaPacks, useSendMediaPack } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useRtm, type DmMessage } from "@/context/RtmContext";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "@/components/Avatar";
import { GiftPicker, GIFTS, type Gift } from "@/components/GiftPicker";
import { GiftFloater, type FloatingGift } from "@/components/GiftFloater";
import { GiftComboBadge } from "@/components/GiftComboBadge";
import { mergeGiftFloater } from "@/utils/giftPresentation";
import { MediaPackMessage } from "@/components/MediaPackMessage";
import { MediaChooser } from "@/components/MediaChooser";
import { DirectMediaMessage } from "@/components/DirectMediaMessage";

const createGiftRequestKey = () =>
  Crypto.randomUUID();

export default function DmScreen() {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const composerBottomInset = keyboardVisible ? 0 : insets.bottom;
  const router = useRouter();
  const leavingRef = useRef(false);
  const handleBack = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    router.back();
  }, [router]);
  const { user } = useAuth();
  const { getMessages, sendDm, markRead, conversations, refreshMessages, editDm, deleteDm, sendGiftDm } = useRtm();
  const queryClient = useQueryClient();

  const { peerId, peerName } = useLocalSearchParams<{ peerId: string; peerName: string }>();
  const peerIdStr = peerId ?? "";
  const safety = useAccountSafety(Number(peerIdStr));
  const contactBlocked = safety.data?.contactBlocked === true;
  const peerUid = Number(peerIdStr);
  const peerProfile = useGetUser(peerUid, {
    query: {
      queryKey: getGetUserQueryKey(peerUid),
      enabled: Number.isSafeInteger(peerUid) && peerUid > 0 && !contactBlocked,
      staleTime: 60_000,
      retry: false,
    },
  });
  // Reuse the video/profile avatar cache immediately; identity updates do not
  // wait for messages or the separate presence/chat-permission request.
  const profile = peerProfile.data?.user;
  const name = profile?.name?.trim() || peerName?.trim() ||
    conversations.find(conversation => conversation.peerId === peerIdStr)?.peerName?.trim() || "User";
  const avatarUri = profile?.avatarImageUrl ?? undefined;
  const openPeerProfile = useCallback(() => {
    if (!Number.isSafeInteger(peerUid) || peerUid <= 0) return;
    router.push({ pathname: "/profile/[hostUid]", params: { hostUid: String(peerUid), name } });
  }, [router, peerUid, name]);
  const {getToken}=useClerkAuth();
  const peerStatus = useQuery({
    queryKey: ["message-peer", user?.uid, peerIdStr],
    enabled: !!user?.uid && !!peerIdStr && !contactBlocked,
    refetchInterval: 5000,
    retry: false,
    queryFn: ({ signal }) => loadChatPeerStatus({
      baseUrl: process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "",
      peerId: peerIdStr,
      getToken,
      signal,
    }),
  });
  const [lastSeenNow, setLastSeenNow] = useState(Date.now);
  useFocusEffect(useCallback(() => {
    void refreshMessages();
    setLastSeenNow(Date.now());
    const timer = setInterval(() => setLastSeenNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [refreshMessages]));
  const roseRequestKey=useRef(createGiftRequestKey());
  const [sendingRose,setSendingRose]=useState(false);
  useEffect(()=>{roseRequestKey.current=createGiftRequestKey();},[peerIdStr]);
  const myUidStr = user?.uid != null ? String(user.uid) : null;

  const [inputText, setInputText] = useState("");
  const isTyping = inputText.length > 0;
  const composerActions = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    const animation = Animated.timing(composerActions, {
      toValue: isTyping ? 0 : 1,
      duration: reduceMotion ? 0 : 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [isTyping, reduceMotion, composerActions]);
  const [replyTo, setReplyTo] = useState<DmMessage | null>(null);
  const inputRef = useRef<TextInput>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  useEffect(() => { setReplyTo(null); }, [peerIdStr]);
  const replyText = (message: DmMessage) => message.kind === "media" ? (message.mediaType === "video" ? t("Video") : t("Photo")) : message.kind === "media_pack" ? t("Media pack") : message.kind === "private_stream_invitation" ? t("1:1 Private invitation") : message.text;
  const [messages, setMessages] = useState<DmMessage[]>(() => getMessages(peerIdStr));
  // Server-synced history permanently opens a chat under the server's existing
  // rules. Presence refreshes must not gate an established conversation.
  const establishedChat = getMessages(peerIdStr).length > 0;
  const needsGift = !establishedChat && peerStatus.data?.needsGift === true;
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [giftDrawerHeight, setGiftDrawerHeight] = useState(0);
  const [composerHeight, setComposerHeight] = useState(0);
  const giftMessageClearance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(giftMessageClearance, {
      toValue: showGiftPicker && !contactBlocked ? Math.max(0, giftDrawerHeight - composerHeight) : 0,
      duration: reduceMotion ? 0 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [showGiftPicker, contactBlocked, giftDrawerHeight, composerHeight, reduceMotion, giftMessageClearance]);
  const pendingGiftPayments = useRef(0);
  const [floatingGifts, setFloatingGifts] = useState<FloatingGift[]>([]);
  const activeGiftPeer = useRef<string | null>(peerIdStr);
  useEffect(() => {
    activeGiftPeer.current = peerIdStr;
    setFloatingGifts([]);
    return () => { activeGiftPeer.current = null; };
  }, [peerIdStr]);
  const giftFeedback = floatingGifts.map((gift) => (
    <GiftFloater key={gift.comboId ?? gift.id} gift={gift}
      onDone={(id) => setFloatingGifts((previous) => previous.filter((item) => item.id !== id))} />
  ));
  const [showPackPicker, setShowPackPicker] = useState(false);
  const mediaChooserRef = useRef<{ open: () => void }>(null);
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
  const positionAttemptsRef = useRef(0);
  const positionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positionDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const focusedRef = useRef(false);
  const latestMessageRef = useRef<string | undefined>(undefined);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const reversedMessagesRef = useRef(reversedMessages);
  reversedMessagesRef.current = reversedMessages;
  const paymentBalanceStateRef = useRef("");
  const giftRetryRef = useRef<{ peerId: string; giftId: string; key: string }[]>([]);

  const finishOpening = useCallback((index: number) => {
    // Content-size changes must not continually cancel the pending reveal.
    if (!focusedRef.current || positionedRef.current || scrollFrameRef.current != null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        if (!focusedRef.current || positionedRef.current) return;
        positionedRef.current = true;
        if (positionTimerRef.current != null) clearTimeout(positionTimerRef.current);
        if (positionDeadlineRef.current != null) clearTimeout(positionDeadlineRef.current);
        positionTimerRef.current = null;
        positionDeadlineRef.current = null;
        updateFollowingBottom(index <= 0);
        setListPositioned(true);
        markRead(peerIdStr);
      });
    });
  }, [markRead, peerIdStr, updateFollowingBottom]);

  // Prefer the first unread message, but never keep cached history hidden
  // indefinitely while variable-height rows are being measured.
  const positionOnOpen = useCallback(() => {
    if (!focusedRef.current || positionedRef.current) return;
    if (scrollFrameRef.current != null) return;
    const data = reversedMessagesRef.current;
    if (!data.length) return;
    const index = initialTargetRef.current
      ? data.findIndex((message) => message.messageId === initialTargetRef.current)
      : -1;
    if (positionDeadlineRef.current == null) {
      positionDeadlineRef.current = setTimeout(() => finishOpening(index), 500);
    }
    positionFailedRef.current = false;
    if (index >= 0) {
      listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 1 });
    } else {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
    if (positionFailedRef.current) return;
    finishOpening(index);
  }, [finishOpening]);

  const handleInitialPositionFailed = useCallback(({ index, averageItemLength }: { index: number; averageItemLength: number }) => {
    if (!focusedRef.current || positionedRef.current) return;
    positionFailedRef.current = true;
    positionAttemptsRef.current += 1;
    listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
    if (positionTimerRef.current != null) clearTimeout(positionTimerRef.current);
    if (positionAttemptsRef.current >= 3) {
      // Show the approximate unread position rather than a blank conversation.
      finishOpening(index);
      return;
    }
    positionTimerRef.current = setTimeout(positionOnOpen, 100);
  }, [finishOpening, positionOnOpen]);

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
        latest.messageId !== latestMessageRef.current && latest.senderId === myUidStr &&
        !parseDmGiftReceipt(latest.text, GIFTS)) {
      // Switch anchoring in the same render that inserts our outgoing message.
      updateFollowingBottom(true);
      keepAtBottom();
    }
    setMessages((current) => current.length === 0 && next.length === 0 ? current : next);
    // If the thread opened from stale cache, rerun the initial position after
    // the server-synced messages arrive instead of leaving the screen mid-open.
    if (focusedRef.current && !positionedRef.current && next.length > 0) {
      if (positionTimerRef.current != null) clearTimeout(positionTimerRef.current);
      positionTimerRef.current = setTimeout(positionOnOpen, 0);
    }
  }, [peerIdStr, getMessages, conversations, myUidStr, updateFollowingBottom, keepAtBottom, positionOnOpen]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      draggingRef.current = false;
      positionedRef.current = false;
      positionAttemptsRef.current = 0;
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
        if (positionDeadlineRef.current != null) clearTimeout(positionDeadlineRef.current);
        if (scrollFrameRef.current != null) cancelAnimationFrame(scrollFrameRef.current);
        positionTimerRef.current = null;
        positionDeadlineRef.current = null;
        scrollFrameRef.current = null;
      };
    }, [getMessages, peerIdStr, positionOnOpen, updateFollowingBottom]),
  );

  useEffect(() => {
    if (!focusedRef.current) return;
    const latest = messages[messages.length - 1];
    const hasNewMessage = latest && latest.messageId !== latestMessageRef.current;
    latestMessageRef.current = latest?.messageId;
    if (!positionedRef.current) return;
    if (hasNewMessage && (isNearBottomRef.current || (latest.senderId === myUidStr && !parseDmGiftReceipt(latest.text, GIFTS)))) {
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
  const [editingMessage, setEditingMessage] = useState<DmMessage | null>(null);
  const [editText, setEditText] = useState("");
  const [messageActionPending, setMessageActionPending] = useState(false);
  useEffect(() => { setEditingMessage(null); setEditText(""); }, [peerIdStr]);
  const removeMessage = async (message: DmMessage, scope: "everyone" | "me") => {
    if (messageActionPending) return;
    setMessageActionPending(true);
    try {
      const result = await deleteDm(message.messageId, scope);
      if (!result.ok) Alert.alert(t("Couldn't update message"), t("Please try again."));
      else if (replyTo?.messageId === message.messageId) setReplyTo(null);
    } finally { setMessageActionPending(false); }
  };
  const showMessageOptions = (message: DmMessage, translate?: () => void) => {
    if (messageActionPending) return;
    const mine = message.senderId === myUidStr;
    const text = !message.kind || message.kind === "text";
    const freeMedia = message.kind === "media" && (message.price ?? 0) === 0;
    if ((!text && !freeMedia) || message.text.startsWith("🎁")) return;
    const deletion = () => Alert.alert(t("Delete message?"), undefined, [
      ...(mine ? [{ text: t("Delete for everyone"), style: "destructive" as const, onPress: () => void removeMessage(message, "everyone") }] : []),
      { text: t("Delete for me"), style: "destructive", onPress: () => void removeMessage(message, "me") },
      { text: t("Cancel"), style: "cancel" },
    ]);
    Alert.alert(t("Message options"), undefined, [
      ...(mine && text ? [{ text: t("Edit"), onPress: () => { setEditText(message.text); setEditingMessage(message); } }] : []),
      { text: t("Delete"), style: "destructive", onPress: deletion },
      ...(translate ? [{ text: t("Translate"), onPress: translate }] : []),
      { text: t("Cancel"), style: "cancel" },
    ]);
  };
  const saveMessageEdit = async () => {
    if (!editingMessage || messageActionPending || !editText.trim()) return;
    setMessageActionPending(true);
    try {
      const result = await editDm(editingMessage.messageId, editText);
      if (result.ok) setEditingMessage(null);
      else Alert.alert(t("Couldn't update message"), t("Please try again."));
    } finally { setMessageActionPending(false); }
  };

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
      setInputText(current => current || text);void peerStatus.refetch();
    }
  };

  const activateChat = async () => {
    if(!user?.uid||sendingRose)return;
    setSendingRose(true);setSendError(null);
    try {
      const result=await spendMutation.mutateAsync({data:{uid:user.uid,recipientUid:Number(peerIdStr),amount:1,giftName:"Rose",senderName:user.name??"Viewer",description:"🌹 Rose to open chat",idempotencyKey:roseRequestKey.current}});
      queryClient.setQueryData(getGetCoinBalanceQueryKey({uid:user.uid}),{balance:result.balance});
      // Cancel a pre-payment status response so it cannot overwrite the unlock.
      await queryClient.cancelQueries({ queryKey: ["message-peer", user.uid, peerIdStr] });
      queryClient.setQueryData(["message-peer", user.uid, peerIdStr], (previous: any) => ({
        ...previous, online: previous?.online ?? false, lastSeen: previous?.lastSeen ?? null, needsGift: false,
      }));
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
      await createInviteMutation.mutateAsync({ data: { invitedUserId: recipientId, title: t("1:1 Private with {v0}", { v0: name }), requiredGiftId: inviteGiftId ?? undefined } as any });
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
        <TouchableOpacity onPress={handleBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity onPress={openPeerProfile} accessibilityRole="button" accessibilityLabel={t("View {v0}'s profile", { v0: name })} style={{ width: 40, height: 40 }}>
          <Avatar uid={peerUid} name={name} avatarUri={avatarUri} size={40} />
          {!contactBlocked && peerStatus.data?.online && <View accessibilityLabel={t("Online")} style={{ position: "absolute", bottom: 0, right: 1, width: 11, height: 11, borderRadius: 6, backgroundColor: "#22C55E", borderWidth: 2, borderColor: colors.background }} />}
        </TouchableOpacity>
        <View style={{flex:1}}><Text style={[styles.headerName, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
        {!contactBlocked && !peerStatus.data?.online && peerStatus.data?.lastSeen != null && <Text style={{fontSize:11,color:colors.mutedForeground}}>{formatLastSeen(peerStatus.data.lastSeen, lastSeenNow, appLocale(), t)}</Text>}</View>
        <TouchableOpacity style={styles.privateInviteButton} onPress={() => setShowInviteComposer(true)} disabled={createInviteMutation.isPending || contactBlocked || needsGift} accessibilityLabel={t("Invite {v0} to a 1:1 Private session", { v0: name })}>
          {createInviteMutation.isPending ? <ActivityIndicator size="small" color="#FFF" /> : <><Ionicons name="videocam-outline" size={26} color="#FFF" /><Text style={styles.privateInviteLabel}>1:1</Text></>}
        </TouchableOpacity>
        <AccountSafetyMenu uid={Number(peerIdStr)} source="dm" color={colors.foreground} peerId={peerIdStr} />
      </View>

      {/* Messages */}
      <Animated.View style={{ flex: 1, minHeight: 0, paddingBottom: giftMessageClearance }}>
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
        onScrollToIndexFailed={handleInitialPositionFailed}
        renderItem={({ item }) => {
          const isMe = item.senderId === myUidStr;
          const giftReceipt = parseDmGiftReceipt(item.text, GIFTS);
          const extraBottomSpacing = (item.kind === "media" && item.mediaType === "video")
            || (item.kind === "media_pack" && !!item.mediaPackId)
            || (item.kind === "private_stream_invitation" && !!item.invitation);
          return (
            <SwipeToReply color={colors.primary} disabled={contactBlocked || needsGift || sendingMessage} onReply={() => { setReplyTo(item); inputRef.current?.focus(); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
            <View style={[styles.bubbleRow, extraBottomSpacing && styles.cardRowSpacing, isMe && styles.bubbleRowMe]}>
              {!isMe && (
                <TouchableOpacity onPress={openPeerProfile} accessibilityRole="button" accessibilityLabel={t("View {v0}'s profile", { v0: name })}>
                <Avatar uid={parseInt(item.senderId)} name={item.senderName} size={28} />
                </TouchableOpacity>
              )}
              {item.kind === "private_stream_invitation" && item.invitation ? (
                <View style={[styles.inviteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Image source={{ uri: item.invitation.backgroundImageUrl }} style={styles.inviteImage} />
                  <Ionicons name="lock-closed" size={16} color={colors.primary} />
                  <Text style={[styles.inviteTitle, { color: colors.foreground }]}>{formatPrivateLiveTitle(item.invitation.title, t)}</Text>
                   <Text style={[localizedTextStyle(), [styles.inviteStatus, { color: colors.mutedForeground }]]}>{t("1:1 Private · {v0}", { v0: item.invitation.status })}</Text>
                   {item.invitation.requiredGiftAmount > 0 ? <Text style={[localizedTextStyle(), styles.invitePrice]}>🎁 {item.invitation.requiredGiftName} · 🪙 {item.invitation.requiredGiftAmount}{item.invitation.paymentStatus === "paid" ? t(" · paid") : item.invitation.paymentStatus === "refunded" ? t(" · refunded") : ""}</Text> : <Text style={[localizedTextStyle(), [styles.inviteStatus, { color: colors.mutedForeground }]]}>{t("Free invitation")}</Text>}
                  {item.invitation.status === "pending" && !isMe ? <View style={styles.inviteActions}>
                    <TouchableOpacity disabled={invitationAction.isPending} onPress={() => invitationAction.mutate({ id: Number(item.invitation!.id), action: "decline" })}><Text style={[localizedTextStyle(), [styles.inviteSecondary, { color: colors.mutedForeground }]]}>{t("Decline")}</Text></TouchableOpacity>
                    <TouchableOpacity disabled={invitationAction.isPending || contactBlocked} onPress={() => invitationAction.mutate({ id: Number(item.invitation!.id), action: "accept" }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCoinBalanceQueryKey({ uid: user?.uid ?? 0 }) }), onError: (error: any) => { const message = error?.message ?? "Unable to accept invitation."; setSendError(message.includes("Insufficient") ? "Insufficient coins to accept this invitation." : message); if (message.includes("Insufficient")) Alert.alert(t("Insufficient coins"), t("You need {v0} coins to accept this 1:1 Private session.", { v0: item.invitation!.requiredGiftAmount })); } })} style={styles.invitePrimary}><Text style={[localizedTextStyle(), styles.invitePrimaryText]}>{item.invitation.requiredGiftAmount > 0 ? t("Pay {v0} coins & Accept", { v0: item.invitation.requiredGiftAmount }) : t("Accept")}</Text></TouchableOpacity>
                  </View> : null}
                  {item.invitation.status === "pending" && isMe ? <TouchableOpacity disabled={invitationAction.isPending} onPress={() => invitationAction.mutate({ id: Number(item.invitation!.id), action: "cancel" })}><Text style={[localizedTextStyle(), [styles.inviteSecondary, { color: colors.mutedForeground }]]}>{t("Cancel invitation")}</Text></TouchableOpacity> : null}
                  {item.invitation.status === "accepted" && isMe ? <TouchableOpacity disabled={invitationAction.isPending || contactBlocked} onPress={() => router.push({ pathname: "/go-live", params: { invitationId: item.invitation!.id, channelId: item.invitation!.channelId } } as any)} style={styles.invitePrimary}><Text style={[localizedTextStyle(), styles.invitePrimaryText]}>{t("Start 1:1 Private")}</Text></TouchableOpacity> : null}
                  {item.invitation.status === "active" && !isMe ? <TouchableOpacity onPress={() => {
                    router.push({ pathname: "/stream/[channelId]", params: { channelId: item.invitation!.channelId, privateInvitationId: item.invitation!.id } } as any);
                  }} style={styles.invitePrimary}><Text style={[localizedTextStyle(), styles.invitePrimaryText]}>{t("Join live")}</Text></TouchableOpacity> : null}
                {isMe ? <Ionicons name="checkmark-done" size={16} color={item.readAt != null ? colors.primary : colors.mutedForeground} accessibilityLabel={item.readAt != null ? t("Read") : t("Sent")} style={{ alignSelf: "flex-end" }} /> : null}
                </View>
              ) : item.kind === "media_pack" && item.mediaPackId ? (
                <MediaPackMessage packId={item.mediaPackId} mine={isMe} read={isMe && item.readAt != null} />
              ) : item.kind === "media" ? (
                <DirectMediaMessage message={item} mine={isMe} onLongPress={(item.price ?? 0) === 0 ? () => showMessageOptions(item) : undefined} />
              ) : <View
                style={[
                  giftReceipt ? styles.giftMessage : styles.bubble,
                  !giftReceipt && (isMe
                    ? [styles.bubbleMe, { backgroundColor: "#FF1966" }]
                    : [styles.bubbleThem, { backgroundColor: colors.card }]),
                ]}
              >
                {item.replyTo && <View style={{ borderLeftWidth: 3, borderLeftColor: isMe ? "#FFF" : colors.primary, backgroundColor: "rgba(0,0,0,0.12)", borderRadius: 6, padding: 8, marginBottom: 6 }}><Text style={[localizedTextStyle(), { color: isMe ? "#FFF" : colors.primary, fontWeight: "600", fontSize: 12 }]}>{item.replyTo.senderId === myUidStr ? t("You") : item.replyTo.senderName}</Text><Text numberOfLines={2} style={{ color: isMe ? "#FFF" : colors.foreground, fontSize: 13 }}>{item.replyTo.text}</Text></View>}
                {giftReceipt ? <>
                  <View style={styles.giftMessageArtwork} accessible accessibilityLabel={giftReceipt.gift.name}>
                    {giftReceipt.gift.id === "crown" ? <CrownArtwork size={100} /> : hasGiftImage(giftReceipt.gift.id) ? <GiftImageArtwork gift={giftReceipt.gift.id} size={100} /> : <Text style={styles.giftMessageEmoji}>{giftReceipt.gift.emoji}</Text>}
                    <View style={{ position: "absolute", top: 0, right: -8 }}><GiftComboBadge count={giftReceipt.count} label={`×${appNumber(giftReceipt.count)}`} reduceMotion={reduceMotion} /></View>
                  </View>
                  <View style={styles.giftMessageValue}><GoldCoinIcon size={14} /><Text style={styles.giftMessageCoins}>{appNumber(giftReceipt.coins)}</Text></View>
                  <Text style={[styles.giftMessageTime, localizedTextStyle(), { color: colors.mutedForeground }]}>{new Date(item.ts).toLocaleTimeString(appLocale(), { hour: "2-digit", minute: "2-digit" })}{isMe ? <> <Ionicons name="checkmark-done" size={16} color={item.readAt != null ? colors.foreground : colors.mutedForeground} accessibilityLabel={item.readAt != null ? t("Read") : t("Sent")} /></> : null}</Text>
                </> : <TranslatedMessage trailing={<Text style={[localizedTextStyle(), { fontSize: 10, textAlign: "right", flexShrink: 1, color: isMe ? "rgba(255,255,255,0.8)" : colors.mutedForeground }]}>{item.editedAt ? <>{t("Edited")} </> : null}{new Date(item.ts).toLocaleTimeString(appLocale(), { hour: "2-digit", minute: "2-digit" })}{isMe ? <> <Ionicons name="checkmark-done" size={16} color={item.readAt != null ? "#FFF" : "rgba(255,255,255,0.45)"} accessibilityLabel={item.readAt != null ? t("Read") : t("Sent")} /></> : null}</Text>} onLongPress={item.text.startsWith("🎁") ? undefined : (translate) => showMessageOptions(item, translate)} text={item.text} messageId={item.messageId} kind="dm" peerId={peerIdStr} incoming={!isMe} style={[styles.bubbleText, { color: isMe ? "#FFF" : colors.foreground }]} />}
              </View>}
            </View>
            </SwipeToReply>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <TouchableOpacity onPress={openPeerProfile} accessibilityRole="button" accessibilityLabel={t("View {v0}'s profile", { v0: name })}>
            <Avatar uid={peerUid} name={name} avatarUri={avatarUri} size={64} />
            </TouchableOpacity>
            <Text style={[styles.emptyName, { color: colors.foreground }]}>{name}</Text>
            <Text style={[localizedTextStyle(), [styles.emptySub, { color: colors.mutedForeground }]]}>
              {needsGift ? t("Send a Rose to activate this chat.") : t("Say hi to start the conversation!")}
            </Text>
          </View>
        }
      />
      </Animated.View>

      {/* Send error */}
      {sendError && (
        <View style={[styles.errorBanner, { backgroundColor: "rgba(255,25,102,0.12)" }]}>
          <Text style={styles.errorText}>{t(sendError)}</Text>
        </View>
      )}
      {replyTo && !contactBlocked && !needsGift && <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, marginHorizontal: 16, borderLeftWidth: 3, borderLeftColor: colors.primary, backgroundColor: colors.card }}><View style={{ flex: 1 }}><Text style={[localizedTextStyle(), { color: colors.primary, fontWeight: "600" }]}>{t("Replying to {v0}", { v0: replyTo.senderId === myUidStr ? t("yourself") : replyTo.senderName })}</Text><Text numberOfLines={2} style={{ color: colors.mutedForeground, marginTop: 4 }}>{replyText(replyTo)}</Text></View><TouchableOpacity accessibilityLabel={t("Cancel reply")} disabled={sendingMessage} onPress={() => setReplyTo(null)}><Ionicons name="close" size={22} color={colors.mutedForeground} /></TouchableOpacity></View>}
      {/* Input bar */}
      {contactBlocked ? <Text style={[localizedTextStyle(), { color: colors.mutedForeground, textAlign: "center", padding: 16, paddingBottom: composerBottomInset + 16 }]}>{safety.data?.blockedByMe ? t("You blocked this user. Use the user menu to unblock.") : t("Messaging is unavailable with this account.")}</Text> : !establishedChat && peerStatus.isPending ? <ActivityIndicator color={colors.primary} style={{padding:20}}/> : !establishedChat && peerStatus.isError && !peerStatus.data ? <TouchableOpacity onPress={()=>void peerStatus.refetch()} style={{padding:20}}><Text style={[localizedTextStyle(), {color:colors.mutedForeground,textAlign:"center"}]}>{t("Couldn’t load chat settings. Tap to retry.")}</Text></TouchableOpacity> : needsGift ? <View style={{padding:20,paddingBottom:composerBottomInset+20,gap:10}}><Text style={[localizedTextStyle(), {color:colors.mutedForeground,textAlign:"center"}]}>{t("Send a Rose to activate your chat with {v0}.", { v0: name })}</Text><TouchableOpacity disabled={sendingRose} onPress={()=>void activateChat()} style={{padding:16,borderRadius:14,backgroundColor:colors.primary,alignItems:"center"}}>{sendingRose?<ActivityIndicator color="#FFF"/>:<Text style={[localizedTextStyle(), {color:"#FFF",fontWeight:"600"}]}>{t("🌹 Send Rose · 1 coin")}</Text>}</TouchableOpacity></View> : <View onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)} style={[styles.inputBar, { borderTopColor: colors.border, paddingBottom: composerBottomInset + 8 }]}>
        <TextInput
          ref={inputRef}
          style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          value={inputText}
          onChangeText={setInputText}
          placeholder={t("Type...")}
          placeholderTextColor={colors.mutedForeground}
          onSubmitEditing={send}
          returnKeyType="send"
          blurOnSubmit={false}
          multiline
        />
        <Animated.View
          pointerEvents={isTyping ? "none" : "auto"}
          accessibilityElementsHidden={isTyping}
          importantForAccessibility={isTyping ? "no-hide-descendants" : "auto"}
          style={{ width: composerActions.interpolate({ inputRange: [0, 1], outputRange: [0, 92] }), opacity: composerActions, overflow: "hidden" }}
        >
        <View style={{ width: 84, marginLeft: 8, flexDirection: "row", gap: 8 }}>
        <TouchableOpacity
          style={styles.giftBtn}
          onPress={() => mediaChooserRef.current?.open()}
          activeOpacity={0.75}
          testID="chooser"
          accessibilityRole="button"
          accessibilityLabel={t("Send media to {v0}", { v0: name })}
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
          accessibilityLabel={t("Send a gift to {v0}", { v0: name })}
          aria-label={`Send a gift to ${name}`}
        >
          <Ionicons name="gift-outline" size={22} color="#FFD700" />
        </TouchableOpacity>
        </View>
        </Animated.View>
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: inputText.trim() ? "#FF1966" : "rgba(255,25,102,0.2)" }]}
          onPress={send}
          activeOpacity={0.75}
          disabled={!inputText.trim() || sendingMessage}
        >
          <Ionicons name="send" size={18} color={inputText.trim() ? "#FFF" : "rgba(255,255,255,0.4)"} />
        </TouchableOpacity>
      </View>}

      <Modal testID="dm-edit-message" visible={editingMessage !== null} transparent animationType="fade" onRequestClose={() => { if (!messageActionPending) setEditingMessage(null); }}>
        <KeyboardAvoidingView style={styles.pickerShade} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
          <View style={[styles.editPanel, { backgroundColor: colors.background, paddingBottom: composerBottomInset + 8 }]}>
            <View style={styles.pickerHead}>
              <Text style={[styles.editTitle, { color: colors.mutedForeground }]}>{t("Edit message")}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Cancel")} disabled={messageActionPending} onPress={() => setEditingMessage(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <View style={styles.editRow}>
              <TextInput value={editText} onChangeText={setEditText} multiline maxLength={2000} autoFocus
                accessibilityLabel={t("Edit message")}
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} />
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={t(messageActionPending ? "Saving…" : "Save changes")}
                disabled={messageActionPending || !editText.trim()} onPress={() => void saveMessageEdit()}
                style={[styles.sendBtn, { backgroundColor: editText.trim() ? "#FF1966" : "rgba(255,25,102,0.2)" }]}>
                {messageActionPending ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="checkmark" size={22} color={editText.trim() ? "#FFF" : "rgba(255,255,255,0.4)"} />}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <ChatMediaChooser
        key={peerIdStr}
        ref={mediaChooserRef}
        peerId={peerIdStr}
        blocked={contactBlocked}
        onOpenPackPicker={() => setShowPackPicker(true)}
        onMediaSent={() => {
          setTimeout(() => setMessages(getMessages(peerIdStr)), 500);
        }}
      />
      <GiftPicker
        visible={showGiftPicker && !contactBlocked}
        onDrawerHeightChange={setGiftDrawerHeight}
        coins={viewerCoins}
        hintText="Select a gift, then tap Send."
        feedbackOverlay={giftFeedback}
        onClose={() => { setShowGiftPicker(false); setFloatingGifts([]); }}
        onSend={(gift: Gift) => {
          const recipientId = Number.parseInt(peerIdStr, 10);
          if (!user?.uid || !Number.isInteger(recipientId)) {
            Alert.alert(t("Unable to send gift"), t("This conversation is unavailable."));
            return;
          }

          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
          setSendError(null);
          // Only completed, uncertain requests are eligible for retry. An
          // in-flight tap never shares its key with another deliberate tap.
          const retryIndex = giftRetryRef.current.findIndex(item => item.peerId === peerIdStr && item.giftId === gift.id);
          const requestKey = retryIndex >= 0 ? giftRetryRef.current.splice(retryIndex, 1)[0].key : createGiftRequestKey();
          pendingGiftPayments.current += 1;
          void (async () => {
            try {
              const result = await sendGiftDm(peerIdStr, gift.id, requestKey);
              if (!result.ok || !result.combo) {
                if (result.uncertain) giftRetryRef.current.push({ peerId: peerIdStr, giftId: gift.id, key: requestKey });
                Alert.alert(t("Unable to send gift"), t(result.error ?? "Please try again."));
                return;
              }
              const combo = result.combo;

              queryClient.setQueryData(
                getGetCoinBalanceQueryKey({ uid: user.uid }),
                { balance: result.balance },
              );

              // Payment and the grouped receipt have committed together.
              if (activeGiftPeer.current === peerIdStr) {
                setFloatingGifts((previous) => mergeGiftFloater(previous, {
                  id: createGiftRequestKey(), emoji: gift.emoji, name: gift.name,
                  senderName: user.name ?? "You", x: 0, size: gift.size,
                  comboId: combo.id, comboCount: combo.count,
                  comboLabel: `×${appNumber(combo.count)}`, reduceMotion,
                }));
              }
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);

            } catch {
              giftRetryRef.current.push({ peerId: peerIdStr, giftId: gift.id, key: requestKey });
              Alert.alert(t("Gift couldn't be sent"), t("Please try again."));
            } finally {
              pendingGiftPayments.current -= 1;
              // Responses can arrive out of order; refresh the final wallet
              // after the burst rather than keeping an older response balance.
              if (pendingGiftPayments.current === 0) {
                void queryClient.invalidateQueries({ queryKey: getGetCoinBalanceQueryKey({ uid: user.uid }) });
              }
            }
          })();
        }}
      />
      {!showGiftPicker && !contactBlocked ? <View pointerEvents="none" style={StyleSheet.absoluteFill}>{giftFeedback}</View> : null}
       <Modal visible={showInviteComposer && !contactBlocked} transparent animationType="slide" onRequestClose={() => setShowInviteComposer(false)}>
         <View style={styles.pickerShade}><View style={[styles.packPicker, styles.invitePicker, { backgroundColor: colors.card, paddingBottom: Math.max(36, insets.bottom + 20) }]}>
           <View style={styles.pickerHead}><Text style={[localizedTextStyle(), [styles.pickerTitle, { color: colors.foreground }]]}>{t("1:1 Private invitation")}</Text><TouchableOpacity onPress={() => setShowInviteComposer(false)}><Ionicons name="close" size={23} color={colors.foreground} /></TouchableOpacity></View>
           <TouchableOpacity style={[styles.packOption, { borderColor: colors.border }, !inviteGiftId && styles.inviteChoice]} onPress={() => setInviteGiftId(null)}><Text style={[localizedTextStyle(), [styles.packOptionName, { color: colors.foreground }]]}>{t("Free")}</Text><Text style={[localizedTextStyle(), [styles.packOptionMeta, { color: colors.mutedForeground }]]}>{t("No gift required")}</Text></TouchableOpacity>
           <Text style={[localizedTextStyle(), [styles.packOptionMeta, { color: colors.mutedForeground }]]}>{t("Paid — recipient pays when accepting")}</Text>
           <ScrollView style={styles.inviteGiftViewport} contentContainerStyle={styles.inviteGiftGrid} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
             {GIFTS.map((gift) => <View key={gift.id} style={styles.inviteGiftSlot}>
               <TouchableOpacity style={[styles.inviteGiftCell, { borderColor: colors.border }, inviteGiftId === gift.id && styles.inviteChoice]}
                 onPress={() => setInviteGiftId(gift.id)} accessibilityRole="radio" accessibilityState={{ checked: inviteGiftId === gift.id }} accessibilityLabel={`${gift.name}, ${appNumber(gift.coins)}`}>
                 <View style={styles.inviteGiftArtwork}>
                   {gift.id === "crown" ? <CrownArtwork size={gift.size} /> : hasGiftImage(gift.id) ? <GiftImageArtwork gift={gift.id} size={gift.size} /> : <Text style={{ fontSize: gift.size }}>{gift.emoji}</Text>}
                 </View>
                 <Text style={[styles.inviteGiftName, localizedTextStyle(), { color: colors.foreground }]} numberOfLines={1}>{gift.name}</Text>
                 <View style={styles.inviteGiftCost}><GoldCoinIcon size={11} /><Text style={styles.inviteGiftPrice}>{appNumber(gift.coins)}</Text></View>
               </TouchableOpacity>
             </View>)}
           </ScrollView>
           <TouchableOpacity disabled={createInviteMutation.isPending || contactBlocked || needsGift} onPress={() => void invitePeer()} style={styles.inviteSend}><Text style={[localizedTextStyle(), styles.invitePrimaryText]}>{createInviteMutation.isPending ? t("Sending…") : t("Send invite")}</Text></TouchableOpacity>
         </View></View>
       </Modal>
      <Modal visible={showPackPicker && !contactBlocked} transparent animationType="slide" onRequestClose={() => setShowPackPicker(false)}>
        <View style={[styles.pickerShade, { paddingBottom: Platform.OS === "android" ? 28 : 0 }]}><View style={[styles.packPicker,{backgroundColor:colors.card}]}>
          <View style={styles.pickerHead}><Text style={[localizedTextStyle(), [styles.pickerTitle,{color:colors.foreground}]]}>{t("Send a media pack")}</Text><TouchableOpacity onPress={()=>setShowPackPicker(false)}><Ionicons name="close" size={23} color={colors.foreground}/></TouchableOpacity></View>
          {(((packsQuery.data as any)?.packs ?? packsQuery.data ?? []) as any[]).map((pack:any)=><TouchableOpacity key={pack.id} testID={`pack-send-${pack.id}`} disabled={sendPackMutation.isPending} onPress={async()=>{const recipientId=Number(peerIdStr); if(!Number.isInteger(recipientId)) return; try {await sendPackMutation.mutateAsync({packId:pack.id,data:{recipientId,idempotencyKey:createGiftRequestKey()}} as any);setShowPackPicker(false);setTimeout(()=>setMessages(getMessages(peerIdStr)),300);} catch {setSendError("Media pack couldn't be sent. Try again.");}}} style={[styles.packOption,{borderColor:colors.border}]}><Ionicons name="images" size={19} color={colors.primary}/><View style={{flex:1}}><Text style={[styles.packOptionName,{color:colors.foreground}]}>{pack.name}</Text><Text style={[localizedTextStyle(), [styles.packOptionMeta,{color:colors.mutedForeground}]]}>{t("{v0} items", { v0: pack.itemCount })}</Text></View><Text style={styles.price}>🪙 {pack.price}</Text></TouchableOpacity>)}
          {(((packsQuery.data as any)?.packs ?? packsQuery.data ?? []) as any[]).length===0&&<Text style={[localizedTextStyle(), [styles.packOptionMeta,{color:colors.mutedForeground}]]}>{t("Create a pack in Profile before sending one.")}</Text>}
        </View></View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// Keep visibility local and the native modal outside the animated composer controls.
function ChatMediaChooser({ ref, peerId, blocked, onOpenPackPicker, onMediaSent }: {
  ref: React.Ref<{ open: () => void }>;
  peerId: string;
  blocked: boolean;
  onOpenPackPicker: () => void;
  onMediaSent: () => void;
}) {
  const [visible, setVisible] = useState(false);
  useImperativeHandle(ref, () => ({ open: () => setVisible(true) }), []);

  return (
    <MediaChooser
      visible={visible && !blocked}
      peerId={peerId}
      onClose={() => setVisible(false)}
      onOpenPackPicker={onOpenPackPicker}
      onMediaSent={onMediaSent}
    />
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
  privateInviteButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  privateInviteLabel: { position: "absolute", color: "#FFF", fontSize: 7, lineHeight: 9, fontFamily: "Inter_700Bold", includeFontPadding: false, textAlign: "center", transform: [{ translateX: -5 }] },
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
  cardRowSpacing: { marginBottom: 16 },
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
  giftMessage: { maxWidth: "72%", alignItems: "center", gap: 5, paddingVertical: 6 },
  giftMessageArtwork: { width: 100, height: 100, alignItems: "center", justifyContent: "center" },
  giftMessageEmoji: { fontSize: 80, lineHeight: 100, includeFontPadding: false },
  giftMessageValue: { flexDirection: "row", alignItems: "center", gap: 4 },
  giftMessageCoins: { color: "#FFD700", fontSize: 14, fontFamily: "Inter_700Bold" },
  giftMessageTime: { fontSize: 10 },
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
  inviteSend: { flexShrink: 0, backgroundColor: "#FF1966", padding: 13, alignItems: "center", borderRadius: 12, marginTop: 4 },
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
  editPanel: { paddingHorizontal: 12, paddingTop: 12, gap: 8, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  editTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  editRow: { flexDirection: "row", alignItems: "flex-end" },
  packPicker:{borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,paddingBottom:36,gap:10},
  pickerHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:3},
  pickerTitle:{fontFamily:"Inter_700Bold",fontSize:18},
  invitePicker: { maxHeight: "85%" },
  inviteGiftViewport: { maxHeight: 240, flexGrow: 0, flexShrink: 1 },
  inviteGiftGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 8 },
  inviteGiftSlot: { width: "25%", paddingHorizontal: 2 },
  inviteGiftCell: { borderWidth: 1, borderRadius: 12, alignItems: "center", paddingVertical: 8, paddingHorizontal: 4, gap: 2 },
  inviteGiftArtwork: { height: 44, alignItems: "center", justifyContent: "center" },
  inviteGiftName: { fontSize: 10, lineHeight: 12, fontFamily: "Inter_600SemiBold" },
  inviteGiftCost: { flexDirection: "row", alignItems: "center", gap: 3 },
  inviteGiftPrice: { color: "#FFD700", fontSize: 11, fontFamily: "Inter_700Bold" },
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
    marginLeft: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
});
