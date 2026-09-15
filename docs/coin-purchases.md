# Coin purchases

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

## RevenueCat sandbox verification — 2026-09-15

- Completed and read back the `coins` offering (`ofrng03b8bc924d`) with nine Test Store products, exact approved USD prices, and nine custom packages. SDK offerings response also returned all nine.
- Connected sandbox webhook `whintgrdc2cdf5bb3` to the development API; authenticated TEST requests returned HTTP 200 locally and through its public URL.
- Executed one simulated RevenueCat Test Store purchase per pack on an isolated QA account. Actual RevenueCat webhook deliveries credited **53,750 coins in nine ledger entries**, exactly the sum of the nine packs. No real money was charged. Local QA user, balance and ledger fixtures were removed afterward.
- Separate HTTP/database tests verified concurrent duplicate deliveries credit once, authorization, account ownership, product mapping, and production isolation.
- The development API was rebuilt and restarted with its existing environment. Development-only webhook credentials are stored in the ignored `artifacts/api-server/.local/revenuecat.env`; startup loads them without overriding explicit environment values. Never commit this file. Production does not load it.
- Apple products remain only user-verified in App Store Connect. RevenueCat's inspected project still has only its Test Store app. Apple app linkage/credentials, native-device purchase checks, refunds/reconciliation and production enablement remain outstanding. The native build hold remains in effect.

## Buy Coins card design — 2026-09-15

User reports that the existing Android test build looks good; iOS still needs a rebuilt TestFlight app for testing. This is user-confirmed feedback before the following visual change, not a completed device check of the new design or every purchase case.

- The shared Buy Coins page and gift-drawer purchase sheet use **three columns and three rows** for the nine approved packs, in ascending coin order.
- Reference: the user-provided `downloads/Screenshot 2026-09-14 at 11.52.51 PM.png`. Use Pulse's dark surfaces, pink accents and rounded cards.
- Each card shows gold vector coin artwork, the centered coin amount, then the localized store price **in white beneath the amount**.
- Follow-up correction: make the card coin artwork smaller. Artwork is now 32 points, with compact 124-point minimum-height cards; text may expand the cards for localized prices/accessibility scaling.
- Preserve the approved nine product IDs, amounts and prices, RevenueCat checkout, pending-purchase recovery, disabled states, and the shared page/sheet navigation. Purchase prices remain supplied by RevenueCat.

Implementation: `artifacts/mobile/components/CoinStoreContent.tsx`. Type/localization checks are separate from visual/device checks. The temporary browser preview could not launch because its runtime lacks a required system library; no browser or native appearance verification is claimed. Device check: three cards per row, small coin artwork, white prices below amounts, scrolling, long localized prices, large text, and return to gifts without losing the live/chat or selected recipient. No EAS/CLI/environment settings were changed for this design task.

**Refresh placement correction:** In both the Buy Coins page and gift purchase sheet, use a refresh icon at the top right of the header and remove the full-width Refresh button. Retain its accessible Refresh label and the existing refresh of customer information/offerings, coin catalog and wallet balance, including disabled behavior while busy or signed out.
