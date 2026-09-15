import React, { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePurchases } from '@/context/PurchasesContext';
import { useColors } from '@/hooks/useColors';
import { useAppLanguage } from '@/i18n';
import { useAuth } from '@clerk/expo';

// Ordinary store screen opened from Settings; never shown automatically as a
// paywall. Benefits come from the configured product description, not guesses.
export default function SubscriptionsScreen() {
  const purchases = usePurchases();
  const { userId } = useAuth();
  const colors = useColors();
  const { t, localizedTextStyle, appLocale } = useAppLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notice, setNotice] = useState<{ userId: string; text: string } | null>(null);
  const offering = purchases.offerings?.all.pulse_pro ?? purchases.offerings?.current;
  const plans = (offering?.availablePackages ?? []).filter(pkg => ['monthly', 'yearly', 'lifetime'].includes(pkg.product.identifier));
  const entitlement = purchases.customerInfo?.entitlements.active.pulse_pro;
  const expires = entitlement?.expirationDate ? new Date(entitlement.expirationDate).toLocaleDateString(appLocale()) : null;
  const action = (label: string, onPress: () => void, disabled: boolean) => <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} onPress={onPress} disabled={disabled} style={[styles.action, { borderColor: colors.border, opacity: disabled ? 0.5 : 1 }]}><Text style={[styles.text, localizedTextStyle(), { color: colors.foreground }]}>{t(label)}</Text></TouchableOpacity>;
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <View style={[styles.header, { paddingTop: (Platform.OS === 'web' ? 24 : insets.top) + 12, borderColor: colors.border }]}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('Back')} onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={20} color={colors.foreground} /></TouchableOpacity>
      <Text style={[styles.title, { color: colors.foreground }]}>Pulse Pro</Text><View style={styles.back} />
    </View>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <Text style={[styles.text, localizedTextStyle(), { color: colors.foreground }]}>{purchases.isPro ? t('Pulse Pro is active.') : t('Subscriptions unlock special features.')}</Text>
      {!!expires && <Text style={[styles.text, localizedTextStyle(), { color: colors.mutedForeground }]}>{entitlement?.willRenew ? t('Renews on {v0}', { v0: expires }) : t('Access until {v0}', { v0: expires })}</Text>}
      {purchases.testStore && <Text style={[styles.text, localizedTextStyle(), { color: colors.mutedForeground }]}>{t('Test purchases — no real payment.')}</Text>}
      {!userId && action('Sign in', () => router.push('/(auth)/sign-in'), false)}
      {!!userId && !purchases.ready && !purchases.error && <ActivityIndicator color={colors.primary} />}
      {!!purchases.error && <Text accessibilityRole="alert" style={[styles.text, localizedTextStyle(), { color: colors.destructive }]}>{t(purchases.error)}</Text>}
      {purchases.ready && plans.length === 0 && <Text style={[styles.text, localizedTextStyle(), { color: colors.mutedForeground }]}>{t('Subscription plans are not available yet.')}</Text>}
      {plans.map(pkg => <View key={pkg.identifier} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>{pkg.product.title}</Text>
        <Text style={[styles.text, { color: colors.mutedForeground }]}>{pkg.product.description}</Text>
        <Text style={[styles.text, localizedTextStyle(), { color: colors.foreground }]}>{pkg.product.identifier === 'monthly' ? t('{v0} / month', { v0: pkg.product.priceString }) : pkg.product.identifier === 'yearly' ? t('{v0} / year', { v0: pkg.product.priceString }) : t('{v0} once', { v0: pkg.product.priceString })}</Text>
        {action('Buy', () => {
          setNotice(null);
          void purchases.purchase(pkg).then(result => {
            if (result.result === 'purchased' && userId) setNotice({ userId, text: 'Purchase completed. Your access status is shown above.' });
          });
        }, purchases.busy || !purchases.ready || purchases.isPro)}
      </View>)}
      {notice?.userId === userId && <Text accessibilityLiveRegion="polite" style={[styles.text, localizedTextStyle(), { color: colors.foreground }]}>{t(notice?.text ?? '')}</Text>}
      {action('Refresh', () => { void purchases.refresh(); }, purchases.busy || !userId)}
      {action('Restore purchases', () => { void purchases.restore(); }, purchases.busy || !purchases.ready)}
      {action('Manage purchases', () => { void purchases.manage(); }, purchases.busy || !purchases.ready)}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  back: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 21, fontFamily: 'Inter_700Bold' },
  content: { padding: 20, gap: 16 }, text: { fontSize: 15, lineHeight: 22 }, card: { padding: 20, borderRadius: 16, borderWidth: 1, gap: 12 },
  action: { padding: 16, borderWidth: 1, borderRadius: 14, alignItems: 'center' },
});
