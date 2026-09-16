# Timed gifts during a Premium live

Shared change handoff: [coins, Premium gifts, and RevenueCat](coins-premium-revenuecat.md).

## Confirmed behavior

- In the streamer's live bottom bar, the existing lock position becomes a gift icon once Premium is active. The lock still opens the existing conversion flow on a public live.
- The gift icon opens a dedicated gift selector with 30 or 60 seconds; default is 30. The streamer can reopen it to see time remaining and how many viewers paid. Only one request runs at a time.
- The current admitted audience, including viewers granted free entry, must send the requested gift using the bottom prompt's **Send Gift** button to keep watching. Later arrivals use the existing entry flow and are not retroactively included in an earlier request.
- The bottom prompt shows the required gift, cost, countdown, and Send Gift. The countdown blinks once per second at 10 seconds or less. Reduced Motion uses a steady warning color.
- There is no coin-purchase flow in this window yet. Insufficient coins displays an error without charging or admitting the viewer. **Planned later (2026-09-15): add a quick refill directly in the timed request prompt, offering 500, 1,000, or 2,000 coins.** The user requested a note for future implementation; no refill UI or payment behavior has been added. Deadline/access changes were not requested.
- Paying hides the prompt. Unpaid viewers lose access at expiry. Existing viewer management still offers Remove, Block, and Allow Back. Allow Back can waive an expired request; it does not undo an independent Block.
- Entry price, previously granted free entry, ordinary gifts, DMs, private lives, party controls, chat composer, and keyboard dismissal remain separate.

## Implementation plan and result

1. Persist requests, deadlines, targeted viewers, and payment receipts. Implemented in the additive migration `lib/db/migrations/20260914_premium_gift_requests.sql` and its Drizzle schema.
2. Add authenticated request/status/payment endpoints. Implemented in `streams.ts` with payment/expiry work in `premiumGiftRequests.ts`.
3. Add the host selector and viewer bottom prompt. Implemented in dedicated components and `usePremiumGiftRequest.ts`; the existing Premium admission selector is unchanged.
4. Integrate expired viewers with existing moderation and prefer Agora individual removal. Implemented with saved Agora rule IDs for Allow Back.
5. Payment/access/moderation regressions and API rebuild completed. The new bundle passed a real HTTP smoke test on a temporary server. The restarted development API and live Agora rule creation/deletion have now been verified; the user has also confirmed the core gift/removal device test passes. See verification status below.

## API and enforcement

- `POST /api/streams/:channelId/gift-request`: host only; `{giftId, durationSeconds?: 30 | 60, idempotencyKey: UUID}`. Duration defaults to 30. Concurrent retries with the same key return the same request; another running request returns 409.
- `GET /api/streams/:channelId/gift-request`: signed-in caller gets their own requirement, payment state, server time, and removal state. The host also gets aggregate targeted/paid counts. Other viewers' identities/payment details are not exposed.
- `POST /api/streams/:channelId/gift-request/pay`: `{requestId: UUID, idempotencyKey: UUID}`. Uses the server's saved gift and price. Payment, host credit, ledger entry, and receipt are atomic. Repeat attempts cannot charge twice, including attempts with different keys. Expired, unrelated, blocked, and removed viewers cannot purchase access through this endpoint.
- Session-row locking serializes request creation, payment, expiry, and manual moderation. Wallets are locked in UID order. Entry admissions are not overwritten.
- A one-second server worker settles saved deadlines; request/token paths also settle due work. Requests survive API restarts. Server access checks reject unpaid expired participants independently of client timers or websocket delivery.
- Successful payments use the existing earnings, gift animation, and gift-chat notification path. A notification failure does not roll back or repeat a committed charge.

## Agora individual removal

The API reads `AGORA_CUSTOMER_ID` and **`AGORA_SECRET`**, as named by the user. `AGORA_CUSTOMER_SECRET` is accepted as a fallback name. Keep `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` configured too; `SESSION_SECRET` is unrelated.

Manual removal/block and timed expiry use Agora's `join_channel` ban for a specific **media channel plus viewer UID**. The broadcast remains on its current media channel when individual removal succeeds. The 61-minute ban outlasts the app's current one-hour RTC tokens, preventing reuse of cached tokens. The app's durable access restriction lasts until the host allows re-entry (or the session ends). Saved rule IDs let Allow Back delete still-relevant bans; a failed delete leaves the restriction in place for retry.

Native removal uses at most four concurrent calls, with five-second request timeouts and a ten-second total batch budget. Missing credentials, provider failures, inability to save a rule, or an exceeded time budget fall back to the existing media-channel rotation. This fallback can briefly reconnect the host and retained viewers, but prevents an unpaid/removed viewer from continuing with an old token. No media change is needed when all targeted viewers have paid.

References: [Agora banning API](https://docs.agora.io/en/api-reference/api-ref/rtc/create-ban-rule), [delete rule](https://docs.agora.io/en/api-reference/api-ref/rtc/delete-ban-rule), [REST authentication](https://docs.agora.io/en/api-reference/api-ref/rtc/authentication), [failure-handling guidance](https://docs.agora.io/en/api-reference/api-ref/rtc/ban-user-privileges-best-practices).

## Verification and restart handoff

- Additive migration applied to the development database using the workspace's configured connection. An earlier attempt to read the running process's credentials was rejected by automatic approval review and was not used.
- Passed: API and mobile typechecks; API bundle build; patch formatting check.
- Passed: new integration suite in fallback and mocked-native modes; a fresh child process restored the same saved request, audience requirement, and deadline.
- Passed: existing `live-premium.integration.mjs` and `stream-moderation.integration.mjs`, plus all seven tests in `premium-broadcast-switch.test.mjs` and `live-heartbeat.test.mjs`. Existing suites ran without native Agora credentials so synthetic fixtures could not contact Agora.
- Passed: temporary running API on port 18089 served `/api/healthz`; the new status/create/pay endpoints returned the expected 401 authentication errors over real HTTP. That temporary process was stopped afterward. Authenticated payment/access coverage comes from integration tests using the actual handlers and database, not from a real signed-in phone.
- **Development API restart verified after the user restarted the session.** The existing development launcher is running the rebuilt API. Port 8080 served the expected health response, and the new status/create/pay endpoints returned their expected authentication errors over real HTTP. No manual replacement of the process environment was needed.
- New integration suite: `artifacts/api-server/tests/premium-gift-requests.integration.mjs`. Uses synthetic database users and cleans them up; no real coin balances are changed.
- Native mode: `TEST_AGORA_REMOVAL=1 node artifacts/api-server/tests/premium-gift-requests.integration.mjs`. Agora calls are mocked with synthetic credentials; this does not prove live Agora service behavior.
- Coverage: host/auth checks, default 30/selected 60, invalid gifts/durations, public/private rejection, concurrent create/payment retries, exact balances, insufficient coins, wrong participant/channel, grace-period access, deadline token/presence/chat access denial, lost-response retry after payment, preserved entry price/free list, late arrivals, subsequent rounds, restricted roster, Allow Back, native no-rotation behavior, provider failure fallback, and failed unban preserving restrictions.
- After the session restart, `AGORA_CUSTOMER_ID`, `AGORA_SECRET`, app ID, and app certificate are available. Agora’s read-only rule-list endpoint returned HTTP 200 / success. A viewer-specific `join_channel` ban was created on a unique, isolated test channel and then deleted successfully through the real Agora API. No real viewer was targeted and the test rule was cleaned up. This verifies credentials and create/delete permissions; this check alone does not verify device removal or re-entry; see the subsequent user confirmation below.
- Build timing follows the latest decision in [Apple / TestFlight fixes](apple-testflight-fixes.md); the September 15 approved test-build workflow supersedes the earlier hold. No build was started for this documentation update.

User device confirmation (2026-09-14): After reloading resolved an Android viewer’s Replit hostname lookup failure, the user confirmed subsequent live joins worked without issues. Following the requested test of an unpaid viewer being removed at the gift deadline, a paying viewer staying, and the broadcast continuing uninterrupted, the user reported “all works awesome.” This records the core flow as user-confirmed, not an independently observed device test. The exact device/build combination for the gift test was not specified; Apple-specific verification and the remaining edge cases below are still outstanding. The hostname failure’s cause remains unconfirmed.

Remaining detailed device checks: host converts a public live, sees the gift icon in the lock's position, selects 30 and 60 seconds, and starts a request. On two viewer devices, check bottom placement with the keyboard open/closed and overlays hidden, final-ten-second blink/reduced motion, insufficient coins, repeated Send taps, and payment near expiry. Confirm the payer stays, the nonpayer is removed, re-entry is denied, and Allow Back restores access. With live Agora credentials, verify the host and payer do not reconnect during successful native removal. Check background/resume and network reconnect against the saved deadline. Exercise manual Remove/Block/Allow Back as well as the existing entry-gift, free-entry, ordinary-gifting, and keyboard behavior.
