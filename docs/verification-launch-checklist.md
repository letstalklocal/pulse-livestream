# Verification launch checklist

> **Current decision (2026-09-13):** The user rejected returning to Pulse for an inconclusive selfie. The ID fallback and its explanation must stay inside one Didit session; only final success should trigger the automatic return to Pulse. The separate-session workaround has been rolled back. **The Didit decision tree and hosted messages are not yet configured or ready for retest.** See [the current decision-tree specification](didit-workflow-decision-tree.md). This supersedes earlier completion checkpoints below.


## Current result

The selfie result transition is implemented in the app and personal verification website. The initial sandbox workflow now contains **AGE_ESTIMATION only**, with automatic ID fallback disabled. A completed, accepted selfie returns to **You’re Verified**. A completed inconclusive age result returns to **One more step** and requires **Continue with ID** before a separate documentary session starts. Existing optional ID upgrades remain available to selfie-verified accounts.

Automated HTTP/database, native-component and website tests cover success, explicit fallback, review, stale callbacks and document-only acceptance. A real sandbox session created through the configured stable workflow ID confirms only AGE_ESTIMATION is selected. Actual phone capture/return with this revised workflow remains the next test; no real age-estimation success is implied by simulated evidence.

The latest audit reran the real HTTP/database tests with Didit responses mocked and the website's simulated-DOM tests: all passed. No phone capture or production verification is implied by those results. Earlier actual sandbox API checks proved session creation, resume and decision retrieval, not completed capture.

This is **not ready for live users yet**. The runtime is `sandbox`, both URLs use the development preview host, no separate live key is available to this session, privacy/terms remain drafts, and Premium/feed routes do not currently consult the verification state.

## Complete in this order

| Step | Work | Completion evidence |
| --- | --- | --- |
| 1. Final phone tests | Use a designated fresh test account for selfie success, borderline document fallback and selfie → ID upgrade. Exercise pending, expiry/resume, declined/underage and review states. | Actual iOS/Android capture, provider callback delivery, app return and correct Selfie/ID status; ID upgrade preserves established access while pending; underage evidence removes it. |
| 2. Live service setup | Confirm launch HTTPS website/API host. Configure matching live Didit key, initial adaptive workflow, mandatory-ID upgrade workflow and webhook secret. Keep all credentials on the server. | Two live workflows validated, HTTPS callback and signed webhook delivered to deployed API; migration and environment isolation checked. |
| 3. Enforce access | Connect server-owned verification and content preference to approved Premium/feed/media access rules. Decide any actions requiring ID specifically rather than selfie age verification. | An unverified client cannot bypass restrictions by requesting the endpoint directly; revoked users lose restricted access; ordinary public discovery follows the agreed feed plan. |
| 4. Privacy and operations | Finalize the existing privacy/terms drafts, provider retention/deletion settings, support ownership, review/appeal handling and provider erasure when account deletion is fulfilled. | Named operator, actual settings recorded, published notices match actual processing and a documented deletion/review procedure. |
| 5. Release sign-off | Test the production release with designated consenting adult accounts and prepare reviewer access for verified/unverified states. | Successful full production path, correct default-off content preference, monitoring and rollback owner; no sandbox identity promoted into production. |

## Required owner information

- A new test account email/username. Existing account UID 61079 is already ID verified and must not be silently downgraded to manufacture a selfie upgrade test.
- The launch website/API domain. The development preview is not evidence of a production deployment.
- Live credentials installed in server settings when ready. Changing only `DIDIT_ENVIRONMENT` does not turn sandbox workflows or results into live ones.
- Retention/deletion and support-review ownership/settings; these cannot be inferred from the fact that a policy page loads.

## Technical release checks

- Apply `20260911_identity_verification.sql`, `20260912_verification_type.sql` and `20260912_verification_upgrade.sql` and `20260913_verification_fallback.sql` before the API release. Development database is already migrated.
- Use separate testing/production databases or an explicit reviewed transition. Existing rows from another environment are blocked; the application does not convert their evidence automatically.
- Set `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_ID_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_ENVIRONMENT=live`, `VERIFICATION_PUBLIC_ORIGIN` and `PULSE_PRIVACY_URL` for the live deployment. Remove test-account assumptions from the release process; sandbox is rejected by production-mode API configuration.
- Webhook path `/api/verification/webhook`, subscriptions `status.updated` and `data.updated`; browser return `/api/verification/`. Keep the personal verification website and its cookie endpoints on the same origin.
- Do not infer success from the callback URL, browser message, provider session creation or a bare Approved flag. The server must accept the returned evidence.
- The website's “Account settings” instruction currently leads through Account → Age verification → the account-linked website. Mature Content remains a website preference, as previously approved.
- Account deletion currently creates a manual-review request; it does not itself delete Didit-held records. Resolve provider erasure as part of the actual deletion executor or documented operator procedure.

## Review handling

A pending check can be resumed. A review-needed check directs the user to support rather than creating unlimited new paid attempts. Operators should investigate the provider record and resolve supported evidence in Didit; they must not manually flip Pulse's verified boolean to bypass validation. Webhooks or authenticated refresh then fetch the current provider evidence. Record the operator and outcome in the operational case record.

## Current development test checkpoint

The user chose to remain in development; the launch domain will be named later. Live service setup remains a future launch item, not a prerequisite for current sandbox testing.

The next designated test account is `e2ebrands@gmail.com`, Pulse UID 33737. It is enabled in the running sandbox API alongside UID 61079 and starts unverified. Approved development test IDs 61079 and 33737 are now stored in `artifacts/api-server/src/lib/verificationSandboxAccounts.json`, so sandbox access survives a host restart with the older environment allowlist. This fallback applies only in development mode. No existing verified account was reset.

The user explicitly authorized checking the two earlier private sandbox test sessions. The check is now complete: one Approved result contains both liveness and ID reports, while the other remains Not Started. No identity details were reported. The remaining phone test must demonstrate selfie-only success followed by the explicit ID upgrade, linked to the new test account.

Latest click-reduction change: app notice/consent now precede Verify now, which opens Didit directly. Include the native/web callbacks and automatic server refresh in the remaining device test. Website-only Mature Content management stays separate.


## Selfie outcome messages — 2026-09-13

- On an accepted selfie-only result, return to Pulse and show the large green **You’re Verified**, followed by **Your age was verified with a selfie.** The server must first accept the age and liveness evidence; an Approved liveness result alone is insufficient. This success copy is implemented in the app and personal website.
- Before an ID fallback, show **One more step** and **We couldn’t confirm your age with a selfie. Continue with ID to finish verification.** Use **Continue with ID** for the action. This is the agreed next-step copy, **pending implementation inside the hosted flow**. Do not display it for a pending selfie, a camera cancellation, a fraud/underage decline or an ID already under review.
- Do not start the ID check silently or describe an inconclusive age estimate as a successful age verification. Keep verified users’ separate voluntary ID upgrade unchanged.
- Remaining provider work: configure and validate Didit's Adaptive Age Verification routing and the message before ID capture. The app-key REST workflow API supports simple linear workflows; graph editing uses authenticated console/MCP access, which is not connected here. The published API configuration does not document a field for this hosted transition copy. Confirm supported customization in the console before promising it is live.
- Required acceptance: clear adult selfie returns without ID; inconclusive selfie explains the reason before ID; verified status follows server evidence; cancellation/review stays accurate. Sandbox simulated results alone do not prove actual age estimation or phone return behavior.


## Completed selfie transition — 2026-09-13 (supersedes the pending transition above)

- Stable initial workflow ID is unchanged: `64fe50ae-dff0-484d-9786-c95a0652ea1b`. Published version is now `ec1def66-2a30-4707-8cc7-59f9d6161964`, label **Pulse Selfie 18+ — return for result**. One AGE_ESTIMATION node; automatic ID fallback disabled. Mandatory-ID workflow remains `1c3b68f7-feb6-4102-b8f6-d74ac88ceb6d`.
- Pulse owns the result between the two hosted checks. Both app and personal website render the approved **One more step** message and **Continue with ID** action. No ID capture is started by a callback. The new action reuses the already accepted ID/selfie consent; the later optional ID upgrade still requests its separate consent.
- `id_required` is an unverified state. Only a completed selfie-only result with acceptable liveness and missing/buffer-range age can enter it. Pending, manual review, fraud, unknown warnings and estimates below the buffer are not converted into fallback. A selfie pass still requires age >25 and all existing evidence checks. No sandbox assumption manufactures an age estimate.
- `id_fallback_required` persists the next step; `selfie_session_id` retains the prior selfie reference when documentary capture starts. The server then requires ID evidence, and ignores callbacks from the displaced selfie session. Failed/reviewed ID checks cannot turn into selfie verification.
- Native `/account/verification/continue-id` uses Clerk/Bearer authentication. Website `/verification/web/continue-id` requires the existing cookie, origin and CSRF checks. Both require eligible server state, prior consent and the daily attempt limit, and serialize duplicate taps with the account row lock.
- The migration is applied in development, the API was rebuilt/restarted with its existing environment, and the running endpoints were checked. Sandbox tester `e2ebrands@gmail.com` (33737) was reset to Not started for the revised flow; the old provider session is preserved. Already verified tester 61079 was not changed.
- Verification: API/mobile typechecks, all 10 localization catalogs (777 strings), native component rendering/action tests, simulated website DOM tests and real HTTP/database integration tests with mocked Didit passed. Real provider session creation confirmed the new selfie-only features. Phone capture and real provider evidence remain explicitly untested.
