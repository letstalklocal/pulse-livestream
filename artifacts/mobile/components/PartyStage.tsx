import { t, useAppLanguage, localizedTextStyle, appLocale } from "@/i18n";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Modal, PanResponder, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LiveParty } from "@workspace/api-client-react";
import { RtcSurfaceViewComponent, VideoSourceType } from "@/utils/agora";
import { Avatar } from "./Avatar";
import { battleUsesSplitLayout, partyLayout } from "@/utils/partyLayout";

const PARTY_BATTLE_GOLD = "#E8BD59";

export function PartyStage({ main, mainName, channelId, party, now, media, onWindowInteraction, onPartnerDoubleTap }: {
  main: React.ReactNode; mainName: string; channelId: string; party: LiveParty | null; now: number;
  media: { connection: { channelId: string; localUid: number } | null; ready: boolean; error: string | null; retry: () => void; audioMuted: boolean; audioError: string | null; setAudioMuted: (muted: boolean) => void };
  onWindowInteraction?: (active: boolean) => void;
  onPartnerDoubleTap?: (channelId: string) => void;
}) {
  const { t, localizedTextStyle, appLocale, appNumber } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const peer = party?.status === "active" ? party.participants.find(p => p.channelId !== channelId) : undefined;
  const battle = party?.battle;
  const battleActive = !!peer && battle?.status === "active" && !!battle.endsAt && now < battle.endsAt;
  const vs = battleUsesSplitLayout(battleActive);
  const mine = party?.participants.find(p => p.channelId === channelId);
  const [compact, setCompact] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [showPartnerInfo, setShowPartnerInfo] = useState(false);
  const longPressed = useRef(false);
  const pendingTap = useRef<{ at: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const cancelTap = () => {
    if (pendingTap.current) clearTimeout(pendingTap.current.timer);
    pendingTap.current = null;
  };
  useEffect(() => cancelTap, [party?.id, peer?.channelId, vs, hidden, showPartnerInfo]);
  const pressWindow = () => {
    if (longPressed.current || hidden || vs || !peer) return;
    if (!onPartnerDoubleTap) { setCompact(value => !value); return; }
    const firstTap = pendingTap.current;
    cancelTap();
    if (firstTap && Date.now() - firstTap.at <= 300) {
      onPartnerDoubleTap(peer.channelId);
      return;
    }
    pendingTap.current = {
      at: Date.now(),
      timer: setTimeout(() => { pendingTap.current = null; setCompact(value => !value); }, 300),
    };
  };
  const pipWidth = width / (compact ? 4 : 3);
  const pipHeight = pipWidth * 16 / 9;
  const { top, panelHeight } = partyLayout(width, height, insets.top, insets.bottom);
  const windowTop = top + 14;
  const slide = useRef(new Animated.Value(0)).current;
  const interactionCallback = useRef(onWindowInteraction);
  interactionCallback.current = onWindowInteraction;
  useEffect(() => {
    setCompact(false);
    setHidden(false);
    setShowPartnerInfo(false);
    longPressed.current = false;
    slide.setValue(0);
  }, [party?.id, peer?.channelId, slide]);
  useEffect(() => {
    const transition = Animated.timing(slide, {
      toValue: hidden && !vs ? pipWidth + 12 : 0,
      duration: 180,
      useNativeDriver: true,
    });
    transition.start();
    return () => transition.stop();
  }, [hidden, vs, pipWidth, slide]);
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    // Capture movement so a swipe cannot also trigger the resize press.
    onMoveShouldSetPanResponderCapture: (_, gesture) => {
      const moving = Math.abs(gesture.dx) + Math.abs(gesture.dy) > 8;
      if (moving) cancelTap();
      return moving;
    },
    onPanResponderRelease: (_, gesture) => {
      const rightward = gesture.dx > Math.abs(gesture.dy) * 1.2;
      if (rightward && (gesture.dx > 40 || (gesture.dx > 15 && gesture.vx > 0.5))) setHidden(true);
      interactionCallback.current?.(false);
    },
    onPanResponderTerminate: () => { cancelTap(); interactionCallback.current?.(false); },
    onPanResponderTerminationRequest: () => false,
  })).current;
  useEffect(() => () => interactionCallback.current?.(false), [party?.id, vs]);
  const Video = RtcSurfaceViewComponent;
  const mineFirst = party?.participants[0]?.channelId === channelId;
  const myScore = (mineFirst ? battle?.firstScore : battle?.secondScore) ?? 0;
  const peerScore = (mineFirst ? battle?.secondScore : battle?.firstScore) ?? 0;
  const remaining = battle?.endsAt ? Math.max(0, Math.ceil((battle.endsAt - now) / 1000)) : 0;
  const countdown = battle?.startsAt ? Math.max(0, Math.ceil((battle.startsAt - now) / 1000)) : 0;
  const winner = party?.participants.find(p => p.uid === battle?.winnerUid);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={vs ? [styles.mainVs, { top, width: width / 2, height: panelHeight }] : StyleSheet.absoluteFill} pointerEvents="none">
        {main}
        {vs ? <Text style={styles.name} numberOfLines={1}>{mainName}</Text> : null}
      </View>
      {peer ? (
        <Animated.View
          onTouchStart={() => { if (!vs) interactionCallback.current?.(true); }}
          onTouchEnd={() => interactionCallback.current?.(false)}
          onTouchCancel={() => { cancelTap(); interactionCallback.current?.(false); }}
          {...(!vs ? responder.panHandlers : {})}
          style={[styles.partner, vs
            ? { top, left: width / 2, width: width / 2, height: panelHeight, borderRadius: 0 }
            : { top: windowTop, left: width - pipWidth - 12, width: pipWidth, height: pipHeight, transform: [{ translateX: slide }] }]}
          pointerEvents={hidden && !vs ? "none" : "auto"}
          accessibilityElementsHidden={hidden && !vs}
          importantForAccessibility={hidden && !vs ? "no-hide-descendants" : "auto"}
          accessibilityLabel={t("Party partner: {v0}", { v0: peer.name })}
        >
          <Pressable style={StyleSheet.absoluteFill} disabled={vs || hidden}
            onPressIn={() => {
              longPressed.current = false;
              // A second touch may become a long press or swipe instead of a tap.
              if (pendingTap.current) clearTimeout(pendingTap.current.timer);
            }}
            onPress={pressWindow}
            onLongPress={() => { cancelTap(); longPressed.current = true; setShowPartnerInfo(true); interactionCallback.current?.(false); }}
            delayLongPress={450}
            accessibilityRole={!vs ? "button" : undefined}
            accessibilityLabel={t("{v0} {v1}'s party window", { v0: compact ? "Enlarge" : "Shrink", v1: peer.name })}
            accessibilityHint={t("{v0}Tap to change size. Swipe right to hide. Long press for user information and audio controls.", { v0: onPartnerDoubleTap ? "Double tap to switch streams. " : "" })}
            accessibilityActions={onPartnerDoubleTap ? [{ name: "switchStream", label: `Watch ${peer.name}'s stream` }] : undefined}
            onAccessibilityAction={event => { if (event.nativeEvent.actionName === "switchStream" && !vs && !hidden) { cancelTap(); onPartnerDoubleTap?.(peer.channelId); } }}>
          {Video && media.connection ? <Video
            canvas={{ uid: peer.uid, sourceType: VideoSourceType.VideoSourceRemote }}
            connection={media.connection}
            zOrderMediaOverlay
            style={StyleSheet.absoluteFill}
          /> : null}
          {!media.ready ? <View style={styles.waiting}>
            <Avatar uid={peer.uid} name={peer.name} avatarUri={peer.avatarUrl ?? undefined} size={40} />
            {media.error ? <TouchableOpacity onPress={media.retry} accessibilityLabel={t("Retry partner video")}><Text style={[localizedTextStyle(), styles.retry]}>{t("Reconnect")}</Text></TouchableOpacity> : <ActivityIndicator color="#FFF" />}
          </View> : null}
          {vs ? <Text style={styles.name} numberOfLines={1}>{peer.name}</Text> : null}
          </Pressable>
        </Animated.View>
      ) : null}
      {peer && hidden && !vs ? (
        <Pressable style={[styles.restorePartner, { top: windowTop + 10 }]}
          onPress={() => setHidden(false)} accessibilityRole="button"
          accessibilityLabel={t("Show {v0}'s party window", { v0: peer.name })}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </Pressable>
      ) : null}
      {peer && showPartnerInfo ? (
        <Modal transparent visible animationType="slide" statusBarTranslucent onRequestClose={() => setShowPartnerInfo(false)}>
          <View style={styles.infoBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowPartnerInfo(false)} accessibilityLabel={t("Close partner information")} />
            <View style={[styles.infoSheet, { paddingBottom: insets.bottom + 20 }]}>
              <View style={styles.infoHeading}>
                <Text style={[localizedTextStyle(), styles.infoTitle]}>{t("Party partner")}</Text>
                <Pressable onPress={() => setShowPartnerInfo(false)} style={styles.infoClose} accessibilityLabel={t("Close partner information")}><Ionicons name="close" size={24} color="#FFF" /></Pressable>
              </View>
              <View style={styles.infoPerson}>
                <Avatar uid={peer.uid} name={peer.name} avatarUri={peer.avatarUrl ?? undefined} size={56} />
                <View style={{ flex: 1 }}><Text style={styles.infoName}>{peer.name}</Text><Text style={[localizedTextStyle(), styles.infoDetail]}>{t("ID: {v0}", { v0: peer.uid })}</Text></View>
              </View>
              <Pressable style={styles.audioAction} onPress={() => media.setAudioMuted(!media.audioMuted)}
                accessibilityRole="button" accessibilityLabel={media.audioMuted ? t("Unmute partner audio") : t("Mute partner audio")}>
                <Ionicons name={media.audioMuted ? "volume-mute-outline" : "volume-high-outline"} size={23} color="#FFF" />
                <Text style={[localizedTextStyle(), styles.audioActionText]}>{media.audioMuted ? t("Unmute audio") : t("Mute audio")}</Text>
              </Pressable>
              <Text style={[localizedTextStyle(), styles.infoDetail]}>{t("Only changes what you hear.")}</Text>
              {media.audioError ? <Text style={styles.audioError} accessibilityRole="alert">{t(media.audioError)}</Text> : null}
            </View>
          </View>
        </Modal>
      ) : null}
      {battleActive && !vs && mine && peer ? (
        <View style={[styles.partyBattleBar, { top: insets.top + 54 }]} pointerEvents="none"
          accessible accessibilityLabel={t("{v0}: {v1} coins. {v2}: {v3} coins. {v4}", { v0: mine.name, v1: myScore.toLocaleString(appLocale()), v2: peer.name, v3: peerScore.toLocaleString(appLocale()), v4: countdown ? `Starts in ${countdown}` : `${remaining} seconds remaining` })}>
          <View style={styles.partyBattleTrack} />
          <View style={styles.partyBattleAvatarRing}>
            <Avatar uid={mine.uid} name={mine.name} avatarUri={mine.avatarUrl ?? undefined} size={32} />
          </View>
          <View style={styles.partyBattleLabels}>
            <Text style={styles.partyBattleCoins} numberOfLines={1} adjustsFontSizeToFit><Text style={styles.partyBattleCoinIcon}>🪙 </Text>{myScore.toLocaleString(appLocale())}</Text>
            <Text style={[localizedTextStyle(), styles.partyBattleClock]}>{countdown ? t("Starts {v0}", { v0: countdown }) : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}</Text>
            <Text style={[styles.partyBattleCoins, { textAlign: "right" }]} numberOfLines={1} adjustsFontSizeToFit><Text style={styles.partyBattleCoinIcon}>🪙 </Text>{peerScore.toLocaleString(appLocale())}</Text>
          </View>
          <View style={styles.partyBattleAvatarRing}>
            <Avatar uid={peer.uid} name={peer.name} avatarUri={peer.avatarUrl ?? undefined} size={32} />
          </View>
        </View>
      ) : null}
      {vs ? <View style={[styles.scoreboard, { top: top + panelHeight }]} pointerEvents="none">
        <View style={styles.scores}>
          <Text style={[styles.score, { color: "#FF4E86" }]}>{myScore.toLocaleString(appLocale())}</Text>
          <Text style={[localizedTextStyle(), styles.timer]}>{countdown ? t("Starts in {v0}", { v0: countdown }) : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}</Text>
          <Text style={[styles.score, { color: "#44D7CD" }]}>{peerScore.toLocaleString(appLocale())}</Text>
        </View>
        <View style={styles.scoreTrack}>
          <View style={{ flex: myScore + peerScore ? myScore : 1, backgroundColor: "#FF4E86" }} />
          <View style={{ flex: myScore + peerScore ? peerScore : 1, backgroundColor: "#44D7CD" }} />
        </View>
      </View> : null}
      {peer && battle?.status === "finished" && battle.endsAt && now < battle.endsAt + 10000 ? (
        <View style={[styles.result, { top: insets.top + 54 }]} pointerEvents="none"><Text style={[localizedTextStyle(), styles.resultText]}>{winner ? t("{v0} wins VS", { v0: winner.name }) : t("VS ends in a draw")}</Text></View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  partyBattleBar: { position: "absolute", left: 12, right: 12, height: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 4 },
  partyBattleTrack: { position: "absolute", left: 34, right: 34, top: 17, height: 2, backgroundColor: PARTY_BATTLE_GOLD },
  partyBattleAvatarRing: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: PARTY_BATTLE_GOLD, alignItems: "center", justifyContent: "center" },
  partyBattleLabels: { position: "absolute", left: 42, right: 42, top: -3, flexDirection: "row", alignItems: "center", gap: 6 },
  partyBattleCoins: { flex: 1, color: "#FFF", fontSize: 12, lineHeight: 16, includeFontPadding: false, fontFamily: "Inter_700Bold" },
  partyBattleCoinIcon: { fontSize: 10 },
  partyBattleClock: { lineHeight: 16, color: "#FFF", fontSize: 12, fontFamily: "Inter_700Bold", textAlign: "center", minWidth: 56, includeFontPadding: false },
  restorePartner: { position: "absolute", right: 0, width: 32, height: 88, borderTopLeftRadius: 10, borderBottomLeftRadius: 10, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", zIndex: 5 },
  infoBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  infoSheet: { backgroundColor: "#19191F", padding: 20, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  infoHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  infoTitle: { color: "#FFF", fontSize: 20, fontFamily: "Inter_700Bold" },
  infoClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  infoPerson: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16 },
  infoName: { color: "#FFF", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  infoDetail: { color: "#B6B6BF", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  audioAction: { flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#3A3A42" },
  audioActionText: { color: "#FFF", fontSize: 16, fontFamily: "Inter_500Medium" },
  audioError: { color: "#FF759A", fontSize: 13, marginTop: 12 },
  mainVs: { position: "absolute", left: 0, overflow: "hidden", backgroundColor: "#111" },
  partner: { position: "absolute", top: 0, left: 0, borderRadius: 8, overflow: "hidden", backgroundColor: "#202026", zIndex: 3 },
  waiting: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#202026" },
  name: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 8, paddingVertical: 6, color: "#FFF", backgroundColor: "rgba(0,0,0,0.55)", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  retry: { color: "#FFF", fontSize: 12, fontFamily: "Inter_500Medium", padding: 8 },
  scoreboard: { position: "absolute", left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.8)", padding: 10 },
  scores: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  score: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  timer: { color: "#FFF", fontSize: 14, fontFamily: "Inter_600SemiBold", minWidth: 84, textAlign: "center" },
  scoreTrack: { flexDirection: "row", height: 4, marginTop: 8 },
  result: { position: "absolute", left: 16, right: 16, alignItems: "center", padding: 8, backgroundColor: "rgba(0,0,0,0.8)" },
  resultText: { color: "#FFD700", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
