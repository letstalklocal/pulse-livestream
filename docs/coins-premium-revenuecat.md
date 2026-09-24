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
- **Durable requirement (user reaffirmed 2026-09-24):** Every new or changed native/iOS coin affordance, balance, price, earnings total, or gift-cost display must use the shared explicit-gold `GoldCoinIcon`, never the system `🪙` emoji. This avoids Apple rendering it as a non-gold/white glyph. Preserve existing approved exceptions only until they are deliberately converted; do not introduce further emoji coin usage.
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

- While Premium is active, the host's former lock position shows a gift icon. The Premium control remains visible in Party mode; activating it applies the same entry requirement to every current Party feed.
- Host selects a gift and **30 or 60 seconds**, default **30**. Only one request runs at a time; reopening shows remaining time and paid/targeted counts.
- Current admitted viewers, including free-entry viewers, are targeted. Later arrivals follow existing admission rules rather than joining a prior request retroactively.
- Viewers see the gift, coin cost, countdown, and **Send Gift**. At ten seconds or less the countdown blinks; Reduced Motion uses steady warning styling. Payment hides the requirement. Insufficient coins produces an error without a charge or request clearance.
- The server saves the gift/cost/deadline and atomically debits the viewer, credits the host, writes a `gift` ledger transaction, and records payment. Retries cannot charge the same viewer twice for the same request. The client updates the wallet balance from the payment response and refreshes request/access state.
- Unpaid viewers lose access at expiry. Server checks enforce this independently of the display timer. Successful Agora individual removal preserves the host and remaining viewers' media connection; existing media-channel rotation is the fallback. Remove, Block, and Allow Back retain their existing meanings.
- Payments retain the existing earnings, animation, and live-chat gift-notice path. The separate floating sender/gift-name box was removed elsewhere; the chat notice and gift animation remain.

Current gift costs: Rose 1, Heart 5, Party 10, Diamond 50, Rocket 100, Crown 500 coins. Admission price, timed requests, and ordinary gifts retain their separate records and payment actions.

### Party-wide Premium admission

When either current Party host activates Premium, every current Party stream receives the same admission gift requirement. A viewer pays once and is admitted to the entire Party. The payment is credited in full to the streamer the viewer is watching when they pay; it is not split. The access receipt is recorded for each current Party stream so Agora, chat, and stream detail checks authorize the complete Party.

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

## Premium conversion viewer reconnect — 2026-09-16

User reported an iPhone viewer paying after a streamer converts an ongoing public live to Premium, then seeing a blank screen until exiting/re-entering. Expected behavior: keep the same durable live session and viewer page; after admission, reconnect automatically without another payment or manual navigation. Conversion rotates the underlying Agora media channel to prevent continued public-channel access by unpaid viewers. This is not merely an overlay over the existing public video connection. A brief connection/loading state is possible; a persistent blank screen is a defect. The user was informed of and accepted this distinction.

Code inspection identified a concrete lifecycle race: the installed Agora SDK returns a singleton engine wrapper. Viewer effect cleanup released the engine but retained its old setup closure's engine handle. A late token response or rejection from that retired attempt could therefore pass the object-identity ownership check and release the replacement Premium engine. Cleanup now nulls the attempt-local handle before leaving/releasing; late completions cannot release the new connection. Access loss also resets joined/remote-UID/video-readiness state before the admission wait. No admission prices, payment rules, durable session identity, API endpoints, channel rotation, or host publishing behavior changed.

Four mocked regression tests in `artifacts/api-server/tests/viewer-premium-reconnect.test.mjs` cover late token success, late token failure, blocked-access rendering reset/no join, and current-failure cleanup. These establish the code race and cleanup behavior, not native iPhone playback or proof that this was the sole cause of the reported blank screen. Device test still required: public host converts; unpaid viewer cannot watch; viewer pays once; host audio/video resumes in the same screen; leaving/re-entering does not charge again for that session. Also check an already-admitted/free-entry viewer, slow token responses and Android.


## Host/viewer live-counter appearance — September 16, 2026

User prefers the viewer's combined coins/viewers pill and requested it on the broadcaster screen too. The host now uses one translucent black rounded pill with coins, a thin divider and the eye/count, matching the viewer's padding, radius, typography and icon sizes. This initial layout retained separate actions; the later unified Live Viewers decision below supersedes that split. Counts and earnings retain their existing sources/formatting. This is a header appearance change; broadcaster keyboard/composer and top/bottom dock anchoring are unchanged.

Mobile typecheck and diff-format checks cover the code change; visual alignment and both tap actions still need phone verification. No build or deployment was started.


## Unified Live Viewers sheet — September 16, 2026

User requested merging Top Gifters and viewers into one list titled **Live Viewers**. Search starts hidden; a search icon at the far right of the title row opens/focuses the **Search viewers** field. Tapping it again hides the field, clears the filter and dismisses its keyboard. Latest streamer correction: the close X is at the far right of the title row, with search immediately before it when showing the list. The audience layout keeps its existing left-side close and far-right search. Backdrop/Android Back also close the sheet, retaining the pending-moderation guard.

Approved visibility decision after discussing TikTok: the streamer sees the full viewer list with gift totals and moderation; audience members see gift rankings only, with the same title/search design. Do not expose the host roster or restriction state to ordinary viewers. TikTok's exact ordinary-viewer roster visibility was not established by its official help and is not the basis for a claim of feature parity.

Both parts of the broadcaster's combined counter now open the same shared sheet. The host list merges current viewers with the existing top-ten gift ranking by UID, sorts gift contributors first, and preserves avatars/current names and moderation flags. Departed contributors remain listed as **Not watching**, preserving existing gift totals without falsely treating them as present. Restricted contributors remain in the host's Restricted tab. Gift ranking medals/numbers and coin totals are retained. Non-gifting current viewers remain visible. Current leaderboard limits and ledger calculations are unchanged; this is not an all-gifters backend expansion.

The audience sheet requests only the existing gift-ranking endpoint, ignores any cached host-roster data, omits presence/moderation state, and opens profiles on row taps. Host rows retain mute/unmute/remove/allow/block/unblock actions and existing confirmation/server checks. In the selected-viewer panel, the avatar now opens that viewer’s profile and closes the sheet; the separate View profile and Back to viewers text actions were removed at the user’s request. The close X still closes the whole sheet. Private-invitation hosts retain ranking-only access in this UI because those moderation controls were already unavailable there. No API access rules or backend behavior changed.

Implementation: `LiveViewersSheet.tsx`, the audience `GiftLeaderboard.tsx` wrapper, `utils/liveViewerList.ts`, and the host counter entry point. New labels are included in all ten interface catalogs. Automated checks cover UID deduplication, gift order, departed status, flag/identity preservation, search expansion/filter/reset, host moderation dispatch, and audience isolation even when the query cache contains a host roster. Mobile typecheck, both dedicated list/sheet tests, all ten localization catalogs (837 keys) and diff formatting checks passed. The older localization structure guard was updated narrowly for the already-approved viewer header additions and replacement of the old sheets; the dedicated sheet test verifies the new behavior. Native search keyboard, touch, scrolling and modal behavior still require iPhone/Android checks. No build/deployment started.


Live Viewers auto-close requirement: close the list after 10 seconds without interaction on both host and audience. Touch, search edits and scrolling reset the deadline. Pause it in the selected-viewer moderation panel and during pending moderation; cancel it when the sheet unmounts. See [mandatory stream regression checks](stream-screen-regressions.md).


## Pulse VIP coin purchases and gifting — September 19, 2026

Approved: buy VIP for yourself or gift it to streamers using wallet coins, with a **Gift VIP** profile badge/action and additive paid time (two one-month gifts add two months). VIP purchases pay Pulse and must not credit streamer coins/earnings or enter ordinary gift scoring. Coin purchases do not auto-renew. Reuse existing coin packs instead of adding separate cash gift products. Confirmed VIP prices for self-purchases and gifts: **2,000 coins/month of access**, **15,000 coins/year of access**, and **20,000 coins/lifetime**; all are one-time coin charges. See [approved decisions, implementation plan, and verification requirements](pulse-vip.md). This is recorded scope, not implemented functionality.

## Live sticker purchases — September 21, 2026

User approved attributing a live sticker's pack purchase to that live's earnings and Top Gifters. The original pack ledger entry carries the durable channel ID; the buyer pays once and the creator is credited once. Existing ownership/View pack and separate DM purchases never add live credit. Gift stickers reuse normal gifting. Premium entry, timed requests, coin-store billing and RevenueCat remain separate. See [implementation and regression cases](live-stickers.md).

Media packs now use the selected gift’s catalog coin price for creation and edits. The sticker shows that price, and current live/DM purchases reject a changed price before charging. Existing purchases and historical amounts remain unchanged. See [pack editing and gift-based pricing](live-stickers.md).

## Invisible viewing and Premium incognito — September 21, 2026

See [agreed behavior and completion tracker](incognito.md). VIP invisible viewing hides passive viewer entries while retaining the count and real-name chat/gifts. Premium incognito is a separate session identity available to everyone when allowed by the streamer; it masks names/photos/profile access, preserves the entry choice and alias through rejoin, and groups gifter stats into one Incognito total. Preserve these requirements in future viewer, gift, statistics and notification changes. Automated and Android/iPhone verification are tracked separately there.

## Rose gift artwork — September 23, 2026

User supplied `downloads/gifts/rose.png` as the replacement Rose art. An identical transparent PNG is bundled at `artifacts/mobile/assets/gifts/rose.png`; `RoseArtwork` uses contained sizing in gift pickers, floating gifts, live/video stickers, pack gift selection, private invitation selection and Premium gift displays. Rose remains the same gift ID and one-coin price; text receipts and reaction emojis retain their existing text.

Mobile types, localization, gift preview/pack checks and 19 of 20 required stream scripts pass. The existing media-pack-message test fails because its mock list omits `DirectVideoThumbnail`, already imported by the unchanged component in HEAD; this is separate from the rose change. Android/iPhone visual sizing remains unverified. No backend, dependency or native build change.

## Heart, Lips and Strawberry gifts — September 23, 2026

User-approved additions: **Lips costs 99 coins; Strawberry costs 49 coins**. Heart retains its existing ID and 5-coin price, with replacement artwork from `downloads/gifts/heart.png`. The supplied Lips and Strawberry files are bundled unchanged. `GiftImageArtwork` renders all four supplied gifts consistently in pickers, floating gifts, live/video stickers, pack selection, private invitation selection and Premium displays. Crown retains its existing artwork/effect. Existing text receipts and free reaction emojis are preserved.

Mobile/server catalogs and OpenAPI/generated validators now accept `lips` and `strawberry`. Real-database tests verify exact 99/49 video gift debit and creator credit, retry deduplication, and gift-derived pack pricing (including unchanged Heart price). Workspace types, API build, localization for all ten languages, gift preview and sticker regressions pass. The required stream scripts pass 19/20; the unchanged media-pack-message harness still lacks its existing DirectVideoThumbnail mock. Android/iPhone appearance remains pending. Development API rebuilt/restarted preserving its environment; health returns 200 and running video-gift/pack endpoints reject unauthenticated requests with 401. Authenticated price checks use the actual router/database with temporary accounts. No production publication or native build was started.

## Larger floating gifts and winner-style pop-in — September 23, 2026

User requested doubling the live gift display and matching the battle winner pop-in. The shared floating gift renderer now uses 180-point art/font with a 220-point image/line box (previously 90/110). Its entrance follows the winner's scale sequence: 0.35 → 1.6 over 320 ms with cubic ease-out, then settles to 1 over 650 ms with cubic ease-in/out. The existing hold, upward exit and fade remain; unmount stops the animation. The shared video gift preview uses this renderer too. This changes floating gift presentation, not picker/sticker dimensions or the native Crown camera effect.

Android/iPhone visual confirmation remains pending. Automated mobile types and gift/stream regression results are recorded separately from device behavior; the existing media-pack-message mock failure remains unrelated.

Latest user refinement: reduce the floating gift entrance peak from 1.6× to 1.25× to avoid excessive enlargement and visible blur. Retain the doubled settled size, entrance timing, hold and exit. Device appearance remains pending.


## Keep the gift sheet open — September 23, 2026

User requested that sending a gift leave the sheet open until tapping outside or explicitly dismissing it. Applied to live streams, uploaded videos, the video prototype, DMs and posts. Post gifts no longer replace the picker with the comments sheet after sending; activity/comments still refresh. Live and DM sends use an immediate in-flight guard, then allow another deliberate send after completion. Existing video/post guards, coin updates, idempotency keys, animations, error reporting and screen-exit cleanup remain.

Mobile types, localization and focused live/post/picker tests pass (successful/failed sends preserve the sheet; concurrent taps are guarded; wallet updates and subsequent sends work; backdrop dismisses). The required stream checks pass except the existing media-pack-message DirectVideoThumbnail mock failure. Android/iPhone modal touches, repeated sending, animation visibility behind the open sheet and navigation/keyboard/awake checks remain device-pending. No backend change or native build.

## Four-column gift drawer with Send controls — September 23, 2026

User requested a TikTok-style layout defined as four gifts per row, vertical scrolling and three visible rows, with Send text below each gift to prevent accidental sending. The shared drawer now renders four equal-width cells per row in a vertical scroll area sized for three 144-point rows. The current eight gifts fill two rows; no placeholder gifts are introduced. Short screens can shrink the scroll area to preserve the header, dismissal area and safe-area spacing.

Artwork, name and price are display-only; each gift has its own Send button. Unaffordable sends are disabled, and normal balance/purchase behavior, party recipient selection, preview-only mode and stay-open-after-send behavior are preserved. Sending instructions now say “Tap Send below a gift.” in all ten languages. User's spacing refinement: reduce the header/grid gap to 8 points, remove top cell padding, and top-align artwork in its slot.

Drawer tests exercise explicit Send actions, non-interactive cards, affordability, four-column/three-row geometry, vertical scrolling configuration, continued opening after send and backdrop dismissal. Android/iPhone actual scrolling, three-row fit, touch targets, large text, artwork spacing and visibility remain device-pending; mocked layout checks are not screenshots. No backend or native dependency change.

Latest drawer sizing refinement: gift names use 10-point text with a 12-point line height, artwork slots shrink from 48 to 44 points and inter-item gaps to 1 point. Send buttons shrink from 40 to 28 points high. Rows shrink to 124 points and the viewport remains three rows tall. This preserves explicit Send-only behavior and the four-column layout. Phone visual verification remains pending.

Latest user correction: the drawer was opening too tall. Fit its grid viewport to the available rows, capped at three; eight gifts therefore open with two rows (248 points) and no reserved empty third row. This supersedes the fixed three-row viewport while preserving vertical scrolling for future gifts.

## Gift selection and transparent backdrop — September 23, 2026

User refinement: tap a gift to select it, show a border, then enable Send. The artwork/name/price area now selects only; a pink border and subtle fill identify the selection. Only that gift's Send button is enabled when affordable (preview mode keeps its no-charge rules). Sending preserves the selection and open sheet for repeated gifts; closing/reopening clears the selection. The instruction is “Select a gift, then tap Send.” across all ten languages.

User also rejected the screen darkening behind the drawer. Its outside touch surface is now fully transparent and still dismisses on tap; the drawer itself retains its dark background. Selection tests cover no send on select, one active affordable Send, border styling, switching gifts, reopening reset, preview/payment isolation, continued open state and transparent backdrop. Android/iPhone appearance and touch confirmation remain pending.

Latest user height requirement: the gift drawer occupies no more than one-third of the screen. Its outer sheet is capped at 33% including its padding/safe-area space; the gift scroll area shrinks within that cap. Four columns, selection, explicit Send and transparent tap-to-dismiss backdrop remain. This supersedes the previous available-row height when it exceeds the cap. The separate Buy Coins purchase screen retains its existing layout. Phone sizing and scrolling verification remain pending.

Latest explicit height adjustment: increase the gift drawer cap from 33% to **40%** of screen height. This supersedes the one-third limit; internal scrolling and all selection/send behavior remain.

Latest drawer header refinement: remove the coin balance pill background, rounded box, horizontal padding and 44-point minimum height. Keep a compact tappable icon/count with extra invisible touch space for Buy Coins. Reduce the top padding to 6 points and handle-to-header gap to 6 points. The 40% drawer cap remains.

Latest gift-container refinement: remove fixed cell height and bottom padding so the selected border wraps the content and ends directly below Send. Keep the 8-point row separation outside the containers; the scroll viewport now has a maximum instead of a forced height, still inside the 40% drawer cap. Phone layout confirmation remains pending.

Latest Send button appearance: use the app pink (`#FF1966`) background and white text. Keep disabled buttons dimmed until the selected gift is affordable.

Latest Send button sizing: reduce its minimum height from 28 to 24 points, retaining app pink, white text and content-fitting gift borders.

Latest button geometry: Send spans the full gift-container width with square top corners. The container clips its lower corners to the shared 12-point radius; horizontal padding applies only to the gift selection area. The 24-point button height remains.

Latest drawer header: replace “Send a Gift” with **Popular** and move the coin counter 8 points higher. Popular is the current category label; additional gift-category tabs are a planned follow-up, not implemented in this change. Preserve the compact 40% drawer and Buy Coins action.

Latest category-label size: reduce Popular from 18 to 14 points.

Latest header alignment: align Popular and the coin counter in the same centered row, shifted up 4 points. This raises Popular 4 points and lowers the previously raised coins 4 points.

Latest footer refinement: remove the ordinary “Select a gift, then tap Send.” instruction and its text row; the user considers the selection/Send flow intuitive. Preserve preview-only and pending-send status messages.

Latest Send sizing: reduce button minimum height from 24 to 20 points and label font from 12 to 10 points. Preserve the full-width pink button, white text and square top corners.

Latest gift picker artwork sizing: Heart and Lips use 36-point artwork. Match Crown and Diamond to 36 points; Party already uses 36. Rocket remains 40. This is drawer artwork sizing, not floating gift or native Crown effect sizing.
