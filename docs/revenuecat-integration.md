# RevenueCat integration for Pulse

Updated: 2026-09-15. Read [the purchase decisions](coin-purchases.md) before changing this flow.

## Current scope and status

- React Native SDK and UI SDK **10.9.1** installed. The UI SDK is used for Customer Center only. No RevenueCat paywall or automatic purchase prompt is implemented.
- Account-header and profile coin balances and Settings → Buy coins open the coin store. Zero balances display the coin icon plus Buy Coins. The ordinary gift drawer opens the same content in its modal sheet without navigating away from the live/chat. Settings → Pulse Pro opens the separate subscription screen.
- **Nine coin packages at launch**: 250, 500, 1,000, 2,000, 6,000, 8,000, 10,000, 12,000 and 14,000 coins. Their confirmed USD prices, in that order, are $1.99, $3.99, $7.99, $14.99, $44.99, $59.99, $74.99, $89.99 and $99.99. The existing `consumable` is a sample, not the final nine-pack catalog.
- Subscription plans unlock special features. Their actual benefits and corresponding server feature gates are not yet defined. `pulse_pro` does not change verification, mature-content preference, gifts, or Premium live admission.
- **No website checkout, web purchase links, or web-buy prompts in the initial build.** Website payments are a later phase and will share the Pulse wallet.
- SDK logic and sandbox webhook fulfillment are implemented. The nine-product default catalog, development app allowlist and webhook authorization are configured; the sandbox pipeline has passed real RevenueCat Test Store webhook delivery tests. Production coin fulfillment is deliberately disabled pending refund/reconciliation work and real-store QA.
- RevenueCat API v2 access was verified (HTTP 200). Project `proj2b054d16` is Pulse. Its Test Store is `app0722e3199f`. No Apple/Google production apps were present in the inspected project.
- Existing sample/special-feature products: `consumable`, `monthly`, `yearly`, `lifetime`. The nine approved `coins_<amount>_v1` consumables are now also configured in the Test Store and attached to the separate `coins` offering. Entitlement `pulse_pro` already correctly includes monthly/yearly/lifetime only. The current `default` offering already has Monthly, Yearly, Lifetime and a custom consumable package. Those existing objects were inspected, not created by this integration.

**App Store Connect checkpoint (user-reported, 2026-09-15):** All nine consumables were saved and reopened with the approved IDs and US prices for `com.chimba.livestream`. Each is Prepare for Submission. Genuine review screenshots and sales-country availability remain pending; availability was left unset. No review/release submission was made. See [the full checkpoint](coin-purchases.md#app-store-connect-checkpoint--2026-09-15).

## 1. Install the packages

For an npm-managed React Native application:

```sh
npm install --save react-native-purchases react-native-purchases-ui
```

Pulse is a pnpm monorepo with `workspace:*` dependencies and a root preinstall guard against npm. The equivalent installation was performed without changing the repository's package manager:

```sh
pnpm --filter @workspace/mobile add react-native-purchases react-native-purchases-ui
```

Both packages are auto-linked into the next native build. Expo Go and an older installed build without the modules cannot exercise these native purchases. Pulse shows a clear unavailable message instead of crashing the whole app. The next Apple/TestFlight build is still on hold; no EAS build or store submission was started.

References: [React Native installation](https://www.revenuecat.com/docs/getting-started/installation/reactnative), [Expo installation](https://www.revenuecat.com/docs/getting-started/installation/expo).

## 2. Configure SDK and server keys

| Setting | Purpose |
| --- | --- |
| `RC_API_KEY` | The public Test Store SDK key the user stored in Replit. The supplied same public key is already wired into `lib/revenuecat-config.ts` for native development. |
| `EXPO_PUBLIC_REVENUECAT_MODE=test` | Explicit Test Store selection for an internal preview build; native development defaults to test mode. |
| `EXPO_PUBLIC_REVENUECAT_MODE=store` | Real platform-store selection. |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | Public `appl_` SDK key for a future Apple app. |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | Public `goog_` SDK key for a future Google app. |
| `REVENUECAT_API_V2_SECRET_KEY` | Server/workspace-only project management key; never bundled in the mobile app. |
| `REVENUECAT_WEBHOOK_AUTH` | Separate server secret, e.g. `Bearer <random-token>`, matching the complete Authorization header entered in RevenueCat's webhook configuration. Not an SDK/API key. |
| `REVENUECAT_APP_IDS` | Comma-separated RevenueCat app allowlist; for the current test setup, `app0722e3199f`. |
| `REVENUECAT_ENVIRONMENT` | `SANDBOX` for this initial implementation. Sandbox is rejected in production runtime. |
| `REVENUECAT_COIN_PRODUCTS` | Optional JSON override. Defaults to the nine approved immutable coin mappings in `src/config/coin-products.json`. Explicit invalid or empty configuration disables purchases. |

Do not change to a live key merely to test: the one supplied `test_` key works on both iOS and Android with Test Store. The Expo config rejects explicit Test Store mode in the EAS production profile. Production-mode app bundles default to platform keys and disable purchases if the correct public key is absent.

References: [Test Store](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store), [API v2 authentication](https://www.revenuecat.com/docs/api-v2).

## 3. Configure products and offerings

Completed: **nine consumable products** in the Test Store, one per confirmed pack and approved USD price. Use stable IDs such as `coins_<amount>_v1`. Prices belong to the products in RevenueCat/store configuration. The client cannot submit an arbitrary charge price.

Completed: offering `coins` (`ofrng03b8bc924d`) contains nine custom packages, each attached to its consumable product. **No paywall is required.** The app prioritizes the `coins` offering and otherwise filters the current offering using the server-approved coin product IDs. The amount shown comes from the server catalog; `priceString` comes from RevenueCat's localized store product.

Example override syntax (normally use the complete checked-in nine-pack catalog):

```json
[{ "productId": "coins_250_v1", "coins": 250 }]
```

The API defaults to all nine approved products. Set `REVENUECAT_COIN_PRODUCTS` only when an explicit catalog override is needed. Do not change the number of coins granted by an already-sold identifier: create a new product ID so delayed notifications cannot credit a different amount.

For the already-existing special-feature products:

| Product | Type | Entitlement | Package |
| --- | --- | --- | --- |
| `monthly` | Monthly auto-renewing subscription | `pulse_pro` | `$rc_monthly` |
| `yearly` | Yearly auto-renewing subscription | `pulse_pro` | `$rc_annual` |
| `lifetime` | Non-consumable, one-time purchase | `pulse_pro` | `$rc_lifetime` |
| Each of nine coin products | Consumable | **None** | Custom package per pack |

The subscription screen uses the `pulse_pro` offering if present, otherwise the current offering, and displays the requested monthly/yearly/lifetime identifiers. Configure product descriptions to explain the actual agreed benefits before enabling live sales. Subscription upgrades/downgrades are handled through Manage purchases; the app does not sell another plan while an entitlement is active.

Reference: [Offerings](https://www.revenuecat.com/docs/offerings/overview).

## 4. Identity, customer info and entitlement code

Complete implementation files:

- `artifacts/mobile/lib/revenuecat-config.ts`: public key selection and entitlement constant.
- `artifacts/mobile/lib/revenuecat-session.ts`: serialized identity/purchase operations, stale-account rejection, errors and coin-pack filtering.
- `artifacts/mobile/context/PurchasesContext.tsx`: one SDK instance, Clerk identity, customer-info listener, foreground refresh, purchase, restore, Customer Center.
- `artifacts/mobile/components/CoinStoreContent.tsx`: shared purchase content and pending credit recovery, used by `app/coin-store.tsx` and the gift drawer.
- `artifacts/mobile/app/subscriptions.tsx`: complete special-feature subscription screen.

The provider is mounted beneath Clerk. It configures Purchases with the stable Clerk user ID, never a display name or email. It clears exposed access immediately when the account changes. SDK login/logout and purchases are serialized so a late purchase response cannot grant the next signed-in account access.

Use the provided hook in a React Native screen:

```tsx
import React from 'react';
import { Text, View, Button } from 'react-native';
import { usePurchases } from '@/context/PurchasesContext';

export function SubscriptionStatus() {
  const { ready, busy, error, customerInfo, isPro, refresh, restore, manage } = usePurchases();
  return (
    <View>
      <Text>{isPro ? 'Pulse Pro active' : 'Pulse Pro inactive'}</Text>
      <Text>{customerInfo?.entitlements.active.pulse_pro?.expirationDate ?? ''}</Text>
      {!!error && <Text accessibilityRole="alert">{error}</Text>}
      <Button title="Refresh" onPress={() => void refresh()} disabled={busy} />
      <Button title="Restore purchases" onPress={() => void restore()} disabled={!ready || busy} />
      <Button title="Manage purchases" onPress={() => void manage()} disabled={!ready || busy} />
    </View>
  );
}
```

The check is `customerInfo.entitlements.active.pulse_pro?.isActive === true`. Cancellation of renewal does not immediately remove still-valid access. The UI shows renewal or access-end dates using the active entitlement. Do not persist a client-controlled `isPro` boolean as proof of payment. Protected backend features will require server-validated entitlement enforcement when their scope is defined.

Reference: [Customer info and subscription status](https://www.revenuecat.com/docs/customers/customer-info).

## 5. Purchase and error handling

The existing screen passes a selected RevenueCat package to `purchasePackage`; it does not pass a client-entered amount or price. A minimal hook consumer:

```tsx
import React from 'react';
import { Button, View, Text } from 'react-native';
import { usePurchases } from '@/context/PurchasesContext';

export function MonthlyPurchase() {
  const { ready, busy, offerings, purchase, error } = usePurchases();
  const offering = offerings?.all.pulse_pro ?? offerings?.current;
  const monthly = offering?.availablePackages.find(p => p.product.identifier === 'monthly');
  if (!monthly) return <Text>No monthly product is configured.</Text>;
  return (
    <View>
      <Button title={monthly.product.priceString} disabled={!ready || busy}
        onPress={() => { void purchase(monthly); }} />
      {!!error && <Text accessibilityRole="alert">{error}</Text>}
    </View>
  );
}
```

The provider returns `purchased`, `cancelled` or `failed` and a store transaction ID after success. It suppresses cancellation errors, distinguishes pending payment and network failures, and prevents rapid duplicate store operations. Pending approval is not treated as a paid purchase. The coin screen prevents another checkout while a completed purchase awaits wallet confirmation; it remembers that transaction across app restarts.

## 6. Coin fulfillment webhook

Sandbox webhook `whintgrdc2cdf5bb3` is configured to the current development host using this route:

```text
https://<development-api-host>/api/purchases/revenuecat/webhook
```

Set its Authorization header to match the complete `REVENUECAT_WEBHOOK_AUTH` server value. Enable sandbox purchase delivery for the Test Store. Never expose that header in mobile code.

`NON_RENEWING_PURCHASE` events for allowlisted app/store/environment/product IDs credit the Clerk-linked account. The server ignores client amounts/prices and uses the configured coin amount. A hashed store transaction identity, PostgreSQL transaction/advisory lock and existing unique ledger index ensure duplicates cannot credit twice. Wrong-account retries are rejected. Unknown users and failed credits return non-2xx for retry. Subscription/lifetime purchases do not grant coins.

The authenticated app calls:

- `GET /api/purchases/coin-products` for configured coin amounts and readiness.
- `GET /api/purchases/coin-transactions/:transactionId` for its own fulfillment status/current balance.

These endpoints cannot credit coins. Only a verified webhook does. The sandbox configuration is now present; missing or invalid configuration still disables checkout. No database migration is needed: purchases use the existing wallet ledger with `type=purchase`, so they do not count as creator gift earnings.

**Before production:** implement refund/debt handling, transaction reconciliation/alerts and operational recovery; verify store-specific quantities and transaction IDs; complete real Apple/Google sandbox tests and production isolation. Production coin fulfillment remains blocked in code until those checks are deliberately completed. Test Store is simulated payment, not proof of live store billing.

Reference: [Webhook setup](https://www.revenuecat.com/docs/integrations/webhooks), [event types](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields).

## 7. Customer Center and restoration

Manage purchases calls `RevenueCatUI.presentCustomerCenter()`, invalidates cached customer info after dismissal, and refreshes access. Configure Customer Center in RevenueCat for the subscription-support paths you want. Store-native cancellation/refund paths require the corresponding store configuration and device tests; the Test Store is not evidence that Apple/Google management works.

Restore is user-initiated and calls `restorePurchases()`. It restores eligible subscriptions and lifetime access, not a consumable coin balance. Pulse retrieves its wallet from its own server. Review RevenueCat's restore/transfer behavior before release so a store account shared by multiple Pulse accounts cannot unintentionally transfer access.

References: [React Native Customer Center](https://www.revenuecat.com/docs/tools/customer-center/customer-center-react-native), [restoration](https://www.revenuecat.com/docs/getting-started/restoring-purchases).

## 8. Verification and remaining setup

Commands:

```sh
node --test artifacts/mobile/tests/revenuecat.test.cjs
node artifacts/api-server/tests/purchases.integration.mjs
node artifacts/api-server/tests/localization.test.mjs
pnpm --filter @workspace/mobile run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build
```

Purchase tests cover the default nine-pack catalog, account switching mid-operation, stale results, recovery after SDK errors, key selection, local prices, entitlement checks, webhook authentication/environment/ownership, concurrent duplicate delivery and server-authoritative amounts. HTTP/database tests use temporary fixtures and simulated RevenueCat events; they do not simulate successful real payment as release proof.

Device checks still required: nine localized prices/amounts, successful/failed/cancelled/pending purchases, repeated taps, closing/reopening after payment, correct wallet credit, logout/account switch, subscription activation/expiry/restore, Customer Center and Android app-switch payment return. A native rebuild is required, but remains on hold per the user's build plan. No visual/device validation has been claimed.

### Verified sandbox checkpoint

See [the complete evidence](coin-purchases.md#revenuecat-sandbox-verification--2026-09-15). Nine actual Test Store purchases delivered RevenueCat webhooks to the running API and credited 53,750 coins in nine transactions for an isolated QA account. This is sandbox API/webhook evidence; it does not exercise native StoreKit, Android billing, or visual layout.

The ignored `artifacts/api-server/.local/revenuecat.env` supplies development-only webhook authorization, environment and app allowlist. `src/index.ts` loads it only with `NODE_ENV=development`, with explicit environment values taking precedence. Replit Secrets should hold the corresponding deployment settings when production is ready. Production remains disabled.

Test Store price creation uses the official API endpoint `POST /projects/{project_id}/products/{product_id}/test_store_prices`, with USD `amount_micros`; price verification uses `GET .../prices`. Reference: [RevenueCat's official API client](https://github.com/RevenueCat/cli/blob/main/internal/api/products.go).
