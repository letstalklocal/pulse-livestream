# Coins, Premium gifts, and RevenueCat — change handoff

Updated: 2026-09-15. This is the shared entry point for the implemented changes and recorded decisions. Detailed requirements remain in [coin purchases](coin-purchases.md), [timed Premium gifts](premium-gift-requests.md), and [RevenueCat integration](revenuecat-integration.md).

## How the flows connect

| Flow | Coin/access behavior | Entry point |
| --- | --- | --- |
| Buy Coins through RevenueCat (RC) | A verified sandbox webhook adds coins to the signed-in user's Pulse wallet, recorded as `type=purchase`. Buying coins alone does not pay a Premium entry gift or timed request. | Account/profile balances, Settings → Buy Coins, and the ordinary gift drawer's purchase sheet. |
| Premium live admission | The selected entry gift spends wallet coins, credits the host, and records admission. Existing free-entry rules remain. | Existing Premium entry/conversion flow. |
| Timed gift during Premium | A separate request spends existing wallet coins through its **Send Gift** action; successful payment satisfies that specific request. | Host's Premium gift icon and the targeted viewer's bottom prompt. |
| Ordinary gifting | Uses the existing gift/payment flow and selected recipient. | Ordinary gift drawer in live streams or direct messages. |
| Pulse Pro subscription/lifetime access | RevenueCat's `pulse_pro` entitlement; these products do not grant coin packs or replace Premium admission/request payments. | Settings → Pulse Pro; includes restoration and Customer Center. |

The timed Premium request prompt currently has **no Buy Coins flow**. **Planned later (user decision, 2026-09-15): add a quick refill in that prompt with 500, 1,000, and 2,000 coin options.** This is a recorded follow-up, not an implemented feature. The existing ordinary gift drawer purchase sheet does not add checkout to a running request. No change to deadlines or gift-payment/access rules was requested. Website checkout and web purchase links remain deferred.

## Gold coin artwork and purchase UI

- Replaced the account-header system coin emoji, which looked white on iPhone, with explicit-gold SVG artwork. The shared `GoldCoinIcon` defaults to 16 points.
- Host/viewer live earnings counters and Top Gifters totals use the same artwork at 14 points, including regular and party live views. Earnings totals and leaderboard actions remain the same; those counters do not become wallet-purchase buttons.
- The shared Buy Coins page and gift-drawer purchase sheet use a **3 × 3 grid**, ascending coin amounts, smaller **32-point** gold artwork, and **white localized prices** beneath the amounts. Cards currently have a 124-point minimum height and can expand for text.
- Both SVG artwork implementations use `accessible={false}` on native platforms and omit that value on web. The purchase card retains its accessible coin/price label. This records the compatibility correction; it is not a completed accessibility audit or a proven fix for the connectivity incident.
- Spendable balances in account/profile headers open Buy Coins. Zero shows the coin icon plus **Buy Coins**; positive balances retain their localized number and remain tappable. The ordinary gift drawer opens purchase content in its existing modal, preserving the route and selected recipient when returning to gifts. Some other coin glyphs, including ordinary gift-drawer glyphs, still use emoji; do not describe all app coin icons as converted to SVG.
- **Refresh** is the icon at the top right of Buy Coins, with its accessible label. The full-width Refresh button was removed. **Restore purchases** and its explanatory paragraph were removed from Buy Coins; restoration remains in Settings → Pulse Pro. **Manage purchases** remains available.

Implementation: [shared counter artwork](../artifacts/mobile/components/GoldCoinIcon.tsx), [Buy Coins content](../artifacts/mobile/components/CoinStoreContent.tsx), [ordinary gift drawer](../artifacts/mobile/components/GiftPicker.tsx), [account header](../artifacts/mobile/components/AccountHeader.tsx), and [Top Gifters](../artifacts/mobile/components/GiftLeaderboard.tsx).

## Confirmed nine coin packs

| Product ID | Coins | Approved USD base price |
| --- | ---: | ---: |
| `coins_250_v1` | 250 | $1.99 |
| `coins_500_v1` | 500 | $3.99 |
| `coins_1000_v1` | 1,000 | $7.99 |
| `coins_2000_v1` | 2,000 | $14.99 |
| `coins_6000_v1` | 6,000 | $44.99 |
| `coins_8000_v1` | 8,000 | $59.99 |
| `coins_10000_v1` | 10,000 | $74.99 |
| `coins_12000_v1` | 12,000 | $89.99 |
| `coins_14000_v1` | 14,000 | $99.99 |

The server catalog determines coins granted. RevenueCat/store product `priceString` supplies the displayed localized price; USD prices above are the approved base prices, not hardcoded checkout labels. Offering `coins` contains the nine consumables; the existing `consumable` sample and monthly/yearly/lifetime products are separate. Do not alter an already-sold product ID's granted amount; use a new identifier for a changed pack. See the [checked-in catalog](../artifacts/api-server/src/config/coin-products.json).

## Timed Premium gift changes

- While Premium is active, the host's former lock position shows a gift icon. Public lives retain Convert to Premium. The current timed-request control is hidden for private invitations and party mode; this does not add timed requests to those modes.
- Host selects a gift and **30 or 60 seconds**, default **30**. Only one request runs at a time; reopening shows remaining time and paid/targeted counts.
- Current admitted viewers, including free-entry viewers, are targeted. Later arrivals follow existing admission rules rather than joining a prior request retroactively.
- Viewers see the gift, coin cost, countdown, and **Send Gift**. At ten seconds or less the countdown blinks; Reduced Motion uses steady warning styling. Payment hides the requirement. Insufficient coins produces an error without a charge or request clearance.
- The server saves the gift/cost/deadline and atomically debits the viewer, credits the host, writes a `gift` ledger transaction, and records payment. Retries cannot charge the same viewer twice for the same request. The client updates the wallet balance from the payment response and refreshes request/access state.
- Unpaid viewers lose access at expiry. Server checks enforce this independently of the display timer. Successful Agora individual removal preserves the host and remaining viewers' media connection; existing media-channel rotation is the fallback. Remove, Block, and Allow Back retain their existing meanings.
- Payments retain the existing earnings, animation, and live-chat gift-notice path. The separate floating sender/gift-name box was removed elsewhere; the chat notice and gift animation remain.

Current gift costs: Rose 1, Heart 5, Party 10, Diamond 50, Rocket 100, Crown 500 coins. Admission price, timed requests, and ordinary gifts retain their separate records and payment actions.

Implementation: [request hook](../artifacts/mobile/hooks/usePremiumGiftRequest.ts), [host selector](../artifacts/mobile/components/PremiumGiftRequestSheet.tsx), [viewer prompt](../artifacts/mobile/components/PremiumGiftPrompt.tsx), [server payments/expiry](../artifacts/api-server/src/lib/premiumGiftRequests.ts), [stream routes](../artifacts/api-server/src/routes/streams.ts), and the [additive migration](../lib/db/migrations/20260914_premium_gift_requests.sql).

## RevenueCat integration and fulfillment

- Native SDK and UI SDK 10.9.1 are installed. `PurchasesProvider` uses the stable Clerk user ID, serialized identity/purchase operations, customer-info notifications, and foreground refresh. The UI SDK is used for Customer Center; no RevenueCat paywall was added.
- The app passes a configured package to checkout. After a completed purchase, it stores the pending transaction per account, polls fulfillment, and prevents another checkout while wallet confirmation is pending. Closing/reopening can resume confirmation. Cancellation and pending approval are not successful wallet credits.
- `POST /api/purchases/revenuecat/webhook` validates its server authorization and allowlisted app, environment, store, product, and account. Verified consumable purchase events credit the configured amount exactly once. Duplicate delivery cannot mint coins twice; subscription/lifetime events do not grant coins.
- Authenticated `GET /api/purchases/coin-products` reports the catalog/readiness. `GET /api/purchases/coin-transactions/:transactionId` reports the caller's fulfillment/current balance. Neither read endpoint credits coins.
- Test Store is the default for native development. Normal configuration has been restored after the temporary connectivity investigation; no `disabled` mode override remains.
- **Production fulfillment remains disabled in code.** Refund/debt handling, reconciliation/alerts, operational recovery, store-specific transaction validation, real Apple/Google sandbox tests, and production isolation remain required. The earlier sample purchases establish sandbox delivery only.

Implementation: [SDK configuration](../artifacts/mobile/lib/revenuecat-config.ts), [session handling](../artifacts/mobile/lib/revenuecat-session.ts), [provider](../artifacts/mobile/context/PurchasesContext.tsx), and [purchase endpoints](../artifacts/api-server/src/routes/purchases.ts). Server secret values belong in the documented secret configuration, never in these notes or the mobile bundle.

## Verification and remaining work

| Area | Recorded evidence | Still pending |
| --- | --- | --- |
| Timed Premium core flow | Earlier API/mobile checks, integration coverage, running endpoints, and real Agora rule create/delete checks passed. User confirmed unpaid removal, payer retention, and uninterrupted broadcast on September 14. | Apple-specific checks; deadline-edge payments, repeated taps, insufficient funds, reconnect/resume, Reduced Motion, Allow Back, and detailed device combinations. |
| RC sandbox delivery | Nine actual Test Store purchases delivered webhooks to an isolated QA account: **53,750 coins in nine ledger entries**. Fixtures were cleaned up. Separate tests covered duplicates, ownership, and configuration. | Native StoreKit/Google billing, refund/reconciliation paths, and production readiness. |
| Coin UI/artwork | Current source implements the documented sizes/layout/labels. Earlier type/localization checks passed; user liked the preceding Android build. | Updated iPhone/Android artwork/grid checks, large text, localized prices, screen-reader behavior, and purchase-sheet return with live/chat/recipient state retained. |
| App Store Connect | User reported all nine consumables saved/reopened for `com.chimba.livestream`, correct prices, Prepare for Submission. | Genuine review screenshots, sales-country availability, Apple/RC linkage and credentials, and native payment testing. No submission recorded. |
| Refresh/connectivity | After recovery, native API probes passed; a delivered source edit preserved visible data on both phones, confirmed by the user. | Original outage cause remains unconfirmed. This does not validate purchase or Premium payment behavior. Follow the [connectivity runbook](development-connectivity.md) if it recurs. |

The remote/store checkpoints above summarize existing evidence; this documentation update did not repeat transactions, inspect dashboards, run a native build, or submit a release.

## Build handoff

The latest recorded test-build decisions supersede the older build-hold notes. Use the installed EAS CLI and existing profiles from `artifacts/mobile`: Android uses `development` for the Metro-connected client; the next iOS TestFlight test uses `production` with the already-approved iOS-only `EXPO_PUBLIC_REVENUECAT_MODE=test` and `PULSE_TESTFLIGHT_BUILD=true` flags. These settings are in the current `eas.json`; Android does not inherit the iOS flags. Do not upgrade the CLI or change profiles/environment for routine builds.

See [Apple/TestFlight fixes](apple-testflight-fixes.md) and [Android build workflow](android-build-workflow.md) for the recorded instructions. A Test Store binary is for testing and must not be selected for public release. This documentation request does not start a build or publish anything.
