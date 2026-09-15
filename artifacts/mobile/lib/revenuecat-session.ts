import type Purchases from 'react-native-purchases';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import { PRO_ENTITLEMENT } from './revenuecat-config';

type SDK = Pick<typeof Purchases, 'configure' | 'isConfigured' | 'getAppUserID' | 'logIn' | 'logOut' | 'isAnonymous' | 'getCustomerInfo' | 'getOfferings' | 'purchasePackage' | 'restorePurchases' | 'invalidateCustomerInfoCache'>;

export function hasPulsePro(info: CustomerInfo | null): boolean {
  return info?.entitlements.active[PRO_ENTITLEMENT]?.isActive === true;
}

export function purchaseErrorMessage(error: unknown): string {
  const e = error as { code?: string; userCancelled?: boolean } | null;
  if (e?.userCancelled || String(e?.code) === '1') return '';
  if (String(e?.code) === '20') return 'Payment is pending approval. Coins will arrive after payment is confirmed.';
  if (String(e?.code) === '10') return 'Could not connect to the store. Please try again.';
  if (String(e?.code) === '6') return 'This product is already owned. Try restoring purchases.';
  return 'Purchases could not be completed. Please try again.';
}

// One queue for identity changes and store operations. Account changes invalidate
// in-flight results immediately, before the queued native logIn/logOut completes.
export class RevenueCatSession {
  private queue: Promise<unknown> = Promise.resolve();
  private userId: string | null = null;
  private revision = 0;
  constructor(private sdk: SDK, private apiKey: string) {}

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => undefined);
    return result;
  }

  identify(userId: string | null): Promise<CustomerInfo | null> {
    this.userId = userId;
    const revision = ++this.revision;
    return this.enqueue(async () => {
      if (revision !== this.revision) return null;
      if (!userId) {
        if (await this.sdk.isConfigured() && !await this.sdk.isAnonymous()) await this.sdk.logOut();
        return null;
      }
      if (!await this.sdk.isConfigured()) this.sdk.configure({ apiKey: this.apiKey, appUserID: userId });
      else if (await this.sdk.getAppUserID() !== userId) await this.sdk.logIn(userId);
      const info = await this.sdk.getCustomerInfo();
      return revision === this.revision ? info : null;
    });
  }

  run<T>(userId: string, operation: (sdk: SDK) => Promise<T>): Promise<T> {
    const revision = this.revision;
    const assertIdentity = () => {
      if (this.userId !== userId || revision !== this.revision) throw new Error('Purchase account changed.');
    };
    return this.enqueue(async () => {
      assertIdentity();
      if (!await this.sdk.isConfigured() || await this.sdk.getAppUserID() !== userId) throw new Error('Purchases are not ready.');
      assertIdentity();
      const result = await operation(this.sdk);
      assertIdentity();
      return result;
    });
  }
}

export function coinPackages(packages: PurchasesPackage[], coinsByProduct: Record<string, number>) {
  return packages.flatMap(pkg => {
    const coins = coinsByProduct[pkg.product.identifier];
    return Number.isSafeInteger(coins) && coins > 0 && !pkg.product.subscriptionPeriod
      ? [{ pkg, coins, price: pkg.product.priceString }]
      : [];
  }).sort((a, b) => a.coins - b.coins);
}
