import React, { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { isReactionEmoji } from "@/utils/reactionEmoji";
import { useStreamSocket } from "@/hooks/useStreamSocket";
import { t } from "@/i18n";

type Particle = { id: number; emoji: string; drift: number };

function Floater({ particle, reduced, done }: { particle: Particle; reduced: boolean; done: (id: number) => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(progress, { toValue: 1, duration: reduced ? 650 : 1900, easing: Easing.out(Easing.quad), useNativeDriver: true });
    animation.start(({ finished }) => { if (finished) done(particle.id); });
    return () => animation.stop();
  }, [progress, particle.id, reduced, done]);
  return <Animated.Text style={[styles.particle, {
    opacity: progress.interpolate({ inputRange: [0, 0.65, 1], outputRange: [1, 1, 0] }),
    transform: [{ translateY: reduced ? -50 : progress.interpolate({ inputRange: [0, 1], outputRange: [-35, -280] }) },
      { translateX: reduced ? 0 : progress.interpolate({ inputRange: [0, 1], outputRange: [0, particle.drift] }) }],
  }]}>{particle.emoji}</Animated.Text>;
}

/** Owns its rendering so rapid tapping does not rerender live video or chat. */
export function LiveReactions({ channelId, canSend = false, selectedEmoji = "❤️" }: { channelId: string; canSend?: boolean; selectedEmoji?: string }) {
  const selected = isReactionEmoji(selectedEmoji) ? selectedEmoji : "❤️";
  const [ready, setReady] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [reduced, setReduced] = useState(false);
  const nextId = useRef(0);
  const pending = useRef<{ emoji: string; count: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const done = useCallback((id: number) => setParticles(previous => previous.filter(p => p.id !== id)), []);
  const spawn = useCallback((emoji: string, count: number) => {
    if (!isReactionEmoji(emoji) || !Number.isInteger(count) || count < 1 || count > 8) return;
    const additions = Array.from({ length: count }, () => ({ id: ++nextId.current, emoji, drift: -Math.random() * 100 + 15 }));
    setParticles(previous => [...previous, ...additions].slice(-36));
  }, []);
  const resetConnection = () => { setReady(false); pending.current = null; clearTimeout(timer.current); timer.current = undefined; };
  const send = useStreamSocket({ channelId, enabled: true, subscriptionType: "subscribe_reactions",
    onConnect: resetConnection,
    onDisconnect: resetConnection,
    onMessage: event => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.type === "reactions_ready") setReady(true);
        if (msg.type === "subscription_denied") setReady(false);
        if (msg.type === "reaction") spawn(msg.emoji, msg.count);
      } catch { /* Ignore invalid events. */ }
    },
  });
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); });
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { active = false; listener.remove(); clearTimeout(timer.current); pending.current = null; };
  }, []);
  const tap = (emoji: string) => {
    if (!ready) return;
    spawn(emoji, 1);
    if (pending.current?.emoji === emoji) pending.current.count = Math.min(8, pending.current.count + 1);
    else pending.current = { emoji, count: 1 };
    if (!timer.current) timer.current = setTimeout(() => {
      const batch = pending.current;
      timer.current = undefined;
      pending.current = null;
      if (batch) send({ type: "reaction", ...batch });
    }, 220);
  };
  return <View style={[styles.root, canSend && { height: 48 }]} pointerEvents="box-none">
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {particles.map(p => <Floater key={p.id} particle={p} reduced={reduced} done={done} />)}
    </View>
    {canSend ? <Pressable style={[styles.tap, !ready && { opacity: 0.45 }]} disabled={!ready} accessibilityRole="button" accessibilityState={{ disabled: !ready }} accessibilityLabel={t("Send reaction {v0}", { v0: selected })} onPress={() => tap(selected)}>
      <View style={styles.tapFace}><Text style={styles.emoji}>{selected}</Text></View>
    </Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({
  root: { width: 48, height: 88, alignItems: "center" },
  tap: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  tapFace: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.32)", alignItems: "center", justifyContent: "center" },
  emoji: { fontSize: 22 },
  particle: { position: "absolute", right: 8, top: 0, fontSize: 30 },
});
