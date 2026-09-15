import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth as useClerkAuth } from '@clerk/expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getGetCoinBalanceQueryKey, useGetCoinBalance } from '@workspace/api-client-react';
import { useAuth } from '@/context/AuthContext';
import { usePurchases } from '@/context/PurchasesContext';
import { coinPackages } from '@/lib/revenuecat-session';
import { useColors } from '@/hooks/useColors';
import { useAppLanguage } from '@/i18n';

type Catalog = { enabled: boolean; environment: string; products: { productId: string; coins: number }[] };
type Fulfillment = { status: 'credited' | 'pending'; coins: number; balance: number };

export function CoinStoreContent({ onClose, sheet = false }: { onClose?: () => void; sheet?: boolean }) {
  const colors = useColors();
  const { t, appNumber, localizedTextStyle } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { userId, getToken } = useClerkAuth();
  const purchases = usePurchases();
  const queryClient = useQueryClient();
  const accountMatches = !!userId && user?.clerkId === userId;
  const [pending, setPending] = useState<{ userId: string; transactionId: string } | null>(null);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const [notice, setNotice] = useState('');
  const [starting, setStarting] = useState(false);
  const startLock = useRef(false);
  const transactionId = pending && pending.userId === userId ? pending.transactionId : undefined;
  const storageKey = `@pulse_pending_coin_purchase:${userId}`;

  async function api<T>(path: string): Promise<T> {
    const token = await getToken();
    if (!token) throw new Error('Authentication required');
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    const response = await fetch(`${domain ? `https://${domain}` : ''}/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('Purchase information unavailable');
    return response.json();
  }
  const catalog = useQuery({ queryKey: ['coin-products', userId], queryFn: () => api<Catalog>('/purchases/coin-products'), enabled: accountMatches, staleTime: 30_000 });
  const balance = useGetCoinBalance({ uid: user?.uid ?? 0 }, { query: { queryKey: getGetCoinBalanceQueryKey({ uid: user?.uid ?? 0 }), enabled: accountMatches } });
  const fulfillment = useQuery({ queryKey: ['coin-fulfillment', userId, transactionId],
    queryFn: () => api<Fulfillment>(`/purchases/coin-transactions/${encodeURIComponent(transactionId!)}`), enabled: accountMatches && !!transactionId,
    refetchInterval: query => query.state.data?.status === 'credited' ? false : 3000,
  });

  useEffect(() => {
    let active = true;
    setPending(null);
    setNotice('');
    if (userId) void AsyncStorage.getItem(storageKey).then(value => {
      if (active && value) setPending({ userId, transactionId: value });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [userId, storageKey]);
  useEffect(() => {
    if (fulfillment.data?.status !== 'credited' || !accountMatches || !user || !transactionId) return;
    void queryClient.invalidateQueries({ queryKey: getGetCoinBalanceQueryKey({ uid: user.uid }) });
    setNotice('Coins added to your wallet.');
    setPending(null);
    void AsyncStorage.removeItem(storageKey).catch(() => undefined);
  }, [fulfillment.data, accountMatches, user, transactionId, queryClient, storageKey]);
  useFocusEffect(React.useCallback(() => {
    if (accountMatches) {
      void catalog.refetch();
      void balance.refetch();
      void purchases.refresh();
    }
  // Refresh once per focus/account, not each SDK customer-info notification.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, accountMatches]));

  const coinsByProduct = Object.fromEntries((catalog.data?.products ?? []).map(p => [p.productId, p.coins]));
  const offering = purchases.offerings?.all.coins ?? purchases.offerings?.current;
  const packs = coinPackages(offering?.availablePackages ?? [], coinsByProduct);
  const configured = catalog.data?.enabled && catalog.data.environment === (purchases.testStore ? 'SANDBOX' : 'PRODUCTION');
  const disabled = !accountMatches || !purchases.ready || purchases.busy || starting || !!transactionId || !configured;
  const busy = purchases.busy || starting;
  const buy = async (pack: typeof packs[number]) => {
    if (disabled || !userId || startLock.current) return;
    startLock.current = true;
    setStarting(true);
    setNotice('');
    try {
      // Refresh the server catalog before checkout. The server alone determines
      // coins; RevenueCat's store product alone determines the charged price.
      const latest = await catalog.refetch();
      if (currentUser.current !== userId) return;
      if (latest.isError || !latest.data?.enabled || latest.data.environment !== catalog.data?.environment ||
        !latest.data.products.some(p => p.productId === pack.pkg.product.identifier && p.coins === pack.coins)) {
        setNotice('Coin packs have changed. Please refresh and choose again.');
        return;
      }
      const result = await purchases.purchase(pack.pkg);
      if (currentUser.current !== userId) return;
      if (result.result === 'purchased' && result.transactionId) {
        setPending({ userId, transactionId: result.transactionId });
        await AsyncStorage.setItem(storageKey, result.transactionId).catch(() => undefined);
        void balance.refetch();
      }
    } finally { startLock.current = false; setStarting(false); }
  };

  const button = (label: string, onPress: () => void, disabled = false) => <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.action, { borderColor: colors.border, opacity: disabled ? 0.5 : 1 }]}><Text style={[styles.actionText, localizedTextStyle(), { color: colors.foreground }]}>{t(label)}</Text></TouchableOpacity>;
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <View style={[styles.header, { paddingTop: sheet ? 12 : (Platform.OS === 'web' ? 24 : insets.top) + 12, borderColor: colors.border }]}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('Back')} onPress={() => onClose ? onClose() : router.back()} style={[styles.back, { borderColor: colors.border }]}><Ionicons name="chevron-back" size={20} color={colors.foreground} /></TouchableOpacity>
      <Text style={[styles.title, localizedTextStyle(), { color: colors.foreground }]}>{t('Buy Coins')}</Text><View style={styles.back} />
    </View>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <Text style={[styles.label, localizedTextStyle(), { color: colors.mutedForeground }]}>{t('Coin balance')}</Text>
      <Text style={[styles.balance, { color: '#FFD700' }]}>{accountMatches ? appNumber(balance.data?.balance ?? 0) : '—'}</Text>
      {purchases.testStore && <Text style={[styles.copy, localizedTextStyle(), { color: colors.mutedForeground }]}>{t('Test purchases — no real payment.')}</Text>}
      {!accountMatches && button('Sign in', () => router.push('/(auth)/sign-in'))}
      {(catalog.isLoading || (accountMatches && !purchases.ready && !purchases.error)) && <ActivityIndicator color={colors.primary} />}
      {!!purchases.error && <Text accessibilityRole="alert" style={[styles.copy, localizedTextStyle(), { color: colors.destructive }]}>{t(purchases.error)}</Text>}
      {catalog.isError && <Text accessibilityRole="alert" style={[styles.copy, localizedTextStyle(), { color: colors.destructive }]}>{t('Could not load coin packs. Please try again.')}</Text>}
      {accountMatches && !catalog.isLoading && (!configured || (purchases.ready && packs.length === 0)) && <Text style={[styles.copy, localizedTextStyle(), { color: colors.mutedForeground }]}>{t('Coin packs are not available yet.')}</Text>}
      {packs.map(pack => <TouchableOpacity key={pack.pkg.identifier} accessibilityRole="button" accessibilityLabel={t('{v0} coins for {v1}', { v0: appNumber(pack.coins), v1: pack.price })} accessibilityState={{ disabled: !!disabled, busy }} disabled={!!disabled} onPress={() => { void buy(pack); }} style={[styles.pack, { backgroundColor: colors.card, borderColor: colors.border, opacity: disabled ? 0.5 : 1 }]}>
        <View style={styles.packAmount}><Ionicons name="ellipse" size={24} color="#FFD700" /><Text style={[styles.packCoins, localizedTextStyle(), { color: colors.foreground }]}>{t('{v0} coins', { v0: appNumber(pack.coins) })}</Text></View>
        <Text style={[styles.price, { color: colors.primary }]}>{pack.price}</Text>
      </TouchableOpacity>)}
      {!!transactionId && <Text accessibilityLiveRegion="polite" style={[styles.copy, localizedTextStyle(), { color: colors.mutedForeground }]}>{t('Payment received. Waiting for your coins to be confirmed. You do not need to buy again.')}</Text>}
      {fulfillment.isError && <Text style={[styles.copy, localizedTextStyle(), { color: colors.destructive }]}>{t('Could not check your purchase yet. We will keep trying.')}</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={[styles.copy, localizedTextStyle(), { color: colors.foreground }]}>{t(notice)}</Text>}
      {button('Refresh', () => { void purchases.refresh(); void catalog.refetch(); void balance.refetch(); }, busy || !accountMatches)}
      {button('Restore purchases', () => { void purchases.restore(); }, busy || !purchases.ready)}
      <Text style={[styles.copy, localizedTextStyle(), { color: colors.mutedForeground }]}>{t('Restore recovers subscriptions and lifetime access. Your coin balance is saved in your Pulse account.')}</Text>
      {button('Manage purchases', () => { void purchases.manage(); }, busy || !purchases.ready)}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  back: { width: 38, height: 38, borderRadius: 19, borderWidth: 0, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 21, fontFamily: 'Inter_700Bold' }, content: { padding: 20, gap: 16 }, label: { fontSize: 14, textAlign: 'center' },
  balance: { fontSize: 36, fontFamily: 'Inter_700Bold', textAlign: 'center' }, copy: { fontSize: 14, lineHeight: 21 },
  pack: { borderWidth: 1, borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  packAmount: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }, packCoins: { fontSize: 18, fontFamily: 'Inter_600SemiBold', flexShrink: 1 },
  price: { fontSize: 17, fontFamily: 'Inter_700Bold' }, action: { borderWidth: 1, borderRadius: 14, padding: 16, alignItems: 'center' }, actionText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
