# Pulse VIP — coin purchases and gifting

## Purchase screen design — September 20, 2026

**Latest management flow correction:** user successfully reached Apple's controls and cancelled renewal, but rejects being asked a reason before seeing management options. The VIP screen now opens a native options menu: Manage subscription, Restore purchases, Request refund (iOS App Store entitlement only), Close. Manage subscription calls Apple's native subscription-management sheet directly; other platforms use RevenueCat's managementURL. Refund calls Apple's refund-request sheet directly for the current VIP entitlement and reports submission only, never approval. Existing serialized account guards, cache refresh and provider-owned status remain. This supersedes the earlier decision to send VIP Manage purchases directly to Customer Center. Other screens' existing Customer Center entry remains unchanged. No cancellation survey was added to Pulse. New native menu/sheet presentation and refund behavior require device verification.

Purchased-plan indicator: match the active RevenueCat `pulse_pro` entitlement productIdentifier to the plan product ID. That card gets a gold border and an Active status in place of Buy. Do not infer activation from a tap or a success notice; require account-scoped confirmed active entitlement. Existing active-VIP purchase guards remain. Active is localized across all ten languages. Device verification remains pending.

Latest purchase utility correction: only Manage purchases and Refresh appear on the VIP screen. Remove the standalone Restore purchases button. Manage purchases continues to open RevenueCat Customer Center, which provides purchase restoration (https://www.revenuecat.com/docs/tools/customer-center). Use that existing restore option inside management rather than an extra Pulse restore button or intermediate menu. Customer Center restore visibility and operation still require device verification with the configured RevenueCat project. This supersedes the earlier reorder request.

Latest user correction: removed the decorative icons from all three purchase cards; retain plan titles, prices, periods and Buy buttons. The hero diamond is unchanged.

Latest refinement: show store price without a slash, followed by capitalized Month / Year / Once on its own line; Once is translated in all ten catalogs. Buy buttons use a deeper warm gold fill (`#C9A24D`) and darker gold border (`#B78B35`); the user rejected `#FFD700` as too yellow. They use and the full available card width with a shorter 30-point visual height, 13-point text and 7 points of extra vertical touch area (latest user correction).

**Latest user correction:** display all three store plans as equal-width cards in one horizontal row, like the coin cards, rather than stacked full-width cards. Implemented a compact hero and smaller centered plan icons/titles/prices with aligned gold Buy actions. Omit repetitive store descriptions from the compact cards; retain product titles and localized prices including billing period/one-time wording. Keep vertical scrolling available for small devices and larger accessibility text, but no horizontal scrolling for plan selection. Device appearance remains unverified.

User requested a nicer Pulse VIP purchase screen. Updated `artifacts/mobile/app/subscriptions.tsx` with a dark gold-gradient membership panel, diamond emblem, larger Pulse VIP title, approved followers/following benefit, active badge and renewal/expiry text. Product cards now have duration-related icons, stronger price hierarchy, subtle dividers and gold Buy buttons. Restore/manage remain available below the plans, with a quieter Refresh action. Prices/titles/descriptions still come from RevenueCat; existing translations, purchase handlers, busy/active guards and account-scoped notices are preserved. No new benefits, pricing or purchase backend behavior were introduced. Phone appearance and touch behavior still require device verification.

## Scope update — September 20, 2026

User explicitly deferred coin-funded VIP self-purchases and gifting, including the Gift VIP profile action and stacking implementation. Preserve the approved coin prices and design below for later; this work is not the next task or a blocker for the current direct-store VIP launch scope. Admin grants and the streamer's VIP-buyer recognition list also remain deferred. Direct-store VIP and real Apple sandbox validation remain in scope.


## Approved decisions — September 19, 2026

- Display name: **Pulse VIP**. Existing internal `pulse_pro` identifiers must not be renamed without a migration plan.
- Users may buy VIP for themselves with spendable wallet coins or gift VIP to a streamer.
- Add a **Gift VIP** badge/action to streamer profiles. Preserve the existing profile layout and unrelated actions.
- Reuse existing RevenueCat coin packs. No separate cash gift products are needed for this model.
- One-month and one-year coin purchases provide fixed periods of access and do not auto-renew. Lifetime provides permanent access.
- Paid periods stack. Two users gifting one month each add two months to the recipient's VIP; self-purchases use the same extension behavior.
- Coins pay Pulse for VIP access. The recipient receives no coin credit or withdrawable earnings. These transactions must not count as ordinary gifts, Premium entry, battle scores, or stream gift earnings.
- VIP does not replace verification, mature-content preferences, or Premium live admission. The first approved test benefit is viewing other users' followers/following lists; further benefits remain undefined.
- Preserve the approved personal store launch pricing and Apple return policy in [RevenueCat integration](revenuecat-integration.md). Do not silently remove existing subscription purchase, restore, or management flows.

## Confirmed coin pricing — September 19, 2026

| VIP duration | Coin cost |
| --- | ---: |
| One month | 2,000 |
| One year | 15,000 |
| Lifetime | 20,000 |

User explicitly approved these amounts for both self-purchases and gifts. Apply the same catalog to self-purchases and gifts. Do not infer a fixed dollar-to-coin conversion: the existing packs have different unit prices. Prices must be server-controlled; clients select a plan, never submit the authoritative cost or duration.

## Implementation plan

1. Add a durable VIP access record and purchase history linked to the coin ledger, recording buyer, recipient, plan, cost, and granted duration.
2. Fulfill authenticated purchases atomically: validate recipient and contact restrictions, debit only the caller's wallet if sufficient, record the transaction, and extend access together. No partial debit or recipient wallet credit.
3. Serialize updates for the same recipient so simultaneous gifts cannot overwrite each other's time. Extend from the later of current time or existing VIP expiration; use calendar-month/year arithmetic with end-of-month clamping. This date arithmetic is an implementation proposal, not an already tested behavior.
4. Require an idempotency key scoped to the buyer and bound to recipient and plan. Retries must neither charge twice nor extend twice. Preserve a pending purchase across uncertain network responses and reconcile before allowing a fresh charge.
5. Reject a paid gift or self-purchase for an already lifetime-VIP account before debit. Show a clear explanation. Determine handling of existing auto-renewing store subscriptions before enabling overlapping coin purchases; receiving a coin gift does not cancel Apple billing.
6. Show server-authoritative VIP status and expiration on the purchase screen and profile. Add a profile Gift VIP action with recipient and cost confirmation, plus self-purchase access from the VIP screen. Keep existing wallet top-up behavior and translate new UI into all ten supported languages.
7. Link any refund/reversal to the original buyer and grant; preserve independently purchased or gifted periods. Coin-source refund reconciliation remains a launch dependency. Do not assume a RevenueCat coin purchase automatically grants VIP to the recipient.

## Required verification

- Self-purchase and gift each debit once; recipient wallet and creator earnings remain unchanged.
- Two simultaneous one-month gifts produce two months of access, including from different buyers.
- Retried requests and process/network interruptions do not duplicate debits or time; reuse for a different recipient or plan is rejected.
- Insufficient funds, invalid recipients, blocked contact, unauthorized callers, and lifetime recipients cause no debit or grant.
- Expired/active access, month-end/leap-year boundaries, annual access, and lifetime access behave correctly.
- Account switching cannot display or spend another account's pending purchase.
- Existing store subscriptions, cancellation, restore, and gifts do not cause unnoticed overlapping billing.
- Rebuild/restart and verify changed endpoints on the running development API after backend implementation. Automated tests and actual iPhone/Android checks must be reported separately.

## Later feature: buyer recognition in the streamer's VIP list

User decision — September 19, 2026: when someone gifts VIP to a streamer, the buyer will also be listed as a VIP for that streamer for the duration they purchased. This feature is explicitly deferred; do not implement it as part of the initial coin-funded VIP purchase flow.

Recognition is associated with the specific buyer and streamer. This decision does not grant the buyer platform-wide Pulse VIP access. Retain buyer, recipient, plan, duration, and purchase timestamps in purchase history so the later feature can be supported. Listing placement, when recognition starts for queued/stacked gifts, and repeated-gift recognition behavior will be designed in that later phase.

## First VIP benefit and stored access — September 19, 2026

User approved viewing other users' followers and following lists as the initial VIP benefit. Owners retain free access to their own lists; other non-VIP users remain restricted. Existing account blocks still apply, and blocked entries are filtered from returned lists. This supersedes the earlier owner-only restriction for active VIP viewers.

The mobile profile enables its existing list controls using RevenueCat CustomerInfo's active `pulse_pro` entitlement. Connection queries are scoped by viewer and VIP state, disabled without access, and hide cached results on access loss or request error. The VIP screen describes the benefit; new copy is translated in all ten catalogs.

**Final architecture decision:** the user rejected a RevenueCat API check whenever a list opens. That implementation was replaced. `hasVipAccess` now reads only Pulse's `vip_store_access` table, with a server-owned active flag, expiration, environment and last synchronization time. Owners need no VIP lookup. Expired access is denied locally even if an expiration webhook is late; lifetime has no expiration. Clients cannot write this status.

The existing authenticated `/api/purchases/revenuecat/webhook` now handles VIP lifecycle events and transfers separately from coin credits. Upon a valid event, the server refreshes authoritative current subscription/lifetime state from RevenueCat and saves it under a per-user transaction lock. Duplicate or delayed events therefore do not replay old flags or extend time. Cancellation retains paid access; expiry/refund removes access according to current provider state. Failed synchronization returns a non-success response for provider retry. No VIP event credits wallet coins.

Authenticated `POST /api/purchases/vip/sync` provides account-bound catch-up at login/entitlement changes, purchase and restore. It accepts no client access, expiry or target-account claim, and throttles repeated checks for a recently synchronized account. The native provider invokes it without turning a successful store purchase into a failed charge when synchronization is unavailable. Background reconciliation uses bounded batches for missed events and expiring access. RevenueCat-confirmed grace access uses a short renewable lease; provider failure cannot turn it into permanent access. Feature reads never initiate provider requests.

Development uses sandbox records, production uses production records. Apply `lib/db/migrations/20260919_vip_store_access.sql` to each deployed database before running this version. The development migration was applied. Server configuration requires `REVENUECAT_API_V2_SECRET_KEY` with subscription/purchase read permissions, existing webhook authorization, and matching app/environment settings. Production coin fulfillment remains disabled pending its separate launch requirements.

RevenueCat webhook `whintgrdc2cdf5bb3` was updated and read back: sandbox environment, all event types, no provider-side app filter; server allowlist contains Test Store `app0722e3199f` and Apple `app1937357464`. It retains the existing development URL and authorization. A second webhook at the same URL was rejected as a duplicate, so one shared sandbox integration is used. This does not configure or deploy the production endpoint.

Verification: API/mobile typechecks and build passed; 13 route tests and 8 provider-snapshot tests passed. HTTP/database integration verifies webhook grants, list reads with zero provider calls, cancellation preserving paid access, concurrent/duplicate/out-of-order events, local expiry without a notification, lifetime/refund, failure/retry, caller and sandbox/production isolation, and no coin credit. Existing coin-purchase integration passed. All ten catalogs passed localization checks (968 keys). Fixtures were cleaned up. The final development API was rebuilt/restarted with its existing environment; health returned 200, both connection endpoints and VIP sync rejected unauthenticated requests with 401, and an authenticated webhook TEST returned 200. Native purchase-to-unlock and real provider lifecycle delivery for VIP remain untested; no store submission/release occurred.

Sources: [RevenueCat subscription status](https://www.revenuecat.com/docs/customers/customer-info), [webhooks](https://www.revenuecat.com/docs/integrations/webhooks).

## Profile VIP tap feedback — September 19, 2026

Implemented: when a VIP member taps Followers or Following on a profile, show **VIP Unlocked** in gold (`#FFD700`), centered directly above the tapped Followers or Following count, floating upward 32 points and fading over 1,300 ms, then open the selected list. Ignore repeat taps during this transition. Leaving the screen cancels pending animation/navigation. Reduced Motion uses the brief fade without upward travel. Own-list access for non-VIP users remains immediate. New copy is included in all ten catalogs. User confirmed the updated gold, count-anchored, slower animation worked on September 20, 2026. Device platform was not specified; this confirms the reported interaction only, not both platforms, Reduced Motion or subscription lifecycle tests.

Deferred by user: add the same brief upward feedback for locked access, with the exact text **VIP Locked** in **white**. No locked feedback was implemented in this change.

## Planned admin VIP grants — September 19, 2026

User requested the ability to activate VIP from the admin without charging coins or requiring a RevenueCat purchase. Add a separately recorded admin grant with recipient, validity/expiry (or explicit lifetime), granting admin, reason and audit timestamps; support revocation of that grant. Restrict grant/revoke actions to authorized administrators.

Do not implement this as an edit to the RevenueCat-owned `vip_store_access` row: future provider updates must not erase an admin grant, and revoking an admin grant must not erase independently paid access. Effective access should combine valid store, coin and admin grants. Both mobile access presentation and backend checks must reflect that effective access when implemented. This capability is planned; no admin grant button, endpoint, or manual-access source is implemented yet.

## Status

Approved requirements and implementation plan recorded. Existing wallet/VIP code inspected. Coin-funded VIP endpoints, profile badge, access grants, and app UI remain unimplemented. Personal Apple VIP products have now been reported saved/reopened, and RevenueCat mappings are configured; see [store handoff and remaining verification](revenuecat-integration.md#apple-vip-saved-product-handoff--september-19-2026). Coin prices are confirmed above. Coin-funded VIP implementation is explicitly deferred by the September 20 scope decision. The first personal-subscription VIP benefit is implemented for testing as recorded above.


## Sandbox lifecycle evidence — September 20, 2026

RevenueCat history confirms two monthly Test Store purchase cycles with four renewals each and expiration for each. The latest provider expiry (00:29:40.109 UTC) matches Pulse's inactive stored VIP record. User reported VIP disappearing. This verifies provider renewal/expiration and matching final server status; historical webhook receipts and intermediate server expiry changes cannot be recovered from the missing transient API log. Persistent authenticated webhook attempt logs are now implemented and verified through the public dev endpoint. See [full evidence and log query](revenuecat-integration.md#persistent-webhook-logs-and-verified-sandbox-history--september-20-2026). Apple sandbox, refund and restore device tests remain separate.

## Settings label — September 21, 2026

User requested renaming the Settings item from **Pulse Pro** to **Pulse VIP**. The label is Pulse VIP in all ten interface catalogs and continues to open `/subscriptions`. Store products, entitlement identifiers and purchase behavior are unchanged.

## Invisible viewing and Premium incognito — September 21, 2026

See [agreed behavior and completion tracker](incognito.md). VIP invisible viewing hides passive viewer entries while retaining the count and real-name chat/gifts. Premium incognito is a separate session identity available to everyone when allowed by the streamer; it masks names/photos/profile access, preserves the entry choice and alias through rejoin, and groups gifter stats into one Incognito total. Preserve these requirements in future viewer, gift, statistics and notification changes. Automated and Android/iPhone verification are tracked separately there.
