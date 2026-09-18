import { t, useAppLanguage, localizedTextStyle, appLocale } from "@/i18n";
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, AppState, Easing, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LiveParty } from "@workspace/api-client-react";
import { RtcSurfaceViewComponent, RtcTextureViewComponent, VideoSourceType } from "@/utils/agora";
import { battleMotionFrame } from "../utils/battleMotion";
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
  // Android SurfaceView draws on a separate surface, bypassing rounded clipping.
  const useTextureVideo = Platform.OS === "android" && !vs;
  const Video = useTextureVideo ? RtcTextureViewComponent : RtcSurfaceViewComponent;
  const mineFirst = party?.participants[0]?.channelId === channelId;
  const myScore = (mineFirst ? battle?.firstScore : battle?.secondScore) ?? 0;
  const peerScore = (mineFirst ? battle?.secondScore : battle?.firstScore) ?? 0;
  const myScorePercent = myScore + peerScore ? Math.max(5, Math.min(95, myScore / (myScore + peerScore) * 100)) : 50;
  const bothScored = myScore > 0 && peerScore > 0;
  const scoredTie = bothScored && myScore === peerScore;
  const leading = myScore === peerScore ? null : myScore > peerScore ? "mine" : "peer";
  const fadeColors = (side: "mine" | "peer") => side === "mine"
    ? [PARTY_BATTLE_GOLD, "rgba(255,255,255,0.9)", "rgba(255,255,255,0)"] as const
    : ["rgba(255,255,255,0)", "rgba(255,255,255,0.9)", PARTY_BATTLE_GOLD] as const;
  const fadeLocations = (side: "mine" | "peer") => side === "mine" ? [0, 0.55, 1] as const : [0, 0.45, 1] as const;
  const flow = useRef(new Animated.Value(-28)).current;
  const flowOpacity = useRef(new Animated.Value(0)).current;
  const [pushSide, setPushSide] = useState<"mine" | "peer">("mine");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReducedMotion(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    const app = AppState.addEventListener("change", state => setForeground(state === "active"));
    return () => { mounted = false; motion.remove(); app.remove(); };
  }, []);
  const displayedPercent = useRef(new Animated.Value(myScorePercent)).current;
  const mineStrength = useRef(new Animated.Value(leading === "mine" ? 1 : 0)).current;
  const peerStrength = useRef(new Animated.Value(leading === "peer" ? 1 : 0)).current;
  const tieStrength = useRef(new Animated.Value(scoredTie ? 1 : 0)).current;
  const previousBar = useRef({ battleId: battle?.id, channelId, myScore, peerScore });
  const trackWidth = Math.max(0, width - 92);
  const animateFlow = battleActive && !vs && !reducedMotion && foreground;
  useEffect(() => {
    const previous = previousBar.current;
    const reset = previous.battleId !== battle?.id || previous.channelId !== channelId;
    const changed = previous.myScore !== myScore || previous.peerScore !== peerScore;
    previousBar.current = { battleId: battle?.id, channelId, myScore, peerScore };
    const targets = [[displayedPercent, myScorePercent], [mineStrength, leading === "mine" ? 1 : 0], [peerStrength, leading === "peer" ? 1 : 0], [tieStrength, scoredTie ? 1 : 0]] as const;
    flowOpacity.setValue(0);
    if (reset || !changed || !animateFlow) {
      targets.forEach(([value, target]) => value.setValue(target));
      return;
    }
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    let removeMotionListener: (() => void) | undefined;
    // Capture the current visual boundary, including an interrupted push.
    displayedPercent.stopAnimation(currentPercent => {
      if (!active) return;
      const side = myScorePercent === currentPercent
        ? (myScore - previous.myScore >= peerScore - previous.peerScore ? "mine" : "peer")
        : myScorePercent > currentPercent ? "mine" : "peer";
      setPushSide(side);
      const motion = new Animated.Value(0);
      // Capture strengths too, so a new score can blend from an interrupted result.
      const strengths = [[mineStrength, leading === "mine" ? 1 : 0], [peerStrength, leading === "peer" ? 1 : 0], [tieStrength, scoredTie ? 1 : 0]] as const;
      const starts = [0, 0, 0];
      strengths.forEach(([value], index) => value.stopAnimation(current => { starts[index] = current; }));
      const applyFrame = (progress: number) => {
        if (!active) return;
        const frame = battleMotionFrame(currentPercent, myScorePercent, trackWidth, side, progress);
        displayedPercent.setValue(frame.percent);
        flow.setValue(frame.flowX);
        flowOpacity.setValue(frame.flowOpacity);
        strengths.forEach(([value, target], index) => value.setValue(starts[index] + (target - starts[index]) * frame.merge));
      };
      applyFrame(0);
      const listener = motion.addListener(({ value }) => applyFrame(value));
      removeMotionListener = () => motion.removeListener(listener);
      animation = Animated.timing(motion, {
        toValue: 1, duration: 1050, easing: Easing.inOut(Easing.cubic), useNativeDriver: false, isInteraction: false,
      });
      animation.start(result => { removeMotionListener?.(); if (result.finished) applyFrame(1); });
    });
    return () => { active = false; animation?.stop(); removeMotionListener?.(); flowOpacity.setValue(0); };
  }, [battle?.id, channelId, myScore, peerScore, myScorePercent, leading, scoredTie, animateFlow, trackWidth, displayedPercent, mineStrength, peerStrength, tieStrength, flow, flowOpacity]);
  const mineWidth = displayedPercent.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });
  const peerWidth = displayedPercent.interpolate({ inputRange: [0, 100], outputRange: ["100%", "0%"] });
  const remaining = battle?.endsAt ? Math.max(0, Math.ceil((battle.endsAt - now) / 1000)) : 0;
  const countdown = battle?.startsAt ? Math.max(0, Math.ceil((battle.startsAt - now) / 1000)) : 0;
  const clockOpacity = useRef(new Animated.Value(1)).current;
  const urgent = battleActive && countdown === 0 && remaining > 0 && remaining <= 10;
  useEffect(() => {
    clockOpacity.setValue(1);
    if (!urgent || reducedMotion || !foreground) return;
    const animation = Animated.sequence([
      Animated.timing(clockOpacity, { toValue: 0.3, duration: 500, useNativeDriver: true, isInteraction: false }),
      Animated.timing(clockOpacity, { toValue: 1, duration: 500, useNativeDriver: true, isInteraction: false }),
    ]);
    animation.start();
    return () => { animation.stop(); clockOpacity.setValue(1); };
  }, [urgent, remaining, reducedMotion, foreground, battle?.id, clockOpacity]);
  const winner = party?.participants.find(p => p.uid === battle?.winnerUid);
  const showResult = !!peer && battle?.status === "finished" && !!battle.endsAt && now >= battle.endsAt && now < battle.endsAt + 10000;
  const winnerScale = useRef(new Animated.Value(1)).current;
  const lastWinnerPop = useRef<string | null>(null);
  const resultKey = showResult && winner ? `${battle?.id}:${winner.uid}` : null;
  useEffect(() => {
    const fresh = resultKey !== null && lastWinnerPop.current !== resultKey;
    lastWinnerPop.current = resultKey;
    winnerScale.setValue(1);
    if (!fresh || reducedMotion || !foreground) return;
    winnerScale.setValue(0.35);
    const animation = Animated.sequence([
      Animated.timing(winnerScale, { toValue: 1.6, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false }),
      Animated.timing(winnerScale, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.cubic), useNativeDriver: true, isInteraction: false }),
    ]);
    animation.start();
    return () => { animation.stop(); winnerScale.setValue(1); };
  }, [resultKey, reducedMotion, foreground, winnerScale]);
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
            {...(!useTextureVideo ? { zOrderMediaOverlay: true } : {})}
            style={StyleSheet.absoluteFill}
          /> : null}
          {!media.ready ? <View style={styles.waiting}>
            <Avatar uid={peer.uid} name={peer.name} avatarUri={peer.avatarUrl ?? undefined} size={40} />
            {media.error ? <TouchableOpacity onPress={media.retry} accessibilityLabel={t("Retry partner video")}><Text style={[localizedTextStyle(), styles.retry]}>{t("Reconnect")}</Text></TouchableOpacity> : <ActivityIndicator color="#FFF" />}
          </View> : null}
          {vs ? <Text style={styles.name} numberOfLines={1}>{peer.name}</Text> : null}
          </Pressable>
          {!vs ? <View pointerEvents="none" style={styles.partnerBorder} /> : null}
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
          <View style={styles.partyBattleTrack}>
            <Animated.View testID="battle-score-mine" style={[styles.partyBattleSegment, { width: mineWidth, opacity: bothScored || myScore > peerScore ? 1 : 0.25, backgroundColor: !bothScored && myScore > peerScore ? "transparent" : PARTY_BATTLE_GOLD }]} />
            <Animated.View testID="battle-score-peer" style={[styles.partyBattleSegment, { width: peerWidth, opacity: bothScored || peerScore > myScore ? 1 : 0.25, backgroundColor: !bothScored && peerScore > myScore ? "transparent" : PARTY_BATTLE_GOLD }]} />
            {(["mine", "peer"] as const).map(side => <Animated.View key={side} style={[styles.partyBattleLeading,
              { opacity: side === "mine" ? mineStrength : peerStrength }, side === "mine"
              ? { left: 0, width: mineWidth }
              : { right: 0, width: peerWidth }]}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: PARTY_BATTLE_GOLD }, side === "mine" ? { right: 28 } : { left: 28 }]} />
              <LinearGradient testID={side === leading ? "battle-score-tip" : undefined} colors={fadeColors(side)} locations={fadeLocations(side)}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[styles.partyBattleTip, side === "mine" ? { right: 0 } : { left: 0 }]} />

            </Animated.View>)}
            <Animated.View testID="battle-score-tie" style={{ position: "absolute", left: mineWidth, marginLeft: -28, width: 56, height: "100%", opacity: tieStrength }}>
              <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.9)", "rgba(255,255,255,0)"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
            {animateFlow ? <Animated.View testID="battle-score-flow" style={[styles.partyBattleFlow, {
              opacity: flowOpacity, transform: [{ translateX: flow }],
            }]}>
              <LinearGradient colors={fadeColors(pushSide)} locations={fadeLocations(pushSide)}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            </Animated.View> : null}
          </View>
          {battle?.simulated ? <Text style={[localizedTextStyle(), styles.simulationLabel]}>{t("Test battle")}</Text> : null}
          <View style={styles.partyBattleAvatarRing}>
            <Avatar uid={mine.uid} name={mine.name} avatarUri={mine.avatarUrl ?? undefined} size={32} />
          </View>
          <View style={styles.partyBattleLabels}>
            <Text style={styles.partyBattleCoins} numberOfLines={1} adjustsFontSizeToFit><Text style={styles.partyBattleCoinIcon}>🪙 </Text>{myScore.toLocaleString(appLocale())}</Text>
            <Animated.View testID="battle-countdown" style={[{ opacity: clockOpacity }, urgent && styles.urgentClockPill]}><Text style={[localizedTextStyle(), styles.partyBattleClock]}>{countdown ? t("Starts {v0}", { v0: countdown }) : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}</Text></Animated.View>
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
          <Animated.View testID="battle-countdown" style={[{ opacity: clockOpacity }, urgent && styles.urgentClockPill]}><Text style={[localizedTextStyle(), styles.timer]}>{countdown ? t("Starts in {v0}", { v0: countdown }) : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}</Text></Animated.View>
          <Text style={[styles.score, { color: "#44D7CD" }]}>{peerScore.toLocaleString(appLocale())}</Text>
        </View>
        <View style={styles.scoreTrack}>
          <View style={{ flex: myScore + peerScore ? myScore : 1, backgroundColor: "#FF4E86" }} />
          <View style={{ flex: myScore + peerScore ? peerScore : 1, backgroundColor: "#44D7CD" }} />
        </View>
      </View> : null}
      {showResult ? (
        <View testID="battle-result" style={styles.result} pointerEvents="none" accessible
          accessibilityLabel={winner ? t("{v0} wins VS", { v0: winner.name }) : t("VS ends in a draw")}>
          {winner ? <>
            <Animated.View testID="battle-winner-avatar" style={[styles.winnerAvatarRing, {
              transform: [{ scale: winnerScale }],
              opacity: winnerScale.interpolate({ inputRange: [0.35, 0.8], outputRange: [0, 1], extrapolate: "clamp" }),
            }]}><Avatar uid={winner.uid} name={winner.name} avatarUri={winner.avatarUrl ?? undefined} size={96} /></Animated.View>
            <Text style={[localizedTextStyle(), styles.winnerTitle]}>{t("Winner")}</Text>
            <Text style={[styles.resultText, styles.winnerName]} numberOfLines={1}>{winner.name}</Text>
          </> : <Text style={[localizedTextStyle(), styles.resultText]}>{t("VS ends in a draw")}</Text>}
          {battle?.simulated ? <Text style={[localizedTextStyle(), styles.resultText]}>{t("Test battle")}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  partyBattleBar: { position: "absolute", left: 12, right: 12, height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 4 },
  simulationLabel: { position: "absolute", top: 32, left: 42, right: 42, textAlign: "center", color: PARTY_BATTLE_GOLD, fontSize: 10 },
  partyBattleTrack: { position: "absolute", left: 34, right: 34, top: 23, height: 6, flexDirection: "row", overflow: "hidden" },
  partyBattleSegment: { height: "100%", backgroundColor: PARTY_BATTLE_GOLD },
  partyBattleLeading: { position: "absolute", top: 0, height: "100%", overflow: "hidden" },
  partyBattleTip: { position: "absolute", top: 0, width: 28, height: "100%" },
  partyBattleFlow: { position: "absolute", left: 0, top: 0, width: 28, height: "100%" },
  partyBattleAvatarRing: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: PARTY_BATTLE_GOLD, alignItems: "center", justifyContent: "center" },
  partyBattleLabels: { position: "absolute", left: 42, right: 42, top: -3, height: 16, flexDirection: "row", alignItems: "center", gap: 6 },
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
  partner: { position: "absolute", top: 0, left: 0, borderRadius: 5, overflow: "hidden", backgroundColor: "#202026", zIndex: 3 },
  partnerBorder: { ...StyleSheet.absoluteFill, borderRadius: 5, borderWidth: 1, borderColor: "rgba(0,0,0,0.25)" },
  waiting: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#202026" },
  name: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 8, paddingVertical: 6, color: "#FFF", backgroundColor: "rgba(0,0,0,0.55)", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  retry: { color: "#FFF", fontSize: 12, fontFamily: "Inter_500Medium", padding: 8 },
  scoreboard: { position: "absolute", left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.8)", padding: 10 },
  scores: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  score: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  timer: { color: "#FFF", fontSize: 14, fontFamily: "Inter_600SemiBold", minWidth: 84, textAlign: "center" },
  scoreTrack: { flexDirection: "row", height: 4, marginTop: 8 },
  urgentClockPill: { backgroundColor: "#FF1966", borderRadius: 8, paddingHorizontal: 6 },
  result: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", padding: 24, gap: 8, zIndex: 6 },
  winnerAvatarRing: { width: 108, height: 108, borderRadius: 54, borderWidth: 3, borderColor: PARTY_BATTLE_GOLD, alignItems: "center", justifyContent: "center", backgroundColor: "#19191F", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 10 },
  winnerName: { color: "#FFFFFF", textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  winnerTitle: { color: "#FFFFFF", fontSize: 30, fontFamily: "Inter_700Bold", textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  resultText: { color: "#FFD700", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
