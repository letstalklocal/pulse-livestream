# Combined purchase test build

User decision, September 20, 2026: builds cost money. Gather all known app changes and configuration checks before the next Replit Publish iOS build. Do not start a build on the user's behalf. TestFlight keeps the production Pulse API. Do not promise device success based on automated checks.

## Include together

- Bundled public Apple SDK key and iOS store mode; verify installed build number/source revision before troubleshooting. Never put server credentials in mobile configuration.
- Separate iOS/Android purchase-mode settings; Android development still uses RevenueCat Test Store.
- Apple sandbox coin readiness fix: store SDK does not imply production payment environment.
- Three compact VIP cards, current-plan Active label, approved gold buttons and period formatting.
- VIP Manage purchases opens options first: direct store management/cancellation, restore, and iOS refund request. No reason survey before management options.

## Backend and RevenueCat before paying for another build

- [ ] Publish updated API with temporary VIP sandbox helper and sandbox coin readiness; required VIP/audit tables must exist in production.
- [ ] Production server settings: REVENUECAT_ENVIRONMENT=SANDBOX, Apple app app1937357464 allowed, valid webhook authorization and RevenueCat read secret. These settings were not all independently verified in production.
- [ ] Confirm authenticated sandbox delivery to https://chimbalivestream.replit.app/api/purchases/revenuecat/webhook for all required events. Preserve development delivery for Android testing.
- [ ] Confirm production authenticated coin catalog reports enabled and the nine expected products. Use the signed-in account; do not add an authentication bypass.
- [x] Provider-originated coin retry receipt reported by other Codex: September 21, 04:51:37 UTC, attempt 4 of 6, HTTP 200 / received:true, event bf9707d5-fb1d-4794-9f82-93be11e10ee6.
- [ ] Verify production ledger contains exactly one +250 credit for transaction 2000001239337842; fresh first-delivery success and VIP webhook evidence remain separate.

## Run on the same installed build

- [ ] Record TestFlight build number and Pulse test account. Apple monthly purchase and follower-list unlock were user-confirmed in a prior build; cancellation was also user-confirmed. Exact expiry and production webhook evidence remain pending.
- [ ] Check all three VIP localized prices and all nine coin prices from Apple, no hardcoded billing prices.
- [ ] Monthly: Apple sheet, success, Active card and other-user followers/following access. Pending/cancelled/failed checkout must not grant access.
- [ ] Manage options open before questions. Open Apple controls, confirm cancellation, verify access persists through current period and disappears only on expiry.
- [ ] Restore on the same store/Pulse account. Check return-to-app status refresh and account switching does not retain another account's entitlement.
- [ ] Renewal event extends access; expiration removes it. Standard TestFlight timing can run daily for several days; use provider timestamps rather than assuming the earlier Test Store minute-based timing.
- [ ] Yearly then lifetime: use separate test accounts/store purchase histories or wait for earlier entitlement expiry because active VIP intentionally disables additional purchases. Test lifetime last; it does not auto-expire. Verify refund request opens Apple UI and reports submission, never assume approval.
- [ ] Coins: start with 250, record starting balance, complete Apple sandbox purchase, verify +250 and one ledger credit. Reopen/retry/network interruption must not duplicate credit. Then exercise the other eight products in the same build.
- [ ] Cancel a coin purchase: no wallet credit. Pending fulfillment stays visible and prevents accidental repurchase. Account switching hides another user's pending state.
- [ ] Android development: Test Store coin popup still works, correct credit, shared Apple mode does not disable it.
- [ ] Check compact VIP layout, large text, translations, status messages, and management/refund sheet return behavior on device.

## Release rollback

Follow both temporary override rollback sections in revenuecat-integration.md. Keep the Apple public SDK key/store mode and the corrected mobile coin readiness logic. Do not roll back those permanent fixes. Test wallet credits and any resulting gift earnings need reconciliation before real payout operation; these changes do not create a separate test wallet. Real coin payments remain blocked and require their own launch work.


### September 21 — native history labels

User confirmed Apple already shows pack names and chose to keep the existing RevenueCat SDK/UI 10.9.1 rather than add a Test Store workaround. Proposed 10.10.0 update reverted; no custom history screen. Google Play product-name display remains a future device-test item. No extra build for this history decision. User confirmed Android rolling balance animation looks good; iPhone and Reduced Motion remain unverified.
