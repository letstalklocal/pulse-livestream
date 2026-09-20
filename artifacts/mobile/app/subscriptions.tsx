import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
  const activeProduct = purchases.isPro && entitlement?.isActive ? entitlement.productIdentifier : null;
  const expires = entitlement?.expirationDate ? new Date(entitlement.expirationDate).toLocaleDateString(appLocale()) : null;
  const openManagement = () => {
    Alert.alert(t('Manage purchases'), undefined, [
      { text: t('Manage subscription'), onPress: () => { void purchases.manageSubscription(); } },
      { text: t('Restore purchases'), onPress: () => { void purchases.restore(); } },
      ...(Platform.OS === 'ios' && !purchases.testStore && entitlement?.store === 'APP_STORE' ? [{
        text: t('Request refund'), onPress: () => {
          setNotice(null);
          void purchases.requestRefund().then(submitted => {
            if (submitted && userId) setNotice({ userId, text: 'Refund request submitted. Apple will review your request.' });
          });
        },
      }] : []),
      { text: t('Close'), style: 'cancel' as const },
    ]);
  };
  const action = (label: string, onPress: () => void, disabled: boolean, primary = false) => <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} hitSlop={primary ? { top: 7, bottom: 7, left: 0, right: 0 } : undefined} onPress={onPress} disabled={disabled} style={[styles.action, primary && styles.primaryAction, { borderColor: primary ? '#B78B35' : colors.border, opacity: disabled ? 0.5 : 1 }]}><Text style={[styles.text, localizedTextStyle(), { color: primary ? '#211806' : colors.foreground, fontFamily: 'Inter_600SemiBold', ...(primary ? { fontSize: 13, lineHeight: 18 } : {}) }]}>{t(label)}</Text></TouchableOpacity>;
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <View style={[styles.header, { paddingTop: (Platform.OS === 'web' ? 24 : insets.top) + 12, borderColor: colors.border }]}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('Back')} onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={20} color={colors.foreground} /></TouchableOpacity>
      <Text style={[styles.title, { color: colors.foreground }]}>Pulse VIP</Text><View style={styles.back} />
    </View>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <LinearGradient colors={['#292315', '#171614', '#111214']} style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.emblem}><Ionicons name="diamond" size={35} color="#E6BF69" /></View>
        <Text style={styles.heroTitle}>Pulse <Text style={styles.gold}>VIP</Text></Text>
        {purchases.isPro && <View style={styles.activeBadge}><Ionicons name="checkmark-circle" size={16} color="#E6BF69" /><Text style={[styles.activeText, localizedTextStyle()]}>{t('Pulse VIP is active.')}</Text></View>}
        <Text style={[styles.heroDescription, localizedTextStyle()]}>{t("Pulse VIP unlocks other users' followers and following lists.")}</Text>
        {!!expires && <Text style={[styles.expiry, localizedTextStyle()]}>{entitlement?.willRenew ? t('Renews on {v0}', { v0: expires }) : t('Access until {v0}', { v0: expires })}</Text>}
      </LinearGradient>
      {purchases.testStore && <Text style={[styles.text, localizedTextStyle(), { color: colors.mutedForeground }]}>{t('Test purchases — no real payment.')}</Text>}
      {!userId && action('Sign in', () => router.push('/(auth)/sign-in'), false)}
      {!!userId && !purchases.ready && !purchases.error && <ActivityIndicator color={colors.primary} />}
      {!!purchases.error && <Text accessibilityRole="alert" style={[styles.text, localizedTextStyle(), { color: colors.destructive }]}>{t(purchases.error)}</Text>}
      {purchases.ready && plans.length === 0 && <Text style={[styles.text, localizedTextStyle(), { color: colors.mutedForeground }]}>{t('Subscription plans are not available yet.')}</Text>}
      <View style={styles.planList}>
        {plans.map(pkg => <View key={pkg.identifier} style={[styles.card, { backgroundColor: colors.card, borderColor: activeProduct === pkg.product.identifier ? '#C9A24D' : colors.border }]}>
          <View style={styles.planHeading}>
            <View style={styles.planText}>
              <Text style={[styles.planTitle, { color: colors.foreground }]}>{pkg.product.title}</Text>
            </View>
          </View>
          <View style={[styles.priceSection, { borderColor: colors.border }]}>
            <Text style={[styles.price, localizedTextStyle(), { color: colors.foreground }]}>{pkg.product.priceString}{'\n'}<Text style={styles.period}>{pkg.product.identifier === 'monthly' ? t('Month') : pkg.product.identifier === 'yearly' ? t('Year') : t('Once')}</Text></Text>
          </View>
          {activeProduct === pkg.product.identifier ? <View accessibilityLiveRegion="polite" style={[styles.action, styles.primaryAction, styles.currentPlan]}><Text style={[styles.currentPlanText, localizedTextStyle()]}>{t('Active')}</Text></View> : action('Buy', () => {
            setNotice(null);
            void purchases.purchase(pkg).then(result => {
              if (result.result === 'purchased' && userId) setNotice({ userId, text: 'Purchase completed. Your access status is shown above.' });
            });
          }, purchases.busy || !purchases.ready || purchases.isPro, true)}
        </View>)}
      </View>
      {notice?.userId === userId && <Text accessibilityLiveRegion="polite" style={[styles.text, localizedTextStyle(), { color: colors.foreground }]}>{t(notice?.text ?? '')}</Text>}
      <View style={[styles.utilities, { borderColor: colors.border }]}>
        {action('Manage purchases', openManagement, purchases.busy || !purchases.ready)}
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: purchases.busy || !userId }} disabled={purchases.busy || !userId} onPress={() => { void purchases.refresh(); }} style={[styles.refresh, { opacity: purchases.busy || !userId ? 0.5 : 1 }]}>
          <Ionicons name="refresh" size={16} color={colors.mutedForeground} />
          <Text style={[styles.text, localizedTextStyle(), { color: colors.mutedForeground }]}>{t('Refresh')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  content: { padding: 16, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center' },
  text: { fontSize: 15, lineHeight: 22 },
  hero: { padding: 18, borderRadius: 22, alignItems: 'center', gap: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#665333' },
  heroGlow: { position: 'absolute', top: -100, width: 260, height: 220, borderRadius: 130, backgroundColor: '#E6BF69', opacity: 0.05 },
  emblem: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6BF6914', borderWidth: 1, borderColor: '#E6BF6940' },
  heroTitle: { fontSize: 28, lineHeight: 34, fontFamily: 'Inter_700Bold', color: '#FFFFFF', textAlign: 'center' },
  gold: { color: '#E6BF69' },
  heroDescription: { fontSize: 14, lineHeight: 21, color: '#D9D5CB', textAlign: 'center', maxWidth: 360 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: '#E6BF6914', maxWidth: '100%' },
  activeText: { color: '#E6BF69', fontSize: 14, fontFamily: 'Inter_600SemiBold', flexShrink: 1 },
  expiry: { color: '#C8BFAF', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  planList: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  card: { flex: 1, minWidth: 0, paddingHorizontal: 8, paddingVertical: 14, borderRadius: 16, borderWidth: 1, gap: 12 },
  planHeading: { alignItems: 'center', gap: 10 },
  planText: { width: '100%' },
  planTitle: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  priceSection: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, justifyContent: 'center' },
  price: { fontSize: 16, lineHeight: 24, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  action: { minHeight: 48, padding: 14, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  currentPlan: { borderColor: '#C9A24D', backgroundColor: '#C9A24D20' },
  currentPlanText: { color: '#C9A24D', fontSize: 13, lineHeight: 18, fontFamily: 'Inter_600SemiBold' },
  period: { fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  primaryAction: { backgroundColor: '#C9A24D', minHeight: 30, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 9, alignSelf: 'stretch' },
  utilities: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, gap: 8 },
  refresh: { minHeight: 48, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
});
