import { useAuth } from '@clerk/expo';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, NativeModules, Platform } from 'react-native';
import type { CustomerInfo, PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';
import { purchaseConfiguration } from '@/lib/revenuecat-config';
import { hasPulsePro, purchaseErrorMessage, RevenueCatSession } from '@/lib/revenuecat-session';

const config = purchaseConfiguration(Platform.OS, __DEV__, {
  mode: process.env.EXPO_PUBLIC_REVENUECAT_MODE,
  iosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  androidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});
let nativeSession: RevenueCatSession | undefined;
function getSession() {
  if (!config.apiKey || !NativeModules.RNPurchases) return undefined;
  if (!nativeSession) {
    const { default: Purchases, LOG_LEVEL } = require('react-native-purchases') as typeof import('react-native-purchases');
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
    nativeSession = new RevenueCatSession(Purchases, config.apiKey);
  }
  return nativeSession;
}

type PurchaseResult = 'purchased' | 'cancelled' | 'failed';
interface PurchaseState {
  ready: boolean; busy: boolean; error: string; customerInfo: CustomerInfo | null;
  offerings: PurchasesOfferings | null; isPro: boolean; testStore: boolean;
  refresh: () => Promise<void>;
  purchase: (pkg: PurchasesPackage) => Promise<{ result: PurchaseResult; transactionId?: string }>;
  restore: () => Promise<void>;
  manage: () => Promise<void>;
}
const Context = createContext<PurchaseState | null>(null);

export function PurchasesProvider({ children }: { children: React.ReactNode }) {
  const { userId, isLoaded } = useAuth();
  const [state, setState] = useState<{ userId: string | null; ready: boolean; info: CustomerInfo | null; offerings: PurchasesOfferings | null; error: string }>({ userId: null, ready: false, info: null, offerings: null, error: '' });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const initializedUser = useRef<string | null>(null);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const session = getSession();
  const current = state.userId === userId;
  const ready = current && state.ready && !!userId;

  const refresh = useCallback(async () => {
    if (!session || !userId) return;
    try {
      // Fetch account info separately so a catalog failure cannot hide an entitlement.
      const info = initializedUser.current === userId
        ? await session.run(userId, sdk => sdk.getCustomerInfo())
        : await session.identify(userId);
      if (!info) return;
      initializedUser.current = userId;
      if (currentUser.current !== userId) return;
      setState(s => ({ ...s, userId, info, ready: true, error: '' }));
      const offerings = await session.run(userId, sdk => sdk.getOfferings());
      if (currentUser.current === userId) setState(s => ({ ...s, offerings }));
    } catch (error) {
      if (currentUser.current === userId) setState(s => ({ ...s, error: purchaseErrorMessage(error) }));
    }
  }, [session, userId]);

  useEffect(() => {
    if (!isLoaded) return;
    let active = true;
    initializedUser.current = null;
    setState({ userId: userId ?? null, ready: false, info: null, offerings: null, error: '' });
    if (!session) return;
    void session.identify(userId ?? null).then(async info => {
      if (!active || !userId || !info) return;
      initializedUser.current = userId;
      setState({ userId, ready: true, info, offerings: null, error: '' });
      await refresh();
    }).catch(error => {
      if (active) setState(s => ({ ...s, error: purchaseErrorMessage(error) }));
    });
    // Re-fetch through the serialized session instead of trusting listener data
    // that may belong to the account that just logged out.
    const Purchases = (require('react-native-purchases') as typeof import('react-native-purchases')).default;
    const listener = () => { if (active && userId) void refresh(); };
    Purchases.addCustomerInfoUpdateListener(listener);
    const appState = AppState.addEventListener('change', state => { if (state === 'active') listener(); });
    return () => { active = false; Purchases.removeCustomerInfoUpdateListener(listener); appState.remove(); };
  }, [isLoaded, userId, session, refresh]);

  const execute = async <T,>(operation: (session: RevenueCatSession, id: string) => Promise<T>): Promise<T | undefined> => {
    if (!session || !ready || !userId || busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    setState(s => ({ ...s, error: '' }));
    try { return await operation(session, userId); }
    catch (error) {
      if (currentUser.current === userId) setState(s => ({ ...s, error: purchaseErrorMessage(error) }));
      throw error;
    } finally { busyRef.current = false; setBusy(false); }
  };

  const purchase: PurchaseState['purchase'] = async pkg => {
    try {
      const result = await execute(async (session, id) => {
        const result = await session.run(id, sdk => sdk.purchasePackage(pkg));
        if (currentUser.current === id) setState(s => ({ ...s, info: result.customerInfo }));
        return result;
      });
      return result ? { result: 'purchased', transactionId: result.transaction.transactionIdentifier } : { result: 'failed' };
    } catch (error) { return { result: purchaseErrorMessage(error) ? 'failed' : 'cancelled' }; }
  };
  const restore = async () => {
    try {
      await execute(async (session, id) => {
        const info = await session.run(id, sdk => sdk.restorePurchases());
        if (currentUser.current === id) setState(s => ({ ...s, info }));
      });
    } catch { /* Error is shown by the screen. */ }
  };
  const manage = async () => {
    try {
      await execute(async (session, id) => {
        await session.run(id, async sdk => {
          const { default: RevenueCatUI } = require('react-native-purchases-ui') as typeof import('react-native-purchases-ui');
          await RevenueCatUI.presentCustomerCenter();
          await sdk.invalidateCustomerInfoCache();
        });
        await refresh();
      });
    } catch { /* Error is shown by the screen. */ }
  };

  const unavailable = Platform.OS === 'web'
    ? 'Open Pulse on iPhone or Android to make purchases.'
    : !NativeModules.RNPurchases
      ? 'Purchases need a newer app build.'
      : !config.apiKey ? 'Purchases are not available in this build.' : '';
  return <Context.Provider value={{ ready, busy, error: unavailable || (current ? state.error : ''),
    customerInfo: current ? state.info : null, offerings: current ? state.offerings : null,
    isPro: current && hasPulsePro(state.info), testStore: config.testStore, refresh, purchase, restore, manage }}>{children}</Context.Provider>;
}

export function usePurchases() {
  const value = useContext(Context);
  if (!value) throw new Error('usePurchases must be used inside PurchasesProvider');
  return value;
}
