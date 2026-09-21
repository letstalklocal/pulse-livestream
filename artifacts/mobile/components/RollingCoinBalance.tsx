import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet } from 'react-native';
import { useAppLanguage } from '@/i18n';

type Credit = { id: string; balance: number; coins: number };

// Display-only feedback: the server remains authoritative for wallet amounts.
export function RollingCoinBalance({ balance, credit }: { balance: number | undefined; credit?: Credit }) {
  const { appNumber } = useAppLanguage();
  const [displayed, setDisplayed] = useState(balance ?? 0);
  const [reduceMotion, setReduceMotion] = useState(true);
  const count = useRef(new Animated.Value(balance ?? 0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const lastCredit = useRef<string | null>(null);
  const running = useRef(false);
  const latestBalance = useRef(balance);
  latestBalance.current = balance;

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!credit) return;
    if (lastCredit.current === credit.id) {
      // Changing accessibility settings interrupts the animation: settle at the
      // authoritative amount instead of leaving an intermediate frame visible.
      setDisplayed(latestBalance.current ?? credit.balance);
      scale.setValue(1);
      return;
    }
    lastCredit.current = credit.id;
    if (reduceMotion) { setDisplayed(credit.balance); return; }
    running.current = true;
    // Animate the confirmed pack increment, including purchases recovered on reopen.
    const from = Math.max(0, credit.balance - credit.coins);
    setDisplayed(from);
    count.setValue(from);
    scale.setValue(1);
    const listener = count.addListener(({ value }) => setDisplayed(Math.round(value)));
    const animation = Animated.sequence([
      Animated.timing(count, { toValue: credit.balance, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(scale, { toValue: 1.12, duration: 180, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => {
      running.current = false;
      if (finished) setDisplayed(latestBalance.current ?? credit.balance);
    });
    return () => { animation.stop(); count.removeListener(listener); scale.setValue(1); running.current = false; };
  }, [credit, reduceMotion, count, scale]);

  useEffect(() => {
    if (!running.current && balance !== undefined) setDisplayed(balance);
  }, [balance]);

  return <Animated.Text accessibilityLabel={appNumber(balance ?? credit?.balance ?? 0)} style={[styles.balance, { transform: [{ scale }] }]}>{appNumber(displayed)}</Animated.Text>;
}
const styles = StyleSheet.create({
  balance: { fontSize: 23, fontFamily: 'Inter_700Bold', color: '#FFD54A', fontVariant: ['tabular-nums'] },
});
