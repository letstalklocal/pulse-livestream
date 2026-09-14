# Didit verification setup

> **Current status (2026-09-14, rechecked):** The running development API is back on sandbox. The live workflow and webhook were prepared, but the complete live server settings must be saved and the API restarted before testing. Per the user's decision, both environments use only `DIDIT_API_KEY`; the separate `DIDIT_LIVE_API_KEY` is no longer read. Confirm prepaid credit; the last checked live balance was zero. No real capture or phone return has been verified. See [the current checkpoint and required settings](didit-workflow-decision-tree.md#paused--resume-testing-on-2026-09-15). This supersedes earlier environment and readiness checkpoints below.


> Current status: selfie-first verification and later ID upgrade are implemented and running in sandbox. See [the current verification launch checklist](verification-launch-checklist.md) for remaining work. Dated checkpoints below include historical states; they do not override the latest approved behavior.

Prepared September 11, 2026. Didit is the approved provider to test. The purpose is Pulse's 18+ eligibility requirement; mature-content preference is separate. Russia must not block supported-market work.

## Current implementation

- Account → Age verification opens a new status screen with a **Verify now** action. App labels are included in all ten catalogs.
- An authenticated Clerk request creates a two-minute, single-use website handoff. The URL uses a fragment so the ticket is not sent in HTTP request paths. The website exchanges it for a one-hour Secure/HttpOnly browser session and clears the fragment.
- The website explains ID/selfie processing and requires affirmative consent before creating the hosted Didit session.
- Signed webhooks trigger a fresh server-to-server decision lookup. Pulse checks the session, workflow, account reference, approved document, liveness, face match, and 18+ birthday. The browser's return status never grants verification.
- Only minimal state is stored in `identity_verifications`: account reference, provider session/workflow, outcome, timestamps, consent version, and the separate mature preference. Raw documents, selfies, full decision payloads, and extracted birthdays are not persisted here or exposed by public profile endpoints.
- After verification, the website offers **Show mature content**, off by default. Enabling/disabling it is authenticated and protected against cross-origin requests. An adverse provider decision clears both verified access state and the mature preference.
- Provider capture is hosted by Didit. Pulse's website wrapper currently uses English; multilingual website/device review remains open.

**Not activated:** the Didit account now exists and API-key access was confirmed on September 12, 2026. The Pulse workflow is configured as a draft (details below). Remaining server configuration, webhook setup, and provider/device testing are still pending. No real ID was submitted and no real provider verification was performed.

This setup does not implement the separate signup birthday/terms workstream, Premium locked feed cards, stream filtering, or enforcement across existing stream/payment endpoints. The stored verification state is not yet a claim that those access gates are complete. Those remain in the [go-live checklist](go-live-checklist.md).

## 1. Create the provider account

Create the free account at [Didit Business Console](https://business.didit.me/). Use the business identity and contact information you control. Do not put passwords, API keys, or webhook secrets in chat or Git.

The starting plan researched offers 500 monthly checks for each eligible core workflow feature. Use **Workflows**, not the separately priced standalone APIs. Extra features and retries can affect cost; check the current [pricing](https://docs.didit.me/getting-started/pricing) in the console before enabling them. No account creation, payment, or external messages have been performed by this setup.

## 2. Create the verification workflow

Start with a sandbox/test application and a workflow containing:

1. ID document verification, with a valid extracted date of birth.
2. Passive liveness.
3. Face match against the document.
4. An 18+ age rule and review/decline behavior for unsuccessful checks.

Current setup uses two workflows: initial adaptive age estimation with documentary fallback, and a separate mandatory-document ID upgrade. The ID path requires approved document, liveness and face match; the selfie-only path checks approved age-estimation and liveness evidence above the configured buffer. See the latest workflow IDs and acceptance rules below. Do not send a test identity through a live provider workflow.

Enable suitable documents for the priority countries: United Kingdom, Saudi Arabia, United States, Colombia, Spain, Canada, Australia, Venezuela, Mexico, Costa Rica, Argentina, Brazil, and Russia where available. Russia resident availability can be assessed separately. A country appearing in the document catalog is not proof of production-service eligibility.

Review retention and model-training controls before real-user testing: Didit's published privacy policy says retention defaults to unlimited and model training is enabled by default. Set appropriate retention and privacy preferences deliberately, and reflect the actual processing in Pulse's public privacy notice. Do not claim these console settings have already been changed. [Didit privacy policy](https://didit.me/terms/privacy-policy/)

## 3. Add server configuration

Use the project's server secret/environment manager. Never use `EXPO_PUBLIC_` variables for provider credentials.

| Variable | Value |
|---|---|
| `DIDIT_API_KEY` | API key for the selected Didit application |
| `DIDIT_WORKFLOW_ID` | Initial adaptive age-verification workflow ID |
| `DIDIT_ID_WORKFLOW_ID` | Separate mandatory-document ID upgrade workflow ID |
| `DIDIT_WEBHOOK_SECRET` | Secret for the configured webhook destination |
| `DIDIT_ENVIRONMENT` | `sandbox` while testing; `live` only with live credentials/workflow |
| `DIDIT_TEST_USER_IDS` | Comma-separated numeric Pulse IDs of explicitly approved synthetic/test accounts; required in sandbox |
| `VERIFICATION_PUBLIC_ORIGIN` | Public HTTPS origin serving the API, such as `https://your-api.example.com`, with no path |
| `PULSE_PRIVACY_URL` | Working public HTTPS Pulse privacy-notice URL covering this verification flow |

All are required except `DIDIT_TEST_USER_IDS` in live mode. Sandbox is the default and is refused by production-mode servers. Accounts not listed for sandbox cannot start verification. Sandbox data is marked separately; changing environments does not silently convert a sandbox identity into a real verified identity. Use distinct environments/databases for production and testing.

The API host must be reachable on the phone. Keep the website wrapper and its `/api/verification/web/*` endpoints on the same origin; the secure cookie and origin checks depend on this. Reverse-proxy the full path if using a branded verification domain.

## 4. Configure the webhook and callback

In Didit, use a v3 webhook destination:

```text
https://YOUR_API_HOST/api/verification/webhook
```

Subscribe to `status.updated` and `data.updated`. Copy its secret into `DIDIT_WEBHOOK_SECRET`. The receiver accepts full-payload `X-Signature-V2` signatures or the raw-body `X-Signature` fallback, checks timestamp freshness, and never accepts the deprecated envelope-only signature. It re-fetches the current decision to resist reordered callbacks. Unknown sessions return a retryable 404 rather than granting access.

The integration sets the browser callback for each created session:

```text
https://YOUR_API_HOST/api/verification/
```

This callback is distinct from the webhook. Keep browser callbacks on the same HTTPS origin so the browser session survives returning from Didit. **Return to Pulse** uses the existing `mobile://verification` app scheme; no auth token or verification decision is passed in that deep link. Physical-device behavior needs validation with the installed app.

References: [Create session](https://docs.didit.me/sessions-api/create-session), [retrieve decision](https://docs.didit.me/sessions-api/retrieve-session), [webhook signatures](https://docs.didit.me/integration/webhooks).

## 5. Database and runtime

Apply the additive migration before starting the updated API:

```sh
psql "$DATABASE_URL" -f lib/db/migrations/20260911_identity_verification.sql
pnpm run typecheck:libs
pnpm --filter @workspace/api-server run build
```

Restart the API through the project's existing development workflow after adding or changing secrets, preserving its existing environment. A rebuild alone does not load new credentials.

| Endpoint | Authentication / purpose |
|---|---|
| `GET /api/account/verification` | Clerk token; private status plus configuration availability |
| `POST /api/account/verification/handoff` | Clerk token; create single-use website handoff |
| `GET /api/verification/` | Static website wrapper; exposes no account data itself |
| `POST /api/verification/web/exchange` | Same-origin request and single-use handoff ticket |
| `GET /api/verification/web/status` | Website cookie; private status and CSRF token |
| `POST /api/verification/web/start` | Cookie, same-origin, CSRF and affirmative verification consent |
| `POST /api/verification/web/refresh` | Cookie, same-origin and CSRF; refresh provider result |
| `POST /api/verification/web/preference` | Cookie, same-origin and CSRF; verified account required |
| `POST /api/verification/webhook` | Provider signature; never trusts client identity or redirect status |

For now, failed verifications can retry within a five-session-per-day limit, while review-needed results require support. Pending sessions are reused for up to a day to avoid duplicate creation. The privacy/account-deletion executor must later include provider erasure, not just deletion of these local rows. Detailed appeal rules remain a launch task.

## 6. Validation and activation checklist

- [ ] Create Didit account and sandbox workflow; install credentials securely.
- [ ] Configure privacy notice, retention, webhook, callback, and explicitly permitted test accounts.
- [ ] On a real phone, open Account → Age verification and confirm the website is linked to the correct Pulse account.
- [ ] Run Didit-supported sandbox success, underage, failed-document, pending, and review scenarios. Never upload fabricated ID to live verification.
- [ ] Confirm success is recorded only after server validation, mature content stays off, and explicit opt-in/withdrawal syncs back.
- [ ] Test iOS/Android browser return, expired website session, and app restart.
- [ ] Finish country/provider eligibility review and public policy wording before real-user activation; Russia remains non-blocking for other markets.
- [ ] Connect verification enforcement to the approved Premium/feed behavior before claiming restricted content is gated.

Local automated verification:

```sh
node artifacts/api-server/tests/verification.integration.mjs
node artifacts/api-server/tests/localization.test.mjs
pnpm --filter @workspace/mobile run typecheck
pnpm --filter @workspace/api-server run typecheck
```

The integration test uses real local HTTP and PostgreSQL with temporary synthetic accounts, but mocks Didit network responses. It does not prove provider compatibility, real document accuracy, physical-device rendering, or App Store approval.

Development validation completed September 11, 2026: API and mobile type checks, API build, verification integration tests, and localization tests passed. The local migration was applied. The development API was restarted preserving its existing environment; the website returned 200, unauthenticated account/browser requests returned 401, and the webhook returned 503 while credentials are absent. Provider and physical-device testing remain pending.

## Provider configuration — September 12, 2026

With user authorization, updated the existing **Free KYC** draft to **Pulse 18+ verification** using the Didit Management API. Saved as a draft; not published or activated in Pulse.

- Workflow ID: `98f54ad5-61dc-48e4-a056-b0a23549aeae` (eventual `DIDIT_WORKFLOW_ID`).
- Sequence: ID document → passive liveness → face match → device/IP analysis → determine final status.
- Age restrictions enabled: minimum 18, underage action DECLINE; country age settings uniformly 18 with no regional overrides. These are Pulse product settings, not a determination of local legal requirements.
- Liveness and face match retain decline threshold 30 and review threshold 60; uncomputed face match goes to review.
- AML omitted. Existing document selections retained, including Australia and all other 12 target countries. Document configuration does not establish resident service eligibility.
- Verified the saved workflow with a fresh GET and inspected its `workflow_graph.nodes` configurations. Some corresponding top-level fields are null; the node configurations contain the saved country/document rules.
- Existing published Compliance workflow was not changed. No verification sessions were started.

At the last environment check, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_TEST_USER_IDS`, `VERIFICATION_PUBLIC_ORIGIN`, and `PULSE_PRIVACY_URL` were absent. Complete the activation checklist above before enabling real-user verification.

## Public website — September 12, 2026

The website is now built and reachable at `/api/site/` on the development HTTPS host, with verification instructions, support, draft privacy and draft terms pages. See [public website](public-website.md) for URLs, remaining business details and validation. Personal verification handoffs and callbacks remain at `/api/verification/`. The privacy notice must be completed before it is used for real-user verification.

### Status refresh behavior — September 12, 2026

The app status-check button shows a loading indicator during requests and confirms successful manual checks even when status is unchanged. Status requests do not automatically retry and HTTP requests time out after 15 seconds. The website also bounds requests to 15 seconds, re-enables controls after failures, and hides account actions if the browser session expires. These controls do not activate the provider or bypass required configuration. Regression coverage: `node artifacts/api-server/tests/verification-page.test.mjs` (executed page JavaScript with a simulated DOM, not a visual/device test).

## Resume checkpoint — September 12, 2026

The user reports adding server secrets. The latest check in the agent session could see only `DIDIT_API_KEY`; it could not see `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_ENVIRONMENT`, `DIDIT_TEST_USER_IDS`, `VERIFICATION_PUBLIC_ORIGIN`, `PULSE_PRIVACY_URL`, `PULSE_LEGAL_NAME`, or `PULSE_SUPPORT_EMAIL`. This describes session visibility, not proof that the values were not saved in the project's secrets manager. No secret values were recorded.

Next steps:

1. Restart the workspace if the newly saved secrets have not loaded, then check configuration presence again without printing values.
2. Confirm the selected workflow is `98f54ad5-61dc-48e4-a056-b0a23549aeae` (Pulse 18+ verification), and re-read its status; last verified as a draft.
3. Configure and verify the Didit webhook and callback using the existing API host.
4. Confirm sandbox configuration and an explicitly allowed Pulse test account, publish the workflow when ready, and test provider results plus browser return on a phone.
5. Complete business identity, public support email, retention/privacy settings and final privacy wording before real-user activation.

The public website is built, and the status-button feedback/timeout fix is served by the restarted development API. Automated verification and localization checks passed; real Didit verification and physical-device testing remain pending. The user has not yet supplied the business/legal name or public support email in this conversation.

## Business details and webhook destination — September 12, 2026

User confirmed **Worldwide Music Makers LLC** and **info@wwmusicmakers.com**. Added to the public website and verified over HTTPS.

Created Didit destination `ffecc06d-4646-42f0-8594-5682d350808f`, labeled **Pulse development age verification**, pointing to the development host's `/api/verification/webhook`. Verified v3 subscriptions `status.updated` and `data.updated`. Delivery is disabled pending server secret installation and readiness for testing. The generated signing secret was neither printed nor saved in the repository.

The agent has no callable integration for this project's server-secret manager. The owner must copy this destination's signing secret from Didit Console → Webhooks to `DIDIT_WEBHOOK_SECRET` in the project's server secrets. Do not paste it into chat. After it loads, finish remaining server configuration and testing before enabling delivery. No real ID verification has been performed.

## Selected verification test account — September 12, 2026

The user explicitly selected `one.espana@gmail.com` for verification testing. Exact-email Clerk lookup and the linked local users row confirmed Pulse username **one.espana**, UID **61079**. Use `DIDIT_TEST_USER_IDS=61079` in the development sandbox environment. This records authorization to use that account for testing; it does not mark the account verified or prove age. The allowlist has not yet been installed through the project secret manager, which is not accessible to the agent. No identity documents or provider sessions were submitted.

## Readiness check: provider environment mismatch

All seven server settings became visible and both configured URLs returned HTTP 200. Published the approved Pulse 18+ workflow. An explicit `sandbox_scenario=approve` readiness request was rejected by Didit with HTTP 400: sandbox scenarios are only accepted on sandbox applications. The currently supplied API key therefore belongs to a live application. No session was created by that request and no ID was submitted. Webhook delivery remains disabled.

Added `sandbox_scenario: "approve"` to Pulse session creation only when `DIDIT_ENVIRONMENT=sandbox`. This forces Didit to reject a live-key mismatch instead of silently creating a live session. The hosted sandbox scenario picker can be used for other test outcomes. API typecheck, build and mocked integration tests passed; restarted the development API preserving its environment and confirmed the start endpoint rejects unauthenticated requests.

Next: use a Didit sandbox application's API key. Sandbox and live are separate applications, so the workflow and webhook must also be configured for the sandbox application. The agent can configure those once its key is available. Reference: https://docs.didit.me/integration/sandbox-testing

## Sandbox application connected

The replacement API key accesses a separate application with its own workflows. Configured and published **Pulse 18+ verification**, workflow ID `64fe50ae-dff0-484d-9786-c95a0652ea1b`, with documentary 18+ restriction, passive liveness, face match and IP analysis. A create-session request explicitly requiring `sandbox_scenario=approve` succeeded, confirming sandbox support. Readiness session: `39edaaea-e601-4365-b34d-e6baa1636158`; no real ID submitted, no completed verification result.

The existing **Pulse Testing** webhook secret matches the server secret. Verified/enforced the correct public API destination, v3 payloads, subscriptions `status.updated` and `data.updated`, and enabled delivery. End-to-end webhook receipt remains to be tested.

Required owner action: replace `DIDIT_WORKFLOW_ID` in server secrets with `64fe50ae-dff0-484d-9786-c95a0652ea1b`. The previous ID belongs to the live application and cannot be used with this sandbox key. Reload configuration afterward.

### Verified content preference copy and control

User-approved wording: “Your account has been verified. You can now choose to view NSFW / Mature Content.” Label: “Show NSFW / Mature Content (18+)”. Display as a keyboard-accessible toggle switch, off by default for newly verified users. Preserve the separate Save preference action and existing server authorization. This replaces the earlier explanatory paragraph on the personal verification page.

The personal verification website hides Check verification status after verification succeeds. It is shown only for pending or review-needed results; verified users retain the Mature Content toggle, Save preference and Return to Pulse.

### Verification type (September 12, 2026)

Private verification records and authenticated status responses include `verificationType`: `selfie` (Selfie), `id` (ID), or `null` until verified. The server assigns it; clients cannot choose it. Existing verified records are backfilled to `id` because the previous acceptance rules required documentary ID, liveness, and face match. Failed/revoked verifications and new attempts clear the field. Environment-mismatched status responses return `null`.

Both acceptance paths are now implemented; see the ID upgrade checkpoint below. Completed hosted capture on a phone remains a release check.


## Selfie verification and ID upgrade — September 12, 2026

The user approved selfie-first age verification with a later ID upgrade. Verification status and the currently established method remain separate from an upgrade attempt. This checkpoint supersedes earlier statements that every verification requires a document.

| Situation | Account result | Website behavior |
| --- | --- | --- |
| Approved selfie age estimate above 25, approved liveness, valid score and no liveness warnings | Verified / Selfie | Mature Content preference plus Verify with ID |
| Estimated age inside 15–25 buffer | Document fallback required; no selfie-only approval | Continue Didit verification |
| Approved documentary adult DOB, liveness and face match | Verified / ID | No redundant upgrade button |
| ID upgrade pending | Existing Selfie verification and preference retained | Continue ID verification; status polling |
| ID upgrade in review | Existing Selfie verification retained | Support/review message; no new paid attempt |
| ID upgrade expired, abandoned or declined without underage evidence | Existing Selfie verification retained | Retry, within shared five-starts/day limit |
| ID upgrade approved with documentary evidence | Verified / ID | Upgrade controls disappear |
| Document shows under 18, or completed ID verification is subsequently revoked | Unverified; Mature Content preference off | Support required; old initial callbacks cannot restore access |

`verificationType` is `selfie`, `id` or `null`. Private authenticated status responses also return `upgradeStatus` and `canUpgrade`. Neither the app nor browser can assign verified status or method. New upgrade endpoint: `POST /api/verification/web/upgrade`, same-origin authenticated browser cookie + CSRF, with consent version `pulse-id-upgrade-v1`. Consent wording remains “I agree to let Didit use my ID and selfie to verify my age.”

The upgrade keeps separate session/workflow references, status and consent/check/approval timestamps. Both session types use signed webhooks and server-side decision retrieval with session, account reference, workflow and environment matching. Repeated starts resume the current pending upgrade under an account-row lock. A selfie-only result can never fulfill an ID upgrade. A completed ID upgrade takes precedence over callbacks from the older initial session.

### Configuration and deployment

- Initial sandbox workflow: stable ID `64fe50ae-dff0-484d-9786-c95a0652ea1b`; published adaptive version `5beb8b81-06e6-4d82-b5cb-e211ac82ebd0`. AGE_ESTIMATION with 18 minimum, 15–25 fallback buffer, then document/face-match fallback and IP analysis. Pulse independently requires estimated age **greater than 25**, valid liveness score greater than 30, and no liveness warnings for a selfie-only pass. Keep provider settings and server acceptance rules aligned.
- Dedicated **sandbox** workflow **Pulse ID upgrade 18+**: `1c3b68f7-feb6-4102-b8f6-d74ac88ceb6d`. Document → passive liveness → face match → IP analysis; documentary minimum 18. This is separate from the adaptive workflow and does not skip documents.
- New server setting: `DIDIT_ID_WORKFLOW_ID=1c3b68f7-feb6-4102-b8f6-d74ac88ceb6d`. Enabled in the current development API environment. Owner must save it in persistent server settings; an in-process setting does not update the host's secret manager. Workflow IDs are configuration identifiers, not API credentials.
- Apply migrations in order before deploying code: `20260911_identity_verification.sql`, `20260912_verification_type.sql`, `20260912_verification_upgrade.sql`. They have been applied to the development database.
- Production needs its own live application key, matching initial and ID-upgrade workflows, live webhook secret/destination and `DIDIT_ENVIRONMENT=live`. Never copy sandbox verification evidence into production. Initial sessions persist the stable workflow ID returned by Didit, including when configuration uses a version UUID.

### Validation and remaining launch checks

Completed: API and mobile typechecks; API build; integration tests over real HTTP/database with mocked provider decisions; website script state tests with simulated DOM. Coverage includes evidence checks, consent/CSRF, duplicate starts, retry/review, preserving existing access, ID-only upgrade acceptance, underage revocation, environment isolation and old callbacks.

The running development API was rebuilt/restarted preserving its environment. A temporary synthetic sandbox account exercised the actual upgrade endpoint against Didit: session creation, repeat-start resume, provider decision refresh, retention of selfie access and Mature Content preference, and new website HTML all passed. Synthetic local account/session data and its temporary test allowlist entry were removed. No ID or selfie was submitted by this automated smoke test; it does not prove the completed capture flow or a real age-estimation outcome.

Before go-live:

- [ ] Save the new workflow setting durably and confirm after a host-managed restart.
- [ ] Complete initial selfie-only, borderline ID fallback and later ID upgrade on actual iOS/Android devices; verify the app return and green Verified status, and actual provider webhook delivery. Sandbox outcomes are simulated, not accuracy measurements.
- [ ] Test decline, review, expiry/resume and support recovery using designated sandbox accounts and provider sample documents. Do not downgrade an existing real user's verification to manufacture a test.
- [ ] Verify both workflows and webhook delivery in the production application and record the tested release build.
- [ ] Finalize provider retention, deletion, privacy/consent notices and review/appeal operations. Current public privacy/terms remain drafts.
- [ ] Decide which specific actions require documentary ID and enforce that in those server endpoints. The implemented flow is a user-initiated upgrade; it does not introduce payout or creator restrictions by assumption.

Provider references: [Age Estimation report](https://docs.didit.me/core-technology/age-estimation/report-age-estimation), [workflow feature configuration](https://docs.didit.me/management-api/workflows/feature-configs), [sandbox behavior](https://docs.didit.me/integration/sandbox-testing).

### Restart handoff

The owner confirmed saving `DIDIT_ID_WORKFLOW_ID=1c3b68f7-feb6-4102-b8f6-d74ac88ceb6d` in persistent server settings and is restarting the session. After reconnecting, verify the setting in the running API (print presence/match only), confirm the API serves the upgrade UI, and proceed with full phone capture/webhook testing. API/mobile typechecks, localization checks, build, mocked HTTP/database integration tests, simulated-DOM tests, and actual sandbox session creation/resume/decision refresh passed. Current user UID 61079 remains ID verified; it was not reset. Full selfie-first and ID-upgrade capture needs a designated test account; the earlier direct sandbox test session `ff1a312b-66e0-4523-b388-25efe667e2cf` was still Not Started when last checked.

### Configuration recheck after session reconnect

Confirmed the ID-upgrade setting matches the published sandbox workflow in both the fresh tool-session environment and the running API environment. Both required workflow configurations are present; public/local verification pages return HTTP 200 with upgrade controls. The API process remained the previously launched process, so this check establishes fresh-session setting visibility rather than evidence of a host-managed API restart.

The stable initial workflow ID still returns the older document-only version from workflow GET, but a newly created sandbox session correctly reports AGE_ESTIMATION, ID_VERIFICATION, FACE_MATCH and IP_ANALYSIS. Use session evidence to assess the effective published workflow; no setting change is necessary. Readiness session `b539f105-0445-4061-9b61-a9035ac01f39` is Not Started, with no capture submitted. The matching webhook destination is enabled for status.updated/data.updated, and a signed no-op to the public endpoint returns HTTP 200. Completed provider capture and callback delivery remain phone-test items.

### Current test account and development-only direction

The user explicitly selected `e2ebrands@gmail.com` for the next selfie → ID upgrade test. Exact-email lookup through the Clerk SDK matched Clerk ID `user_3ECE466Ry5pIIPNJAlfTh6DnoJa`, Pulse UID `33737`. The account had no verification record. Added UID 33737 to the running development API sandbox allowlist, preserving UID 61079: `DIDIT_TEST_USER_IDS=61079,33737`. Authenticated website status on the running API returned HTTP 200, account 33737, sandbox, not_started, isVerified false. A temporary browser test session was deleted afterward. No verified status was granted and no provider capture was started for this account.

Owner should save the expanded test allowlist in persistent server settings before the next host-managed restart. Current runtime already permits the account to open Account → Age verification → Verify now.

The user confirmed keeping everything in development for now; the launch domain is not yet chosen. Do not switch to live mode or request the domain repeatedly during this sandbox test work.

With explicit user authorization, checked completion status/check types for the two prior sandbox sessions: `ff1a312b-66e0-4523-b388-25efe667e2cf` is Approved with one liveness and one ID report; `b539f105-0445-4061-9b61-a9035ac01f39` is Not Started with neither report. The approved test therefore exercised a path including ID; it does not prove a completed selfie-only path. These standalone test results were not attached to the new account. Next: the user signs in as e2ebrands@gmail.com and completes the account-linked hosted sandbox flow.

### Persistent development test access

A host restart reloaded `DIDIT_TEST_USER_IDS=61079`, disabling Verify now for the approved test account UID 33737. Explicitly approved development testers are now recorded in `artifacts/api-server/src/lib/verificationSandboxAccounts.json` (61079 and 33737). In NODE_ENV=development, sandbox access accepts these IDs or IDs from DIDIT_TEST_USER_IDS. This file never authorizes sandbox access in test/production mode; production still rejects sandbox configuration. To remove a development tester, remove it from this file and from any environment allowlist. This supersedes the instruction that adding 33737 to the host secret is required for this development test.

### Direct app entry — consent before provider launch

Latest user instruction supersedes the initial website-before-capture design for the app: collect the notice/consent on the app screen and send Verify now directly to Didit. Added bearer-authenticated `POST /api/account/verification/start` (consent true + current version required) and `POST /api/account/verification/refresh`. Account status supplies the configured privacy URL and consent version. Native return is server-fixed to `mobile://verification`; web return is fixed to the configured origin + `/verification`. Client-supplied callbacks and account/status fields are ignored.

Both website and native starts share the same row-locked, rate-limited session creation logic and record consent. Pending-session resume uses Didit's documented create-session idempotency for workflow/vendor_data to update the callback without creating another check; a changed session ID is rejected on resume. Webhook validation and evidence checks remain unchanged. The website entry stays available for compatibility and the separately approved Mature Content preference/ID upgrade.

Tests cover unauthorized/missing/false/stale consent, native versus web callbacks, ignored client identity/status/callback input, repeat-start resume, persisted consent, verified-user rejection and authenticated server refresh. Provider decisions are mocked for these HTTP/database tests. References: https://docs.didit.me/sessions-api/create-session and https://docs.expo.dev/versions/latest/sdk/webbrowser/ .

Direct-entry validation completed: API/mobile typechecks, HTTP/database verification integration tests and all 771 localized interface strings passed. Didit accepted a newly created synthetic sandbox session with `mobile://verification`; a second create with the same workflow/reference reused the same session and updated its callback. No capture was submitted. Rebuilt/restarted the development API preserving its environment; both new public endpoints returned 401 for unauthenticated requests and the updated instructions returned 200. Actual authenticated success paths were exercised in the HTTP integration harness with provider responses mocked; full phone capture/return is still pending.


### Selfie result clarity — 2026-09-13

Pulse now shows a large green “You’re Verified” after server-confirmed verification. Selfie-verified accounts also see “Your age was verified with a selfie.” The existing safety thank-you is shown in the app. No new success-screen click is introduced; the existing Didit return opens Pulse.

The requested fallback is “One more step” / “We couldn’t confirm your age with a selfie. Continue with ID to finish verification.” / “Continue with ID”, before document capture. This hosted transition and conditional routing remain pending provider configuration. The latest sandbox test returned Approved liveness without an age estimate and continued to ID (In Review); it did not prove selfie-only success. See [the current launch checklist](verification-launch-checklist.md#selfie-outcome-messages--2026-09-13). Earlier statements that adaptive fallback was ready are superseded by this checkpoint.


### Selfie transition implemented — 2026-09-13

This supersedes the earlier note that transition copy was only documented. The initial sandbox workflow now ends after AGE_ESTIMATION, using published version `ec1def66-2a30-4707-8cc7-59f9d6161964` under the existing stable workflow ID. Pulse displays the outcome between hosted checks: **You’re Verified** for accepted selfie evidence; **One more step** / **We couldn’t confirm your age with a selfie. Continue with ID to finish verification.** / **Continue with ID** for an eligible inconclusive result. ID only starts after that explicit action. This is a Pulse result screen between Didit sessions, not custom text injected into Didit's pages.

Migration `20260913_verification_fallback.sql` adds the unverified `id_required` state and private fallback/reference fields. Authentication, consent, limits, document evidence and stale-callback protection are enforced on the server. Review continues to hide start actions. Success and fallback are covered by automated native-component, website DOM and HTTP/database tests; the running API and real sandbox workflow selection were checked. Actual phone capture/return on the new flow is still required. See [the current launch checkpoint](verification-launch-checklist.md#completed-selfie-transition--2026-09-13-supersedes-the-pending-transition-above).
