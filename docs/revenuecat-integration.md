# RevenueCat integration for Pulse

## Android Test Store webhook routing restored — September 21, 2026

User reported Android pending coin confirmation. Readback confirmed the only webhook pointed all sandbox apps at production. Created development integration `whintgr66ceccfa2b` (Pulse development Test Store), sandbox/all events, app filter `app0722e3199f`, current Replit dev API webhook URL, existing validated development Authorization. Scoped existing production integration `whintgrdc2cdf5bb3` to Apple app `app1937357464`; its URL/environment/auth remain unchanged. Readback verified both routes; authenticated no-purchase TEST against development returned 200. This keeps Apple sandbox -> production and RevenueCat Test Store -> development. No native build required.

Pending recovery: user identifies one.espana account and says 2,000 coins. Recent provider history for local Javilo profile (uid 61079) instead shows an owned 250-coin Test Store transaction on September 21 at 03:05:53.147 UTC, absent from local ledger. Its September 15 2,000-coin transaction already has one credit. Asked user to confirm Android profile before recovering the mismatched amount. No new coin credit was made during routing repair. New provider-originated development delivery remains unverified.

## Provider-originated retry confirmed — September 21, 2026

User relayed the other Codex's RevenueCat dashboard verification: event `bf9707d5-fb1d-4794-9f82-93be11e10ee6` was retried successfully, Sent, attempt 4 of 6, September 21 at 04:51:37 UTC, HTTP 200 with `{"received":true}`. Authorization was unchanged after the correction. This confirms a provider-originated retry reached and was acknowledged by production; it is distinct from our earlier manual recovery. It does not yet establish that a new purchase succeeds automatically on its first delivery.

Duplicate credit remains unverified on production. Check the production coin ledger for Apple sandbox transaction `2000001239337842`: exactly one purchase credit of 250 coins for that transaction, despite manual recovery plus provider retry. HTTP 200 alone does not distinguish first credit from idempotent duplicate acknowledgement. Existing automated idempotency tests passed, but production ledger evidence is still required. No additional purchase or wallet mutation was performed while recording this report.

## Production webhook Authorization corrected — September 21, 2026

User relayed dashboard inspection from the other Codex: the exact Apple 250-coin event was retrying with HTTP 401 / Invalid authorization and the integration Authorization field was empty. This explains automatic delivery failing while our authenticated manual recovery succeeded.

Using the existing environment/local development authorization value, first confirmed production accepts it via a no-purchase TEST event (HTTP 200). Then updated only `authorization_header` on RevenueCat integration `whintgrdc2cdf5bb3` via the official v2 API (HTTP 200). Readback confirmed production URL, sandbox environment, app filter and event filters unchanged. No credential printed or sent in chat; no new value generated; no purchase replay in this step. Other Codex should retry the existing failed event and verify automatic delivery HTTP 200 plus no additional wallet credit. API update success and our TEST response are not yet proof of a successful provider-originated retry.

## Apple 250-coin pending purchase recovery — September 21, 2026

User on TestFlight build 21 reported the 250-coin purchase succeeded but wallet stayed pending. RevenueCat's customer-event history and purchase API independently confirmed the same store transaction: APP_STORE sandbox, owned, quantity 1, mapped to Apple app app1937357464 / coins_250_v1. The account does not exist in this session's local development database, so local ledger/logs cannot establish production delivery. Clerk email lookup was unavailable (403); do not claim independently verified email mapping. Recovery used the exact provider transaction/account identifiers, not an email-derived substitute.

Production authenticated TEST check returned 200. RevenueCat webhook configuration readback points to production, sandbox environment, all events. Reprocessed the verified existing transaction through the production authenticated handler, retaining provider event ID, transaction ID and account ID and supplying event type/app mapping verified from API records. The handler returned 200 `received:true` (not ignored); existing transaction-key idempotency protects against double credit if original delivery/retry also succeeds. No new purchase or direct wallet edit was made. User balance/confirmation refresh remains to be checked. This is manual recovery evidence, not proof that automatic RevenueCat delivery is healthy. Inspect provider delivery attempts/production audit logs to establish the original failure; neither was available through this session's local DB.

## Production coin readiness blocker — September 21, 2026

User reports coin packs still unavailable in TestFlight. Read-only/unauthenticated production probes: `/api/healthz` returned 200; `/api/purchases/coin-products` correctly returned 401 without a user token; an empty unauthenticated POST to `/api/purchases/revenuecat/webhook` returned 503 with `Purchases are not configured`. This route checks configuration before authentication, so the response establishes missing/short `REVENUECAT_WEBHOOK_AUTH` or empty `REVENUECAT_APP_IDS` (cannot distinguish which from this response). The same configuration disables coin checkout. No valid event was submitted and no account was modified.

Current local session has SANDBOX environment but lacks both webhook authorization and app allowlist; that alone does not prove which production secret is missing. Correct Replit production secrets: `REVENUECAT_APP_IDS` must include Apple app `app1937357464` (preserve other authorized app IDs), and `REVENUECAT_WEBHOOK_AUTH` must exactly match RevenueCat's configured Authorization value and meet the existing minimum length. Keep `REVENUECAT_ENVIRONMENT=SANDBOX`. Republish backend; an unauthenticated empty webhook request should then return 401 rather than configuration 503. Then verify authenticated catalog/delivery. No new native build is needed to resolve this configuration blocker; installed build number and whether products/prices display were requested separately.

## Temporary production-hosted sandbox coins — September 20, 2026

User authorized the one-file backend change for coin testing, confirmed no paid customers, and requested an exact rollback record. In `artifacts/api-server/src/routes/purchases.ts`, `coinProductConfiguration()` now permits `SANDBOX` when running on production: removed only `process.env.NODE_ENV !== 'production' &&` from `enabled`. Server authorization, app allowlist, catalog, transaction ownership, duplicate protection and environment checks remain. `PRODUCTION` purchase fulfillment remains disabled even if the environment setting is changed to PRODUCTION. No production deployment performed here. Publish the server before device coin testing.

**Exact backend rollback:** restore:

```ts
const enabled = process.env.NODE_ENV !== 'production' && environment === 'SANDBOX' && !!secret && secret.length >= 32 && appIds.length > 0 && products.length > 0;
```

Restore the comment explaining the production-runtime block, run purchase regressions, rebuild and publish. This re-disables production-hosted coin checkout; it does not enable real payments. Real coin release remains a separate implementation/sign-off including refunds and reconciliation. VIP has its own temporary helper override documented below: reverting one does not revert the other. Test coins enter the ordinary wallet; this change does not implement isolated test balances or payout eligibility. Record testing credits before any future paid launch reconciliation; do not silently delete balances on rollback.

**Additional blocker found during the user's requested pre-build audit:** `CoinStoreContent.tsx` incorrectly treated every non-Test-Store SDK as PRODUCTION. Added `coinStoreAvailable()` in mobile `revenuecat-config.ts` and used it in coin checkout. It permits a ready SANDBOX backend with Apple/Google store SDKs, keeps Test Store restricted to SANDBOX and rejects disabled/unknown configurations. This is a permanent SDK-versus-purchase-environment correction, not part of the temporary backend rollback. Include it in the next native build; the backend change alone is insufficient for an older coin screen.

Automated evidence: production-mode Apple sandbox fixture purchase credits 250 coins once across eight concurrent deliveries; real events are rejected, including when server config is PRODUCTION; VIP events do not credit coins. API typecheck/build and coin/VIP HTTP/database suites passed. See [combined next-build test checklist](next-purchase-test-build.md) for device and deployment checks.

## Android development purchase-mode correction — September 20, 2026

User reported Android test coin purchases disappeared after switching the shared `EXPO_PUBLIC_REVENUECAT_MODE` to `store` for Apple testing. Confirmed shared mode is `store` and no Android public SDK key is configured; prior selection therefore disabled Android purchases. `purchaseConfiguration()` now explicitly uses RevenueCat Test Store for Android development (`__DEV__`) even when the shared mode is `store`. iOS TestFlight remains Apple store mode; Android release builds still require a Google public SDK key in store mode and do not silently fall back to simulated purchases. No wallet/backend behavior or build profiles changed. Android development must fully reload the bundle to initialize the SDK with the restored configuration. Native device purchase confirmation remains pending. User requested separate settings: `EXPO_PUBLIC_REVENUECAT_IOS_MODE` and `EXPO_PUBLIC_REVENUECAT_ANDROID_MODE` now take priority over the legacy shared mode. Android development defaults to test even with shared store mode; explicitly setting Android mode to store enables future Play testing with a valid Google key. iOS mode falls back to the existing shared mode, currently store. No new secrets are required for the current configuration.

## Repeated unavailable-purchases message — September 20, 2026

The user reported the same message after another TestFlight build. `PurchasesContext.tsx` shows this exact message only when the native module exists but `purchaseConfiguration().apiKey` is missing/invalid. `PULSE_TESTFLIGHT_BUILD` is a build guard for Test Store opt-in, not a runtime purchase-disable flag. Both root and mobile `eas.json` exist; the exact configuration/environment consumed by the installed Replit Publish build has not been established from build logs. Do not claim changing mobile EAS settings alone proved the installed binary received them.

Added the existing Apple public SDK key as `REVENUECAT_IOS_KEY` in `artifacts/mobile/lib/revenuecat-config.ts`. Release iOS uses that bundled fallback when the environment key is missing/empty; explicit environment keys still override it and invalid prefixes still fail closed. Development Test Store behavior, Android configuration and production API destination are preserved. No server credentials were bundled. Updated purchase configuration tests cover absent/empty environment values, explicit key override, invalid keys and the store-mode profile. All eight purchase tests passed. A new installed build/device check is still required; the exact prior build failure mechanism remains unconfirmed.

Secret-cleanup follow-up remains deferred until device success and checking other build paths; a missing mobile key secret no longer disables release iOS because of the bundled fallback. Backend secrets/settings remain required.

## Apple SDK key missing from TestFlight build — September 20, 2026

**Secret cleanup follow-up (user requested):** keep existing secrets for now. After the new TestFlight build successfully loads Apple products, check whether any other build/publish path reads `EXPO_PUBLIC_REVENUECAT_IOS_KEY` from Replit secrets. If none does, that duplicate secret can be removed because the public key is now explicitly supplied by `build.production.ios.env` in `artifacts/mobile/eas.json`. Likewise, review the duplicate `EXPO_PUBLIC_REVENUECAT_MODE` secret only after checking other build paths; the iOS profile explicitly sets `store`. Do not remove `REVENUECAT_ENVIRONMENT` as part of this cleanup: it controls backend webhook validation and is not replaced by mobile build configuration. Server API credentials and webhook authorization remain required. No secrets were removed by this note.

User reported “Purchases are not available in this build.” This exact message is shown when the native purchase module exists but the platform public SDK key is absent or has an invalid prefix. The local session had a valid Apple public SDK key, but its presence locally did not establish availability in the remote build. Added `EXPO_PUBLIC_REVENUECAT_IOS_KEY` explicitly to `build.production.ios.env` in `artifacts/mobile/eas.json`, alongside store mode. This is RevenueCat's public mobile SDK key, intended for the app bundle, not a server credential. No server keys were added. This supersedes earlier instructions relying solely on a separately supplied build environment variable. Production API destination and webhook settings were not changed. A new build through Replit Publish and device verification are required; no build was started by this fix.

## Temporary Apple sandbox VIP on production — September 20, 2026

**User decision:** there are no paid customers; Pulse is still being built and tested. TestFlight must remain connected to `https://chimbalivestream.replit.app` and the existing production Pulse account/database. Use a temporary one-file VIP helper change instead of implementing simultaneous sandbox/production VIP support or requiring a separate test account. “Sandbox” describes the purchase, not a separate Pulse account.

**Status: temporary helper override implemented locally; development API rebuilt and restarted. Not published to production.** `vipEnvironment()` now returns `sandbox` in every runtime, with a comment pointing to this rollback. The Apple-connected TestFlight build and production webhook configuration remain to be completed/verified. This decision supersedes earlier proposals for a designated-account allowlist and simultaneous environment support during this testing phase.

### Temporary setup and remaining configuration

- In `artifacts/api-server/src/lib/vipAccess.ts`, temporarily make `vipEnvironment()` return `'sandbox'`. This shared helper drives the VIP webhook environment check, RevenueCat status fetching, database writes/reads and background reconciliation. Keep `NODE_ENV=production`; do not switch the server itself to development mode.
- Set/confirm production `REVENUECAT_ENVIRONMENT=SANDBOX` so the general webhook check also accepts the event. This is server configuration, not a URL parameter or a second source-file change.
- Configure/verify authenticated RevenueCat sandbox delivery to `https://chimbalivestream.replit.app/api/purchases/revenuecat/webhook`, with the existing Apple app ID `app1937357464` allowed. Preserve webhook authentication and other validation.
- Use RevenueCat's Apple public SDK key and mobile store mode for the Apple sandbox TestFlight build. On September 20, the user approved and we changed the production iOS EAS profile from `test` to `store`; JSON validation confirmed this was its only configuration change. The Apple SDK key was format-checked in the local session, but its availability to the remote build remains to be verified. RevenueCat Test Store is a separate simulator and must not be mistaken for Apple sandbox. Keep the production API URL.
- Test the helper change and purchase/renewal/expiry/restore flow; record automated, deployed-endpoint and device evidence separately. During this temporary setup only sandbox VIP is recognized. Do not enable real paid VIP sales in this state. Coin fulfillment safeguards are outside this change and remain intact.

### When the user says “change it back” or prepares real purchases

1. Revert only the temporary helper change in `artifacts/api-server/src/lib/vipAccess.ts` to its original implementation:

   ```ts
   export const vipEnvironment = () => process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';
   ```

2. Set production `REVENUECAT_ENVIRONMENT=PRODUCTION` and configure/verify RevenueCat production webhook delivery to the same production URL, preserving authentication and the Apple app allowlist. Do not change the server's `NODE_ENV` or API URL.
3. Keep the Apple public SDK key and mobile store mode; do not revert to RevenueCat Test Store. Apple determines sandbox versus real store transactions.
4. Run the relevant VIP/purchase regression checks, rebuild/deploy the approved server change and verify the running endpoint. Confirm that production VIP reads production records and old sandbox records cannot grant paid access. Keep historical sandbox records/logs; no data deletion is required.
5. Mark this temporary override removed in this document and the go-live checklist. After restoring the original helper, TestFlight sandbox VIP will again be rejected by production; simultaneous support would be a separate future change if needed.

This rollback restores VIP environment selection only; it does not complete coin launch safeguards, Apple review requirements or other outstanding purchase checks. Verification: API typecheck/build and eight VIP snapshot tests passed. The HTTP/database VIP integration suite now runs with `NODE_ENV=production` and verifies sandbox grant, cancellation, renewal, duplicate/out-of-order delivery, expiry, lifetime/refund, authentication, logging and zero VIP coin credits; production coin readiness remains disabled. Development API health returned 200 after restart. An authenticated sandbox VIP event for a nonexistent fixture account passed environment validation and correctly returned 409 without changing any account. Actual TestFlight/Apple device testing and production deployment remain pending. The helper is the only application source file changed for this override; regression tests and documentation were updated too.

## Persistent webhook logs and verified sandbox history — September 20, 2026

User requested webhook log inspection and persistent logs when the old development log file was unavailable. Implemented `revenuecat_webhook_logs` via migration `20260920_revenuecat_webhook_logs.sql` (applied in development). Each authenticated delivery gets its own attempt row before processing; duplicate event IDs remain separate delivery attempts. Logs store bounded event/product/app/environment identifiers, hashed customer reference, event/expiry times, received/completed times, HTTP status, outcome and VIP before/after active/expiry snapshots. They do not store authorization headers, raw event bodies, emails or payment/identity details. Requests failing webhook authorization do not enter this authenticated audit table.

Outcomes: `received`, `processed`, `ignored`, `rejected`, `failed`. A stuck `received` row indicates incomplete processing, not confirmed success. If audit writes fail, return 503 for retry; coin transaction idempotency and authoritative VIP synchronization protect retries even if a state change committed before final audit completion. The logs persist across API restarts. Admin log UI is deferred; inspect through authorized database tooling. No public log endpoint was added.

Useful operational query:

```sql
SELECT received_at, event_type, product_id, environment, outcome,
       http_status, reason, vip_changes
FROM revenuecat_webhook_logs
ORDER BY received_at DESC
LIMIT 50;
```

Verified history (RevenueCat sandbox API, not reconstructed delivery receipts): `monthly` had two initial purchases at **2026-09-19 23:15:24 UTC** and **2026-09-20 00:04:40 UTC**, four renewal events per purchase, and an expiration event for each. The latest renewals extended provider expiry from 00:14:40 through 00:19:40 and 00:24:40 to **00:29:40 UTC**. Latest expiration event was recorded at **00:31:35 UTC**. Pulse's stored sandbox VIP record is inactive and its expiry matches **00:29:40.109 UTC**. Thus provider purchase/renewal/expiration and matching final backend state are confirmed. The user also reported VIP disappearing. Historical Pulse webhook receipt/status and each intermediate backend expiry cannot be proven because the old transient log file is gone; do not backfill invented delivery records or label these Apple StoreKit tests.

Validation: server typecheck/build passed. Isolated VIP HTTP/database tests verify persistent processed/rejected/failed attempts and before/after changes; existing coin-purchase integration passed. The final development API was rebuilt/restarted with its original environment, health returned 200, and a manually sent TEST to the configured public development webhook returned 200 with an independently read back `processed` audit row at **2026-09-20 01:40:39 UTC**. This TEST proves public endpoint/audit operation, not actual provider-generated purchase delivery. Real future renewals can now be verified against saved delivery records.


## VIP connection-list benefit — September 19, 2026

Implemented the approved first benefit: VIP viewers can open other users' followers/following lists; own lists remain free. Mobile uses active `pulse_pro`; list endpoints read a server-maintained VIP flag/expiry with **no RevenueCat lookup when lists open**, per the user's explicit requirement. Authenticated RevenueCat webhooks, purchase/restore catch-up and background reconciliation maintain that record. Development sandbox and production are isolated. [Final architecture, required migration/settings, and verification](pulse-vip.md#first-vip-benefit-and-stored-access--september-19-2026). This supersedes earlier owner-only, undefined-benefits and per-list provider-check notes. Phone purchase-to-unlock testing remains pending.

## Apple availability completed — September 19, 2026

User relayed the other Codex session's confirmation: availability for the app, all three personal VIP products, and all nine coin products was saved, reopened and verified for the same 13 launch countries: **United Kingdom, Saudi Arabia, United States, Colombia, Russia, Spain, Canada, Australia, Venezuela, Mexico, Costa Rica, Argentina, and Brazil**. Apple accepted every selected country, including Russia. This is user-supplied verification from that session, not an independent dashboard check here. Nothing was submitted or released.

This supersedes earlier unset/pending Apple availability notes. It confirms App Store Connect country configuration only; purchase testing, verification-provider country coverage and overall launch readiness remain separate. Review screenshots, reviewer details/access instructions, VIP benefits, RevenueCat metadata verification and sandbox purchases remain open.


## Pulse VIP launch pricing decision — September 19, 2026

User-approved customer-facing name: **Pulse VIP**. USD launch prices: **$9.99/month**, **$79.99/year**, and **$99.99 lifetime**. Monthly and annual launch subscribers retain their launch renewal price while subscribed; future higher prices apply to new subscribers. Returning subscribers pay the price available then, except for the explicitly accepted Apple preserved-price window described below. Lifetime is a one-time purchase with permanent access, not a recurring subscription. These are ongoing launch renewal prices, not first-period introductory discounts.

Accepted Apple resubscription policy (user confirmed September 19, 2026): use Apple's standard price preservation. Subscribers may resubscribe at their preserved launch price within 60 days after subscription expiration; after that window, the current price applies. The window starts at expiration, not when auto-renewal is turned off. Cancellation does not end the already-paid access period. This exception is approved and is no longer an unresolved pricing decision; store configuration and transaction testing remain pending. Source: [Apple subscription pricing](https://developer.apple.com/help/app-store-connect/manage-subscriptions/manage-pricing-for-auto-renewable-subscriptions).

**Approved coin-funded VIP model (September 19, 2026):** reuse existing coin packs for VIP gifting; do not create three separate cash gift products. Users can also buy VIP for themselves with their own spendable wallet coins. Both are one-time purchases, never automatic recurring wallet deductions. Add a **Gift VIP** badge/action on streamer profiles. Paid VIP time stacks: two one-month purchases add two months, including purchases from different senders. The recipient gets VIP access, not coins or withdrawable creator earnings. See [the implementation plan](pulse-vip.md).

The previously discussed personal store subscriptions/lifetime products are not silently removed by this decision. Their coexistence with coin access needs explicit handling to avoid duplicate billing. Confirmed VIP coin prices for both self-purchases and gifts: **2,000 for one month**, **15,000 for one year**, and **20,000 for lifetime**. These are explicit coin prices, not a fixed conversion from the previously approved USD store prices.

This records requirements only: no store price, product, entitlement identifier, app screen, or backend behavior changed. Existing internal `pulse_pro` identifiers remain unchanged; VIP benefits and their server gates still need definition. VIP remains separate from coins, Premium live admission, and age verification.

## RevenueCat metadata and review follow-up — September 19, 2026

User relayed the other session's recheck: all three personal VIP products still belong to `pulse_pro` and their existing default-offering packages; Test Store and nine coin records are preserved. Apple import returned “No new products were found”; no products were recreated. Reopened RevenueCat records still show Missing Metadata.

That session reports RevenueCat staff's explanation that monthly/yearly subscription duration can remain null until a purchase is processed. The cited explanation URL was not supplied, so this is recorded as reported guidance, not an independently verified diagnosis. Lifetime has no subscription duration. Exact cause of missing indicative prices remains unresolved. This workspace's preceding API calls already explicitly used `?expand=indicative_price` and still received null for all three products; omission of expansion does not explain those results. No sandbox purchase or populated metadata was verified.

Reported missing review material:

- Genuine IAP review screenshots for all three VIP products and nine coin products.
- Reviewer account username/password: Sign-in required is checked, both fields empty. Populate in App Store Connect; do not place passwords in these documents.
- Reviewer contact name, phone and email.
- Directions to VIP and coin purchasing screens and any access steps, based on the actual submitted build.
- App Store marketing screenshots: inspected section showed 0 of 10.
- Actual VIP benefits remain undefined; none were invented.

The handoff did not confirm sales-country changes. Availability for the app, VIP and coin products remains unverified; confirm the requested launch countries separately. No review/release submission or purchase testing is claimed by this update.

## Apple VIP saved-product handoff — September 19, 2026

User relayed the other Codex session's confirmation that all three Apple records were saved and reopened for `com.chimba.livestream`:

| Product ID | Apple numeric ID | Type / duration | Verified US price (reported) | Status (reported) |
| --- | --- | --- | --- | --- |
| `monthly` | `6813990002` | Auto-renewing / one month | $9.99/month | Prepare for Submission |
| `yearly` | `6813990251` | Auto-renewing / one year | $79.99/year | Prepare for Submission |
| `lifetime` | `6813990639` | Non-consumable / lifetime | $99.99 once | Prepare for Submission |

Subscription group **Pulse VIP**, ID **22398059**, has monthly and yearly at level 1. English names and factual duration descriptions are reported saved. No introductory offers or future price changes were configured; personal subscriptions have one seat and Family Sharing remains off. Existing RevenueCat mappings, Test Store and coin products were reported preserved. Nothing was submitted for review or release.

Independent RevenueCat API readback after this handoff confirmed the three catalog identifiers/types, but Apple subscription durations are still null and all three indicative prices are null. This does not disprove the Apple-side report; RevenueCat metadata synchronization and actual StoreKit product retrieval remain unverified. Do not report end-to-end readiness from catalog creation alone.

Remaining: app/VIP sales-country availability (reported unset), genuine review screenshots and reviewer access instructions, actual VIP benefits and enforcement, RevenueCat/store metadata verification, and sandbox purchase/renewal/expiry/restore testing. Future price increases must explicitly preserve existing subscriber prices; the accepted Apple 60-day return window remains the policy. Coin-funded self-purchases/gifts and the later buyer recognition list remain separate work.

## Personal VIP Apple catalog checkpoint — September 19, 2026

Created and read back three Apple-app product records in RevenueCat app `app1937357464`; mapped them to existing default-offering packages and attached all three to `pulse_pro` (`entl41ad621812`). Existing Test Store associations and entitlement products were preserved. Coin products and the current offering were unchanged.

| Apple product identifier | RevenueCat product ID | Package | Intended USD price / type |
| --- | --- | --- | --- |
| `monthly` | `prod04e3a2b319` | `$rc_monthly` / `pkge3b50913ec6` | $9.99, monthly auto-renewing |
| `yearly` | `prod4959963ec8` | `$rc_annual` / `pkge1a582c845e` | $79.99, yearly auto-renewing |
| `lifetime` | `prod351de29723` | `$rc_lifetime` / `pkgeebfbce27a5` | $99.99, non-consumable |

These are RevenueCat catalog records only. App Store Connect creation, subscription group/durations, pricing, localization, availability and review metadata are not completed or verified by this action. RevenueCat currently reports null Apple subscription durations until store configuration is synchronized. The workspace has RevenueCat management access but no Apple management credentials configured. No create-in-store request, purchase, build or submission was performed. User requested a prompt for the other Codex session to complete the Apple side using the exact identifiers above. Use one Pulse VIP subscription group for monthly/yearly at the same service level; lifetime is a separate non-consumable. Launch prices are ongoing renewal prices, with preservation at future price increases and the approved Apple 60-day return window. Gifting remains coin-funded; create no separate gift products.

## Apple app and package mapping checkpoint — September 19, 2026

The other Codex session's user-supplied report confirms that Pulse's dedicated IAP key was saved/reopened and both Apple credentials show Valid credentials. Apple app ID: **6809048225**. RevenueCat Apple app: **app1937357464**. Bundle ID: **com.chimba.livestream**. Nine Apple consumables were created; nothing was submitted for review/release. Credential validity is attributed to that session, not independently revalidated through this API check.

This workspace independently read RevenueCat project **proj2b054d16**, confirmed the Apple app and all nine consumables, then attached each Apple product to the matching existing package in offering **coins** (**ofrng03b8bc924d**). Readback confirmed all nine Apple associations and preservation of every Test Store product association. Package IDs, names, positions, default offering, subscriptions, entitlements and prices were not changed.

| Store identifier / package key | Apple RevenueCat product ID |
| --- | --- |
| coins_250_v1 | prod329993157c |
| coins_500_v1 | prodcd183a01ec |
| coins_1000_v1 | proda42bf897a1 |
| coins_2000_v1 | prod2c7187a420 |
| coins_6000_v1 | prod57a30f52ed |
| coins_8000_v1 | prode57c37b365 |
| coins_10000_v1 | prodaf85e5dfb4 |
| coins_12000_v1 | prod83227b5a68 |
| coins_14000_v1 | prod79f0ffe5b1 |

Still required: Apple availability and genuine review screenshots; Apple public SDK key and `EXPO_PUBLIC_REVENUECAT_MODE=store` in the next intended Apple sandbox build; inclusion of app1937357464 in the appropriate sandbox server app allowlist and matching webhook delivery; actual Apple sandbox purchases and wallet confirmation. Current checked-in TestFlight settings still explicitly select Test Store. This mapping task did not change build profiles, keys, API startup settings or webhooks and did not start a build/purchase. Real-store sandbox must remain separated from production balances. Production fulfillment is still disabled pending refund/debt handling, reconciliation/alerts, operational recovery and release checks. No end-to-end Apple purchase or production completion is claimed.


Updated: 2026-09-15. Read [the purchase decisions](coin-purchases.md) before changing this flow.

Shared change handoff: [coins, Premium gifts, and RevenueCat](coins-premium-revenuecat.md).

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

## Development startup isolation result — 2026-09-15

The user tested with RevenueCat startup disabled in development and reported that the data remained missing. Metro logs continued to show Android `UnknownHostException` for the development API hostname. The temporary switch was removed and normal RevenueCat configuration restored. Metro was restarted with its original environment (the temporary mode removed) and `--clear`. The user subsequently reported that data loading was fixed. Gold-coin and Premium gift-request code were not changed during this investigation. The user also confirmed the API health URL worked in Chrome on the affected Android phone; their saved SSH hostname matched the current workspace hostname. The user later reported SSH recovered too; the exact SSH failure was not captured. Recovery is user-confirmed. A subsequent delivered source edit/refresh preserved visible data on both phones, with successful native API probes. The cause of the original failure remains unconfirmed.

Further timing, native probes, and controlled refresh results: [development connectivity investigation](development-connectivity.md).

## 1. Install the packages

For an npm-managed React Native application:

```sh
npm install --save react-native-purchases react-native-purchases-ui
```

Pulse is a pnpm monorepo with `workspace:*` dependencies and a root preinstall guard against npm. The equivalent installation was performed without changing the repository's package manager:

```sh
pnpm --filter @workspace/mobile add react-native-purchases react-native-purchases-ui
```

Both packages are auto-linked into the next native build. Expo Go and an older installed build without the modules cannot exercise these native purchases. Pulse shows a clear unavailable message instead of crashing the whole app. The user has authorized the next TestFlight build configuration. The assistant has not started an EAS build or store submission; the next build must include the approved testing flags below.

References: [React Native installation](https://www.revenuecat.com/docs/getting-started/installation/reactnative), [Expo installation](https://www.revenuecat.com/docs/getting-started/installation/expo).

## 2. Configure SDK and server keys

| Setting | Purpose |
| --- | --- |
| `RC_API_KEY` | The public Test Store SDK key the user stored in Replit. The supplied same public key is already wired into `lib/revenuecat-config.ts` for native development. |
| `EXPO_PUBLIC_REVENUECAT_MODE=test` | Explicit Test Store selection for the authorized iOS TestFlight build in `build.production.ios.env`; native development also defaults to test mode. |
| `PULSE_TESTFLIGHT_BUILD=true` | Build-only, explicit iOS TestFlight opt-in allowing Test Store under the existing `production` profile. It does not detect the eventual App Store distribution channel. |
| `EXPO_PUBLIC_REVENUECAT_MODE=store` | Real platform-store selection. |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | Public `appl_` SDK key for a future Apple app. |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | Public `goog_` SDK key for a future Google app. |
| `REVENUECAT_API_V2_SECRET_KEY` | Server/workspace-only project management key; never bundled in the mobile app. |
| `REVENUECAT_WEBHOOK_AUTH` | Separate server secret, e.g. `Bearer <random-token>`, matching the complete Authorization header entered in RevenueCat's webhook configuration. Not an SDK/API key. |
| `REVENUECAT_APP_IDS` | Comma-separated RevenueCat app allowlist; for the current test setup, `app0722e3199f`. |
| `REVENUECAT_ENVIRONMENT` | `SANDBOX` for this initial implementation. Sandbox is rejected in production runtime. |
| `REVENUECAT_COIN_PRODUCTS` | Optional JSON override. Defaults to the nine approved immutable coin mappings in `src/config/coin-products.json`. Explicit invalid or empty configuration disables purchases. |

Do not change to a live key merely to test: the one supplied `test_` key works on both iOS and Android with Test Store. The Expo config rejects explicit Test Store mode in the EAS production profile unless `PULSE_TESTFLIGHT_BUILD=true` marks an iOS testing build. The two flags are scoped to `build.production.ios.env`, preserving Android profiles. Without explicit test mode, release bundles use platform keys and disable purchases if the correct public key is absent. Before public App Store release, remove the TestFlight flag, set RevenueCat mode to `store`, configure the Apple SDK key and complete production fulfillment/QA. Build flags do not prevent a test binary from being selected for public release; do not release the TestFlight test-mode binary.

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

### Planned Premium prompt quick refill — 2026-09-15

Future work requested by the user: expose **500 / 1,000 / 2,000 coin** refill choices in the timed Premium request prompt. The corresponding approved consumables already exist in the catalog (`coins_500_v1`, `coins_1000_v1`, `coins_2000_v1`). This has not been implemented. Preserve server-confirmed wallet fulfillment; a coin purchase alone does not satisfy the timed gift request. See [the recorded follow-up](coin-purchases.md#planned-quick-refill-in-the-timed-premium-prompt--2026-09-15).

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

Device checks still required: nine localized prices/amounts, successful/failed/cancelled/pending purchases, repeated taps, closing/reopening after payment, correct wallet credit, logout/account switch, subscription activation/expiry/restore, Customer Center and Android app-switch payment return. A native rebuild is required; the user has now authorized RevenueCat TestFlight configuration for the next iOS build. No visual/device validation has been claimed.

### Verified sandbox checkpoint

See [the complete evidence](coin-purchases.md#revenuecat-sandbox-verification--2026-09-15). Nine actual Test Store purchases delivered RevenueCat webhooks to the running API and credited 53,750 coins in nine transactions for an isolated QA account. This is sandbox API/webhook evidence; it does not exercise native StoreKit, Android billing, or visual layout.

The ignored `artifacts/api-server/.local/revenuecat.env` supplies development-only webhook authorization, environment and app allowlist. `src/index.ts` loads it only with `NODE_ENV=development`, with explicit environment values taking precedence. Replit Secrets should hold the corresponding deployment settings when production is ready. Production remains disabled.

Test Store price creation uses the official API endpoint `POST /projects/{project_id}/products/{product_id}/test_store_prices`, with USD `amount_micros`; price verification uses `GET .../prices`. Reference: [RevenueCat's official API client](https://github.com/RevenueCat/cli/blob/main/internal/api/products.go).

### Approved TestFlight configuration — 2026-09-15

The user explicitly approved adding test mode for the next TestFlight build. `artifacts/mobile/eas.json` now sets `EXPO_PUBLIC_REVENUECAT_MODE=test` and `PULSE_TESTFLIGHT_BUILD=true` in `build.production.ios.env`. `app.config.js` allows this explicit iOS exception. Local `.env` files, Replit secrets, EAS remote variables, development Clerk/API/database/Agora settings, and the installed CLI were not changed.

Continue using the installed CLI from `artifacts/mobile`:

```bash
eas build --platform ios --profile production
```

Verification: the installed EAS profile parser resolves both flags for iOS and neither for Android. Eight purchase/configuration tests pass, including release-bundle selection of the public Test Store key, local/cloud Expo config evaluation, rejection without the explicit opt-in, and preservation of real-store mode. No new native build or device payment check was performed by the assistant. The already-built binary cannot gain these flags without a new build.

Android recovery follow-up, September 21: user confirmed Javilo and that a 250-coin purchase was also made. Revalidated the exact RevenueCat purchase as owned/Test Store/sandbox/quantity 1 and product mapping coins_250_v1; reprocessed that existing event to development. HTTP 200 received:true. Independent local DB readback confirmed exactly one +250 ledger credit and balance 43,602 -> 43,852; no preexisting credit for that transaction. No new purchase was created. This verifies manual recovery/idempotent ledger result; new automatic Test Store delivery remains to be device-tested after the routing correction.
