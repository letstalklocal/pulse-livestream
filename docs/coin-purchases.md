# Coin purchases

## Purchase history decision — September 21, 2026

User requested avoiding a workaround for the generic RevenueCat Test Store history label after confirming Apple already shows the coin pack name. Reverted the proposed SDK upgrade: retain RevenueCat SDK/UI 10.9.1, native Customer Center, and the existing product names. No custom history view or historical migration. Preserve the rolling balance animation, confirmed working on Android.

Google Play history is expected to use its configured store product names, like Apple does. Actual Google Play purchase/history verification remains pending; do not claim this has been device-tested or that Test Store labels were fixed. No build is required for this reverted SDK proposal.

## Confirmed-credit animation and history request — September 21, 2026

User requested a rolling wallet number followed by a brief expansion, and clarified that pack names belong in **Manage purchases → History**, not the success notice. Buy Coins now animates only after its authenticated fulfillment response reports credited: 1.1-second count-up for that pack, then a 1.12× pulse and settle. Reduced Motion shows the final balance without animation. Account changes reset feedback; ordinary refreshes do not replay a confirmed credit. Wallet crediting and payment handling are unchanged.

History remains RevenueCat's native Customer Center. Readback found all nine packs already named with amounts in both Test Store (e.g. “250 coins”) and Apple (“250 Pulse Coins”). No product metadata or native history customization has been changed. User confirmed the Android Test Store row says “one time purchase - 14.99 test store” instead of the 2,000-coin pack. This matches a generic native history label; the exact installed-SDK fallback cause remains unconfirmed. User challenged the need for a custom history view. Correction: pinned React Native SDK 10.9.1 uses hybrid 18.37.0 / Android SDK 10.20.0, whose PurchaseInformation.determineTitle uses the store product title then the generic purchase-type label. Current upstream additionally supports transaction.displayName as a fallback. Therefore native history supports product names; a custom view is not established as necessary. No SDK upgrade or custom history view has been made. Do not mark the requested history change complete. Avoid renaming products or replacing Customer Center without evidence of the cause.

Automated: mobile typecheck, ten purchase regressions, all ten localization catalogs (998 strings), and targeted diff-format checks passed. User confirmed the Android count-up/pulse works and looks nice. Reduced Motion, iPhone animation, and corrected history labels remain unverified. No native build, deployment, or backend changes for this UI work.


## Apple availability completed — September 19, 2026

User relayed the other Codex session's confirmation: availability for the app, all three personal VIP products, and all nine coin products was saved, reopened and verified for the same 13 launch countries: **United Kingdom, Saudi Arabia, United States, Colombia, Russia, Spain, Canada, Australia, Venezuela, Mexico, Costa Rica, Argentina, and Brazil**. Apple accepted every selected country, including Russia. This is user-supplied verification from that session, not an independent dashboard check here. Nothing was submitted or released.

This supersedes earlier unset/pending Apple availability notes. It confirms App Store Connect country configuration only; purchase testing, verification-provider country coverage and overall launch readiness remain separate. Review screenshots, reviewer details/access instructions, VIP benefits, RevenueCat metadata verification and sandbox purchases remain open.


Shared change handoff: [coins, Premium gifts, and RevenueCat](coins-premium-revenuecat.md).

## Recorded user decisions — 2026-09-15

- Integrate RevenueCat for the first in-app purchase implementation, initially using the supplied public Test Store SDK key.
- No RevenueCat paywall. Build a coin purchase screen displaying each pack's coin amount and localized store price.
- **Launch with nine coin packages.** The existing RevenueCat `consumable` product is a test placeholder, not the final pack selection. The confirmed amounts are 250, 500, 1,000, 2,000, 6,000, 8,000, 10,000, 12,000 and 14,000 coins. All nine USD prices are confirmed below.
- Coin packs must be configurable. Apple/Google purchases select a configured product; client-entered coin amounts or prices must not determine wallet credits or the store charge.
- **Later, add website coin purchases**, following the TikTok-style web top-up experience the user referenced. In-app and website purchases credit the same account's Pulse wallet. The user said this was discussed earlier; the earlier detailed coin discussion was not found in the current project docs. This records the explicit decision supplied today without inventing the earlier details.
- **No website checkout, external purchase links, or web-buy prompts in the initial build.** Website payments are a later phase. Provider, pack amounts/prices, any price differences, and website checkout details are not yet agreed. Review applicable store/region rules before adding in-app links or prompts to website checkout.
- Keep the wallet ledger independent of the checkout provider so another verified payment provider can be added later. Payment success must be validated on the server and each transaction credited exactly once.
- Requested SDK support includes customer info, `pulse_pro` entitlement checks, purchase/restore handling and Customer Center. Monthly/yearly/lifetime products may grant `pulse_pro`; consumable coin products do not. Subscriptions will unlock special features, as confirmed by the user. The individual special features remain to be specified; do not infer benefits or change existing Premium live access.

## Current implementation

Implementation and setup instructions are in [RevenueCat integration](revenuecat-integration.md). The nine coin amounts and confirmed prices are recorded below. RevenueCat configuration and verification must be recorded separately. The provided `test_` key is an SDK key, not a secret dashboard-management key.

## Pricing-model reference supplied by the user — 2026-09-15

Before selecting the six packs, the user supplied this strategy from the earlier coin discussion:

| Channel | Example purchase | Coins | Creator earnings if all coins are gifted |
| --- | --- | --- | --- |
| Website (later phase) | $100 | 20,000 | $60 |
| In-app (initial build) | $100 | 14,000 | $42 |

- Creator payout reference: **$0.003 per gifted coin**, independent of where the buyer purchased it.
- The example corresponds to 200 coins per dollar on web and 140 coins per dollar in-app. At equal example spend, the web pack contains approximately **42.86% more coins**.
- The in-app example uses an **assumed approximate 30% store commission**. This is a planning assumption, not a verified fee for every store, product or purchase. Actual fees/taxes and later web processing costs must be reflected in the final economics.
- Desired creator presentation in the supplied strategy: show earnings directly in dollars, without an intermediate diamond conversion. The existing earnings implementation has not yet been changed to this model.
- This records the reference strategy, not six final package amounts/prices. Currency denomination, store price points, rounding/bonuses and payout eligibility/settlement details remain to be finalized. Do not silently derive and publish six packs from this example.
- Website purchasing and web-buy links remain excluded from the initial build.

## Confirmed initial in-app packs — 2026-09-15

| Coins | Price | Status |
| ---: | ---: | --- |
| 250 | $1.99 | Confirmed |
| 500 | $3.99 | Confirmed |
| 1,000 | $7.99 | Confirmed |
| 2,000 | $14.99 | Confirmed |
| 6,000 | $44.99 | Confirmed |
| 8,000 | $59.99 | Confirmed |
| 10,000 | $74.99 | Confirmed |
| 12,000 | $89.99 | Confirmed |
| 14,000 | $99.99 | Amount and price confirmed |

The $99.99 top-pack price supersedes the earlier illustrative $100 in-app price. The user explicitly selected the other five prices shown above; these supersede the assistant’s proportional-price calculation. Use these exact USD base prices; store-localized prices will be returned by RevenueCat. These are the initial in-app packs, with web purchasing still deferred.

The latest addition expands the initial selection from six to nine packs. The user explicitly confirmed the three smaller `.99` prices. All nine prices in the table are approved.

## Apple / RevenueCat follow-up — 2026-09-19

User relayed the other Codex session's confirmation that Apple credentials were saved and valid, Apple app 6809048225 / bundle com.chimba.livestream was linked to RevenueCat app app1937357464, and nine consumables were added. This workspace then mapped and read back all nine Apple products in the existing coins packages, preserving Test Store associations. See [mapping evidence and remaining work](revenuecat-integration.md#apple-app-and-package-mapping-checkpoint--september-19-2026). Availability, review screenshots, native Apple sandbox testing and production fulfillment requirements remain open; no submission/release occurred.

## App Store Connect checkpoint — 2026-09-15

**Source:** User-supplied report from the ChatGPT Desktop browser setup. Saved here as reported evidence; this workspace session did not independently reopen App Store Connect.

Saved and reopened all nine products in Pulse’s App Store Connect. Verified bundle ID: `com.chimba.livestream`. All are **Consumable**, with the exact IDs, requested English names/descriptions, United States base country, and Apple-calculated equivalent prices.

| Product ID | Verified US price | Status | Remaining setup |
| --- | ---: | --- | --- |
| `coins_250_v1` | $1.99 | Prepare for Submission | Screenshot; availability |
| `coins_500_v1` | $3.99 | Prepare for Submission | Screenshot; availability |
| `coins_1000_v1` | $7.99 | Prepare for Submission | Screenshot; availability |
| `coins_2000_v1` | $14.99 | Prepare for Submission | Screenshot; availability |
| `coins_6000_v1` | $44.99 | Prepare for Submission | Screenshot; availability |
| `coins_8000_v1` | $59.99 | Prepare for Submission | Screenshot; availability |
| `coins_10000_v1` | $74.99 | Prepare for Submission | Screenshot; availability |
| `coins_12000_v1` | $89.99 | Prepare for Submission | Screenshot; availability |
| `coins_14000_v1` | $99.99 | Prepare for Submission | Screenshot; availability |

**Remaining:** Supply genuine review screenshots and select sales countries. The app’s country availability was unset, so that state was preserved rather than choosing a distribution scope.

No duplicates were created. Subscriptions and app download pricing were unchanged. Nothing was submitted for review or release. This checkpoint records App Store Connect product setup, not completed RevenueCat/Apple linkage, transaction testing, or launch readiness.

## Coin entry points — 2026-09-15

- After completing the RevenueCat sandbox catalog and Buy Coins screen, make the spendable coin balances in account headers and the profile header open the nine-pack Buy Coins page.
- At zero coins, preserve the coin icon and show **Buy Coins** where the number normally appears. Positive balances keep their localized number; both states are tappable. Header avatars retain their profile action.
- Apply the same zero/positive balance behavior to the ordinary gift drawer in live streams and direct messages. Its coin button opens the same purchase content inside a sheet. Returning to gifts preserves the live/chat route and selected recipient.
- This concerns the user's spendable balance, not streamer earnings or timed Premium gift requests. No automatic paywall or website purchase link is added.

Implemented in AccountHeader, profile, GiftPicker and the shared CoinStoreContent component. Device checks remain pending: zero/positive balances, all nine options, purchase and return to gifts, recipient retention, chat draft/keyboard behavior, live continuity, and Android Back.

## Planned: quick refill in the timed Premium prompt — 2026-09-15

The user requested a future quick refill/recharge option directly in the timed Premium gift request prompt, with **500, 1,000, and 2,000 coin choices**. Record this for later; it is not implemented in the current prompt. The approved catalog already contains `coins_500_v1`, `coins_1000_v1`, and `coins_2000_v1`; this request does not add new pack sizes or change approved prices. Detailed interaction and payment-return behavior remain future work. Existing deadline, confirmed-wallet-credit, and gift-payment/access rules remain the current baseline. See [timed Premium gifts](premium-gift-requests.md).

## RevenueCat sandbox verification — 2026-09-15

- Completed and read back the `coins` offering (`ofrng03b8bc924d`) with nine Test Store products, exact approved USD prices, and nine custom packages. SDK offerings response also returned all nine.
- Connected sandbox webhook `whintgrdc2cdf5bb3` to the development API; authenticated TEST requests returned HTTP 200 locally and through its public URL.
- Executed one simulated RevenueCat Test Store purchase per pack on an isolated QA account. Actual RevenueCat webhook deliveries credited **53,750 coins in nine ledger entries**, exactly the sum of the nine packs. No real money was charged. Local QA user, balance and ledger fixtures were removed afterward.
- Separate HTTP/database tests verified concurrent duplicate deliveries credit once, authorization, account ownership, product mapping, and production isolation.
- The development API was rebuilt and restarted with its existing environment. Development-only webhook credentials are stored in the ignored `artifacts/api-server/.local/revenuecat.env`; startup loads them without overriding explicit environment values. Never commit this file. Production does not load it.
- Apple products remain only user-verified in App Store Connect. RevenueCat's inspected project still has only its Test Store app. Apple app linkage/credentials, native-device purchase checks, refunds/reconciliation and production enablement remain outstanding. Follow the latest approved test-build workflow in [Apple/TestFlight fixes](apple-testflight-fixes.md); it supersedes the earlier hold.

## Buy Coins card design — 2026-09-15

User reports that the existing Android test build looks good; iOS still needs a rebuilt TestFlight app for testing. This is user-confirmed feedback before the following visual change, not a completed device check of the new design or every purchase case.

- The shared Buy Coins page and gift-drawer purchase sheet use **three columns and three rows** for the nine approved packs, in ascending coin order.
- Reference: the user-provided `downloads/Screenshot 2026-09-14 at 11.52.51 PM.png`. Use Pulse's dark surfaces, pink accents and rounded cards.
- Each card shows gold vector coin artwork, the centered coin amount, then the localized store price **in white beneath the amount**.
- Follow-up correction: make the card coin artwork smaller. Artwork is now 32 points, with compact 124-point minimum-height cards; text may expand the cards for localized prices/accessibility scaling.
- Preserve the approved nine product IDs, amounts and prices, RevenueCat checkout, pending-purchase recovery, disabled states, and the shared page/sheet navigation. Purchase prices remain supplied by RevenueCat.

Implementation: `artifacts/mobile/components/CoinStoreContent.tsx`. Type/localization checks are separate from visual/device checks. The temporary browser preview could not launch because its runtime lacks a required system library; no browser or native appearance verification is claimed. Device check: three cards per row, small coin artwork, white prices below amounts, scrolling, long localized prices, large text, and return to gifts without losing the live/chat or selected recipient. No EAS/CLI/environment settings were changed for this design task.

**Refresh placement correction:** In both the Buy Coins page and gift purchase sheet, use a refresh icon at the top right of the header and remove the full-width Refresh button. Retain its accessible Refresh label and the existing refresh of customer information/offerings, coin catalog and wallet balance, including disabled behavior while busy or signed out.

**Restore placement correction (2026-09-15):** Remove Restore purchases and its explanatory paragraph from the shared Buy Coins page/sheet. Keep restoration on the existing Settings → Pulse Pro subscription screen. Preserve Manage purchases, the header refresh icon and coin checkout behavior.

**Live counter artwork correction (2026-09-15):** Host and viewer live coin counters now use the shared explicit-gold SVG artwork from account headers, replacing the platform-dependent emoji that appeared white on iPhone. These remain live earnings counters opening the leaderboard, separate from spendable-balance Buy Coins shortcuts. iPhone visual verification is pending.

**Top Gifters artwork correction:** The live Top Gifters sheet also uses the shared 14-point gold SVG coin beside each total, preserving leaderboard order, amounts, colors and refresh behavior. Applies to both host and viewer entry points. Native appearance check pending.
