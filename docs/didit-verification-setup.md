# Didit verification setup

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

Require all three identity checks to pass. Do not configure a selfie-only age-estimation workflow for this integration; Pulse deliberately requires documentary identity, liveness, and face match. Do not send a test identity through a live provider workflow.

Enable suitable documents for the priority countries: United Kingdom, Saudi Arabia, United States, Colombia, Spain, Canada, Australia, Venezuela, Mexico, Costa Rica, Argentina, Brazil, and Russia where available. Russia resident availability can be assessed separately. A country appearing in the document catalog is not proof of production-service eligibility.

Review retention and model-training controls before real-user testing: Didit's published privacy policy says retention defaults to unlimited and model training is enabled by default. Set appropriate retention and privacy preferences deliberately, and reflect the actual processing in Pulse's public privacy notice. Do not claim these console settings have already been changed. [Didit privacy policy](https://didit.me/terms/privacy-policy/)

## 3. Add server configuration

Use the project's server secret/environment manager. Never use `EXPO_PUBLIC_` variables for provider credentials.

| Variable | Value |
|---|---|
| `DIDIT_API_KEY` | API key for the selected Didit application |
| `DIDIT_WORKFLOW_ID` | ID of the workflow above |
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
