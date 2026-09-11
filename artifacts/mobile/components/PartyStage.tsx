import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LiveParty } from "@workspace/api-client-react";
import { RtcSurfaceViewComponent, VideoSourceType } from "@/utils/agora";
import { Avatar } from "./Avatar";
import { battleUsesSplitLayout, partyLayout } from "@/utils/partyLayout";

const PARTY_BATTLE_GOLD = "#E8BD59";

export function PartyStage({ main, mainName, channelId, party, now, media, onDragActive }: {
  main: React.ReactNode; mainName: string; channelId: string; party: LiveParty | null; now: number;
  media: { connection: { channelId: string; localUid: number } | null; ready: boolean; error: string | null; retry: () => void };
  onDragActive?: (active: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const peer = party?.status === "active" ? party.participants.find(p => p.channelId !== channelId) : undefined;
  const battle = party?.battle;
  const battleActive = !!peer && battle?.status === "active" && !!battle.endsAt && now < battle.endsAt;
  const vs = battleUsesSplitLayout(battleActive);
  const mine = party?.participants.find(p => p.channelId === channelId);
  const pipWidth = Math.min(128, Math.max(104, width * 0.32));
  const pipHeight = pipWidth * 4 / 3;
  const { top, panelHeight } = partyLayout(width, height, insets.top, insets.bottom);
  const maxX = Math.max(12, width - pipWidth - 12);
  const maxY = Math.max(top, height - insets.bottom - 280 - pipHeight);
  const point = useRef(new Animated.ValueXY({ x: maxX, y: top })).current;
  const origin = useRef({ x: maxX, y: top });
  const bounds = useRef({ maxX, maxY, top });
  const dragCallback = useRef(onDragActive);
  dragCallback.current = onDragActive;
  bounds.current = { maxX, maxY, top };
  useEffect(() => {
    origin.current = { x: maxX, y: top };
    point.setValue(origin.current);
  }, [party?.id, maxX, top, point]);
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 5,
    onPanResponderMove: (_, gesture) => {
      const b = bounds.current;
      point.setValue({ x: Math.max(12, Math.min(b.maxX, origin.current.x + gesture.dx)), y: Math.max(b.top, Math.min(b.maxY, origin.current.y + gesture.dy)) });
    },
    onPanResponderRelease: (_, gesture) => {
      const b = bounds.current;
      origin.current = { x: Math.max(12, Math.min(b.maxX, origin.current.x + gesture.dx)), y: Math.max(b.top, Math.min(b.maxY, origin.current.y + gesture.dy)) };
      point.setValue(origin.current);
      dragCallback.current?.(false);
    },
    onPanResponderTerminate: () => { point.setValue(origin.current); dragCallback.current?.(false); },
    onPanResponderTerminationRequest: () => false,
  })).current;
  useEffect(() => () => dragCallback.current?.(false), [party?.id, vs]);
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
          onTouchStart={() => { if (!vs) dragCallback.current?.(true); }}
          onTouchEnd={() => dragCallback.current?.(false)}
          onTouchCancel={() => dragCallback.current?.(false)}
          {...(!vs ? responder.panHandlers : {})}
          style={[styles.partner, vs
            ? { top, left: width / 2, width: width / 2, height: panelHeight, borderRadius: 0 }
            : { width: pipWidth, height: pipHeight, transform: point.getTranslateTransform() }]}
          accessibilityLabel={`Party partner: ${peer.name}`}
        >
          {Video && media.connection ? <Video
            canvas={{ uid: peer.uid, sourceType: VideoSourceType.VideoSourceRemote }}
            connection={media.connection}
            zOrderMediaOverlay
            style={StyleSheet.absoluteFill}
          /> : null}
          {!media.ready ? <View style={styles.waiting}>
            <Avatar uid={peer.uid} name={peer.name} avatarUri={peer.avatarUrl ?? undefined} size={40} />
            {media.error ? <TouchableOpacity onPress={media.retry} accessibilityLabel="Retry partner video"><Text style={styles.retry}>Reconnect</Text></TouchableOpacity> : <ActivityIndicator color="#FFF" />}
          </View> : null}
          <Text style={styles.name} numberOfLines={1}>{peer.name}</Text>
        </Animated.View>
      ) : null}
      {battleActive && !vs && mine && peer ? (
        <View style={[styles.partyBattleBar, { top: insets.top + 54 }]} pointerEvents="none"
          accessible accessibilityLabel={`${mine.name}: ${myScore.toLocaleString()} coins. ${peer.name}: ${peerScore.toLocaleString()} coins. ${countdown ? `Starts in ${countdown}` : `${remaining} seconds remaining`}`}>
          <View style={styles.partyBattleTrack} />
          <View style={styles.partyBattleAvatarRing}>
            <Avatar uid={mine.uid} name={mine.name} avatarUri={mine.avatarUrl ?? undefined} size={32} />
          </View>
          <View style={styles.partyBattleLabels}>
            <Text style={styles.partyBattleCoins} numberOfLines={1} adjustsFontSizeToFit><Text style={styles.partyBattleCoinIcon}>🪙 </Text>{myScore.toLocaleString()}</Text>
            <Text style={styles.partyBattleClock}>{countdown ? `Starts ${countdown}` : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}</Text>
            <Text style={[styles.partyBattleCoins, { textAlign: "right" }]} numberOfLines={1} adjustsFontSizeToFit><Text style={styles.partyBattleCoinIcon}>🪙 </Text>{peerScore.toLocaleString()}</Text>
          </View>
          <View style={styles.partyBattleAvatarRing}>
            <Avatar uid={peer.uid} name={peer.name} avatarUri={peer.avatarUrl ?? undefined} size={32} />
          </View>
        </View>
      ) : null}
      {vs ? <View style={[styles.scoreboard, { top: top + panelHeight }]} pointerEvents="none">
        <View style={styles.scores}>
          <Text style={[styles.score, { color: "#FF4E86" }]}>{myScore.toLocaleString()}</Text>
          <Text style={styles.timer}>{countdown ? `Starts in ${countdown}` : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}</Text>
          <Text style={[styles.score, { color: "#44D7CD" }]}>{peerScore.toLocaleString()}</Text>
        </View>
        <View style={styles.scoreTrack}>
          <View style={{ flex: myScore + peerScore ? myScore : 1, backgroundColor: "#FF4E86" }} />
          <View style={{ flex: myScore + peerScore ? peerScore : 1, backgroundColor: "#44D7CD" }} />
        </View>
      </View> : null}
      {peer && battle?.status === "finished" && battle.endsAt && now < battle.endsAt + 10000 ? (
        <View style={[styles.result, { top: insets.top + 54 }]} pointerEvents="none"><Text style={styles.resultText}>{winner ? `${winner.name} wins VS` : "VS ends in a draw"}</Text></View>
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
