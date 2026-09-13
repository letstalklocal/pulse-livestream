# Account settings

> **Current decision (2026-09-13):** The user rejected returning to Pulse for an inconclusive selfie. The ID fallback and its explanation must stay inside one Didit session; only final success should trigger the automatic return to Pulse. The separate-session workaround has been rolled back. **The Didit decision tree and hosted messages are not yet configured or ready for retest.** See [the current decision-tree specification](didit-workflow-decision-tree.md). This supersedes earlier completion checkpoints below.


Settings > Account contains verified primary-email changes, password changes (revoking other sessions), existing connected sign-in accounts, and a separated Delete account row. Log out stays at the bottom of Settings.

Email and password changes use Clerk resources and a native-compatible identity verification modal. Email changes make the verified address primary; the previous address remains a sign-in method, as explained on the screen. Connected accounts are shown only when present; this version lists them without adding or disconnecting providers.

## Manual removal reports

Delete account submits a report for manual review. It never deletes, disables, signs out, or sends an email about the account. Requests persist across app restarts. The user can cancel a pending request. The balance row uses the freshest successful wallet or account-status result, preserving the number when one source is unavailable. The user types DELETE to confirm submitting the manual report. Authentication determines ownership; client-supplied user IDs are ignored. One pending request per user is enforced in PostgreSQL.

Requests are allowed with any coin balance, including a leftover single coin. Submitting a report never forfeits or deducts coins. The screen displays the actual balance using the same wallet query as the profile, independently of request-status loading. Reviewers MUST resolve the remaining coins with the user and check the current balance again immediately before removal. Never remove an account with coins or unresolved payments. This release does not implement a removal executor or administrative dashboard.

Apply the additive migration before starting the updated API:

```sh
psql "$DATABASE_URL" -f lib/db/migrations/20260910_account_deletion_requests.sql
```

Authorized operators can list the report queue, including each account's current balance:

```sh
node artifacts/api-server/scripts/list-account-deletion-requests.mjs
```

Reports are in `account_deletion_requests`: `pending`, `cancelled`, `rejected`, or `completed`, with review timestamps and notes. Review the live balance, pending earnings/payments, active streams, and requested content removal before handling a report. Mark completed only after actual manual removal, never on request submission. Keep review notes internal; the user API exposes only the request ID, status, and submission time.

## Validation

```sh
node artifacts/api-server/tests/account-requests.integration.mjs
pnpm run typecheck
```

The integration test applies the migration idempotently, uses temporary accounts, and removes its fixtures. Verify email delivery, password verification, optional MFA, and layout on a signed-in device against the configured Clerk instance before release.

Clerk references: [email verification](https://clerk.com/docs/guides/development/custom-flows/account-updates/add-email), [user methods](https://clerk.com/docs/expo/reference/objects/user), [custom reverification](https://clerk.com/docs/react/reference/hooks/use-reverification).

## Age verification setup

Account now includes an Age verification entry. It shows private verification status and opens the account-linked verification website. It does not change the existing Clerk email/password verification controls. See [Didit setup](didit-verification-setup.md). Provider activation and device checks are pending.

The Account page shows **Verified** in green next to Age verification when the authenticated status endpoint returns `isVerified: true`. It shares the verification screen’s account-scoped query cache and refreshes on screen focus. No badge is shown for unverified accounts or failed status queries. This is an age-verification indicator, separate from Clerk email verification. Sandbox-verified accounts use the same indicator within the sandbox environment.

### In-app age verification copy

The user confirmed the wording complaint concerns the native verification screen. Its unverified introduction must match the approved public copy: “Help Keep our Community Safe.”, “You must be 18+ to use Pulse.”, “Age verification helps protect you and our community.”, then “Start with a selfie. Our verification service Didit will ask for ID if needed.” Replace the old website/ID explanation. Hide this verification introduction for already-verified users. Keep existing buttons, status handling and handoff behavior. The four strings are translated in all 10 bundled languages.

### Consent before Verify now — approved direct flow

The user approved moving the short notice, privacy links and unchecked consent box onto the native verification screen to save clicks. New unverified flow: Account → Age verification → read notice/check consent → Verify now → Didit directly → return to Pulse. Consent text remains “I agree to let Didit use my ID and selfie to verify my age.” The button requires consent and server availability. Reset consent when accounts change.

The native app calls authenticated `POST /account/verification/start`, receives a Didit URL, and opens it with a callback to the app. It never uses callback status as proof of verification. On return it calls the authenticated refresh endpoint; pending queries also reconcile through the server. Manual Check verification status is retained for pending/review/error recovery, and hidden when unnecessary. Already verified users keep Manage verification on website for the separate Mature Content preference and later ID upgrade. No preference is automatically enabled.

The web app uses a server-controlled HTTPS return to `/verification`; installed native builds use `mobile://verification`. The provider flow uses Expo WebBrowser auth-session return handling. Actual iOS/Android capture and return behavior still needs a phone test; automated checks do not constitute visual/device validation.

The verification route must explicitly set `headerShown: false` in the root Stack, matching the other account screens. It already has its own in-screen Back control; do not add the default white navigation/back bar above it.

Latest header requirement: the verification screen must match the Email address and Password screens with a fixed dark themed header, centered “Age verification” title (21px Inter bold), circular 38px chevron-back control, safe-area padding and bottom border. Keep the default Stack header hidden. Replace the standalone Back text inside the scroll content; preserve the safety introduction, consent and direct-to-Didit behavior below the header. Avoid repeating the Age verification title in verified-state body content.


### Selfie result clarity — 2026-09-13

Pulse now shows a large green “You’re Verified” after server-confirmed verification. Selfie-verified accounts also see “Your age was verified with a selfie.” The existing safety thank-you is shown in the app. No new success-screen click is introduced; the existing Didit return opens Pulse.

The requested fallback is “One more step” / “We couldn’t confirm your age with a selfie. Continue with ID to finish verification.” / “Continue with ID”, before document capture. This hosted transition and conditional routing remain pending provider configuration. The latest sandbox test returned Approved liveness without an age estimate and continued to ID (In Review); it did not prove selfie-only success. See [the current launch checklist](verification-launch-checklist.md#selfie-outcome-messages--2026-09-13). Earlier statements that adaptive fallback was ready are superseded by this checkpoint.


### Review state actions — 2026-09-13

When an unverified account needs review, hide **Verify now**, the capture consent form and the “Start with a selfie” instruction. Keep the review status and **Check verification status** visible. The start handler also refuses to open a new capture during review; the existing API review guard remains authoritative. Already selfie-verified users whose optional ID upgrade needs review retain **Manage verification on website** and their established verification.


### Selfie transition implemented — 2026-09-13

This supersedes the earlier note that transition copy was only documented. The initial sandbox workflow now ends after AGE_ESTIMATION, using published version `ec1def66-2a30-4707-8cc7-59f9d6161964` under the existing stable workflow ID. Pulse displays the outcome between hosted checks: **You’re Verified** for accepted selfie evidence; **One more step** / **We couldn’t confirm your age with a selfie. Continue with ID to finish verification.** / **Continue with ID** for an eligible inconclusive result. ID only starts after that explicit action. This is a Pulse result screen between Didit sessions, not custom text injected into Didit's pages.

Migration `20260913_verification_fallback.sql` adds the unverified `id_required` state and private fallback/reference fields. Authentication, consent, limits, document evidence and stale-callback protection are enforced on the server. Review continues to hide start actions. Success and fallback are covered by automated native-component, website DOM and HTTP/database tests; the running API and real sandbox workflow selection were checked. Actual phone capture/return on the new flow is still required. See [the current launch checkpoint](verification-launch-checklist.md#completed-selfie-transition--2026-09-13-supersedes-the-pending-transition-above).
