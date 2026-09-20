# Admin website

September 13, 2026: the user clarified that no previous admin website exists. Earlier references to a separate existing admin app were incorrect. The admin lives in `artifacts/admin`, shares the project backend, and will publish with the other project components. An admin subdomain is intended; the hostname and domain connection remain pending.

Current status: staff access, the live user directory, overview, account-removal request history, verification manual-review queue, current-live-stream list, and moderation report list are implemented in development. See [the implementation checkpoint](#staff-access-and-live-directory--implemented-september-13-2026). The preview and phased plan below record the earlier design decisions.

## First design preview

Open `/api/admin/` on the development host, or `/admin/` on the direct API server. Keep the trailing slash so relative assets resolve correctly; the server redirects the bare path automatically.

The preview uses Pulse's dark theme and pink accents, with an overview, example metrics, an illustrative growth chart, attention queues, and a user directory. Search, verification-status filtering, sample account details, and sidebar navigation work. Other sections display their planned purpose. All records, totals, dates, and queues are sample data; the chart is illustrative rather than a report calculated from the sample user rows.

This is a publicly accessible design preview without live private data, staff authentication, or privileged actions. Staff authorization must be implemented before connecting real account, financial, or moderation records. Moderation process decisions remain in A6.

Static HTML, CSS, and JavaScript are in `artifacts/admin/public`. The API build copies them into `dist/admin`; Express serves that directory at both preview paths. No additional frontend dependencies or independent development server are needed. Rebuild/restart the API after changes to refresh its copied assets.

The subdomain has not been connected and hostname routing has not been enabled. The first preview is for visual review before the operational dashboard is implemented.

## Live-data implementation plan — September 13, 2026

The user approved the first visual design and requested a plan to connect live data. Preserve the approved layout, colors, and navigation; replace fixtures incrementally. This plan does not mark authentication, live data, or production deployment complete.

### 1. Staff access foundation

- Add staff sign-in using the existing Clerk integration. Identify the initial owner's Clerk account explicitly; never make the first visitor or every signed-in app user an administrator.
- Store staff membership and permissions on the server. Start with owner-only access; add support, finance, and moderator permissions when their responsibilities are agreed. Require MFA for staff before production use.
- Protect every admin data endpoint with session validation and server-owned permissions. Protect both host/path aliases consistently. Client navigation and a dedicated subdomain are not authorization.
- Keep the public design preview limited to sample data while access is being implemented. Authenticated screens must clear private data on logout, account changes, and permission loss; sensitive responses use `Cache-Control: no-store`.
- Add an audit foundation for staff access and subsequent privileged actions, recording actor, action, target, timestamp, outcome, and reason where applicable. Never record tokens or identity documents.

Acceptance: anonymous requests fail with 401, ordinary app users fail with 403, the designated staff member succeeds, and removed staff lose access. Test direct requests as well as browser navigation and logout.

### 2. First live slice: users and account details

- Add dedicated read-only admin endpoints with explicit response fields, bounded pagination, name/UID search, verification filters, and stable sorting. Do not repurpose unrestricted public user endpoints to expose private records.
- Join `users` to `identity_verifications`. Return UID, name, avatar where available, country, creation date, and authorized verification summary. Missing verification rows mean not started, not a failed query or successful verification.
- The current user schema has no username field. Replace sample `@handles` with the actual UID in the existing secondary text position unless usernames are implemented separately. Show missing country as unknown.
- Preserve verification state, established method (selfie or ID), ID-upgrade attempt, and sandbox/production environment as distinct concepts. An upgrade attempt must not erase established verified status. Do not include provider URLs, sessions, documents, consent records, or mature-content preferences in the basic directory response.
- Connect search, filters, table pagination, and the account dialog. Use debounced search and discard stale responses. Add loading, empty, expired-session, forbidden, and retry states. Never fall back to sample records when a live request fails.
- Move wallet information in the account dialog into the finance-authorized slice below; do not leave a sample coin balance on a real account.

Acceptance: compare returned users to database records, test filter/search combinations and pagination without duplicates, inspect response fields for private-data leakage, and exercise the browser UI at desktop and phone widths.

### 3. Overview metrics and growth chart

Use the same date range and environment throughout, initially seven UTC calendar days including today, with a clearly identified partial current day. Compare period metrics with the immediately preceding equal-length period. Return `asOf`, range, and environment metadata; show last refresh time. Poll the overview initially every 60 seconds while visible and provide manual refresh. Do not label polling as instantaneous real time.

| Dashboard element | Existing source | Definition / work needed |
| --- | --- | --- |
| Total users | `users` | Current account count in the connected environment. Show new accounts in the selected range as supporting text; do not invent a historical total-growth percentage without a reliable historical baseline. |
| Verified accounts | `identity_verifications` joined to `users` | Count established `isVerified` records in the applicable provider environment; show percentage of current users. Zero users produces a defined zero/empty state. |
| Community growth | `users.created_at` | Daily new-account counts, including zero-count days. Replace the decorative curve with a chart calculated from returned values and an accessible data summary. |
| Coins gifted | `coin_transactions` | Sum gift transaction amounts within the selected range. Exclude grants and unrelated transaction types; coins are not cash revenue or creator payout amounts. |
| Live right now | Stream registry and `live_stream_sessions` | Reconcile how the existing stream lifecycle uses persistent records and the in-memory registry before exposing a count. Exclude seeded demo streams and expired/ended sessions; use the agreed heartbeat rule consistently. Do not sum historical sessions or claim an instance-local count is global. |

When comparison values are unavailable or the previous period is zero, show an honest new/no-comparison state instead of infinity or a fabricated percentage. Development/test data must not be presented as production activity. No fixture totals remain after switching a screen to live mode.

Acceptance: compare aggregates with independent database queries and known fixtures, cover timezone boundaries and zero-data cases, and verify stream expiry, restart behavior, and multiple-instance implications. Ship user metrics first if stream-count correctness is still unresolved.

### 4. Read-only operational sections

- **Verification:** list actual provider states and upgrade states with filters. Define which states genuinely need staff attention; pending provider processing is not automatically a human review queue. No manual mark-as-verified button in this phase.
- **Wallet & earnings:** permission-scoped balance and paginated transaction lookup using `coin_balances`, `coin_transactions`, and the existing earnings calculation after reviewing its semantics. No coin grants, balance edits, refunds, or payouts. Store purchase records and reconciliation depend on A1; do not imply coins prove a store purchase.
- **Live streams:** reuse the reconciled active-stream definition, then add host, title, start time, and available status. Viewer counts require a separate review of their in-memory source. Do not expose private media credentials or private-stream viewing access through the list.
- **Moderation:** inventory `post_reports`, `user_reports`, and stream moderation records, then expose permission-scoped read-only report summaries. Define report status/count semantics and distinguish reports from unique reported content. Keep queue ownership, severity, response targets, decisions, and appeals under A6. The preview's flagged-stream count has no established live definition yet.
- **Audit log:** list real recorded staff events with pagination and appropriate access. No invented historical activity.

Acceptance: each view agrees with its underlying records, enforces its permission independently, has truthful empty/error states, and exposes only the fields needed for the task. Hide unavailable attention counts or label them unavailable until their definitions are implemented.

### 5. Privileged actions, subdomain, and release

- Agree individual account/moderation/financial actions before implementation. Each needs backend permission checks, a reason, an appropriate confirmation, an audit record, and retry/concurrency handling. Moderation workflow remains dependent on A6; financial actions depend on billing/reconciliation rules.
- Choose the admin hostname, configure host routing while preserving current public/API URLs, and connect the hostname in Replit with its generated DNS records. Verify staff sign-in, callbacks, cookie scope, and logout on the actual hostname. Shared project publishing remains the agreed deployment model.
- Run authorization and data-isolation regression checks, build/type checks, and actual browser checks separately. For every backend increment, rebuild and restart the development API preserving its runtime environment, then verify affected endpoints on the running server.
- Record production configuration and evidence before A4 sign-off. A functioning development dashboard is not production readiness.

### Next implementation milestone

Deliver **staff login + live user directory + read-only account details** first, keeping the approved visual design. Then connect the overview and remaining sections in order.

Initial admin account approved by the user: `one.espana@gmail.com`. Resolve this verified email through trusted Clerk account data and bind the staff membership to its stable Clerk user ID before enabling access; never trust a client-supplied email or grant access based on an unverified address. Start with this one owner; broader staff permissions require agreed responsibilities.

**Required separation from the mobile app:** this account remains an ordinary Pulse account in the mobile app. Staff permissions apply only to dedicated admin routes and features. Do not change mobile sign-in, navigation, profile display, verification requirements, content eligibility, wallet behavior, or ordinary API permissions. Admin membership must not confer mobile feature bypasses or grant other mobile users staff access. Keep any staff-only MFA requirement scoped to admin access rather than changing authentication requirements globally. Admin sign-in/sign-out must not revoke unrelated mobile sessions.

Acceptance checks must include the designated account using the mobile app normally before and after staff membership is added, ordinary mobile users continuing to use existing APIs, and those users being denied admin endpoints. Verify that admin logout or staff permission removal does not log the account out of the mobile app or disable its ordinary account.

The final subdomain can be supplied later and does not block development. This update records the selected account and access requirements; staff access and the domain are not yet configured.

## Staff access and live directory — implemented September 13, 2026

The first live-data milestone replaces the public sample dashboard with a sign-in shell. Open `/api/admin/` on the development host or `/admin/` on the direct API server. Clerk authenticates the existing Pulse account; `admin_staff` authorizes the admin endpoints independently of mobile accounts. The approved verified email was resolved through Clerk and bound to its stable user ID. No ordinary user profile, mobile permission, wallet, or Clerk authentication setting was changed.

- `GET /api/admin-data/config` supplies public Clerk frontend configuration.
- `GET /api/admin-data/session` checks enabled owner membership.
- `GET /api/admin-data/users` provides bounded, cursor-paginated name/UID search and verification filters.
- `GET /api/admin-data/users/:uid` returns the read-only account summary.
- Each protected endpoint requires an explicit Clerk session bearer token and checks enabled staff membership on every request. Ambient cookies alone do not authorize these endpoints. Responses are not cached. The frontend clears records on account change, logout, loss of access, and when the page is hidden; access is rechecked on return and every 30 seconds while visible. Existing Clerk session-token validity rules apply.
- The user list and dialog expose only UID, name, country, joined date, and verification summary. Missing verification rows are not started. Established selfie/ID verification, upgrade status, and provider environment remain separate. No provider documents, session URLs, mature preferences, wallet data, or privileged actions are exposed.
- Directory search escapes SQL wildcard characters and uses bound parameters. Cursor ordering uses creation timestamp and UID, preserving database timestamp precision. User-controlled text is HTML-escaped in the browser.
- `admin_audit_events` records staff access checks and successful directory/account reads. Audit log browsing is a later milestone.
- Overview metrics, growth reporting, money, stream, moderation, and verification queues are explicitly marked as not connected. Sample numbers and records no longer appear in the authenticated dashboard.

### Provisioning and removal

Run `node artifacts/api-server/scripts/bootstrap-admin.mjs` with the API's existing database and Clerk environment. It applies `lib/db/migrations/20260913_admin_access.sql`, validates the approved verified email through Clerk, and inserts the initial owner only if no staff membership exists. It refuses to replace existing staff or re-enable a removed owner. Re-running it with the existing enabled owner is a no-op. It does not change the ordinary `users` table or Clerk account settings.

To remove staff access, set `admin_staff.enabled=false` for the intended Clerk user ID through an authorized operational database change. The next admin request is denied. Do not delete or disable the regular Pulse account. There is intentionally no public membership-management endpoint.

Admin logout calls Clerk sign-out with the current browser session ID only, rather than revoking all of the account's sessions. The mobile app uses its own session. No mobile sign-in code or shared Clerk settings were changed.

Production admin endpoints additionally require evidence of a completed second authentication factor in the Clerk session's `fva` claim. The initial owner does not currently have MFA enrolled. Production enrollment and an end-to-end second-factor test remain launch work; this gate is restricted to admin routes and does not impose MFA on mobile endpoints. Development admin access works with the current sign-in method.

The embedded sign-in form inherits the existing Clerk application's “Stream Connect” branding. Its global branding and provider settings were left unchanged. The SDK is loaded from the configured Clerk frontend origin following [Clerk's JavaScript quickstart](https://clerk.com/docs/js-frontend/getting-started/quickstart), and logout uses the [session-specific sign-out option](https://clerk.com/docs/reference/objects/clerk#signout).

### Validation

- `node artifacts/api-server/tests/admin.integration.mjs`: synthetic database accounts and a test-only authentication harness verify 401/403 boundaries, staff removal, admin-only production MFA, unchanged ordinary profile data, pagination, filters, literal wildcard search, invalid input, response allowlists, and audit records. All synthetic accounts/memberships are removed afterward. This does not simulate the full native mobile UI.
- `artifacts/api-server/tests/admin.browser.cjs`: passed in Chromium at desktop and phone widths. Network fixtures exercise search, status filters, cursor navigation, account details/Escape, HTML escaping, empty/error/retry states, removal of private content on access loss, and logout with the current browser session ID. The mobile overflow check passes. These checks exercise the frontend independently of real staff credentials. Set `PULSE_PLAYWRIGHT_MODULE` if Playwright is installed outside the normal module path; `ADMIN_TEST_BASE` defaults to `http://localhost:8080`.
- API build, generated library type checks, and API type check passed. The development API was restarted preserving its runtime environment. Its admin shell/config return 200, missing/forged tokens return 401, and public-site/health routes remain 200.
- The actual Replit sign-in form was rendered in Chromium with no page/console errors. Automated checks do not sign in as the owner's account; the owner must complete their normal sign-in to verify their actual authenticated browser session. No account password, sign-in ticket, or existing mobile session was used for testing.

Subdomain/DNS connection, production MFA completion, and the later live-data phases remain open. The development milestone does not mark A4 production-ready.

### Admin sign-in password prompt correction — September 13, 2026

The user reported that the initial identifier screen showed a password field, then Continue opened another password screen. Clerk's start component includes an instant-password/autofill row that may become visible when autofilled. The admin now consistently presents the identifier first, with the start-step password row hidden using the stable `cl-signIn-start` and `cl-formFieldRow__password` selectors. The dedicated password step, recovery flow, and MFA steps are preserved. This styling is scoped to the admin mount and changes no shared Clerk or mobile configuration.

Keep the in-progress unauthenticated Clerk form mounted across tab/visibility changes (including visits to a password manager). Access checks reuse that mount rather than resetting entered credentials. Unmount Clerk explicitly when replacing its container. Authenticated admin data still clears on hiding the page, session changes, logout, and lost access.

Regression: `artifacts/api-server/tests/admin-signin.browser.cjs` uses the actual Clerk component, advances with only the authorized identifier, and checks an email-only first screen, a single password prompt, preserved input after switching tabs, a single mounted form, and phone-width layout. It never submits a password. Set `ADMIN_TEST_EMAIL`, optionally `ADMIN_TEST_BASE`, and `PULSE_PLAYWRIGHT_MODULE` as for the existing browser tests. `ADMIN_TEST_IGNORE_HTTPS=1` is only for test environments with intercepted HTTPS certificates.

## Live overview metrics and growth chart — September 13, 2026

The Overview now reads `GET /api/admin-data/overview` through the same staff-only authorization as the user directory. It shows current user count, established verified-account count and percentage, active durable broadcasts, and gift coins. Community growth is drawn from seven actual daily counts, with an expandable accessible table. Read-only operational queues remain unconnected.

### Metric definitions

- **Range:** the last seven UTC dates, starting at midnight six days before the request and ending at the captured refresh time. Today is partial. All interval queries use an inclusive start and exclusive end.
- **Comparison:** new accounts and gift coins compare against the immediately preceding interval of exactly the same duration. For a refresh at September 13, noon UTC, the current interval is September 7 midnight through September 13 noon, and the prior interval is August 31 noon through September 7 midnight. Percent change is omitted when the prior value is zero; the UI says new/no activity instead.
- **Total users:** current `users` records created before the refresh time, with new accounts in the selected period as supporting text. This is not a reconstructed historical account count; deleted accounts are absent from the existing source table.
- **Verified accounts:** current users joined to `identity_verifications.is_verified=true` in the configured Didit environment (`sandbox` or `live`). Missing or other-environment verification is not counted. Pending ID upgrades do not remove established verification. The UI identifies the provider environment separately from development/production data.
- **Live right now:** durable `live_stream_sessions` records with no end time, a started time at/before refresh, and a heartbeat newer than 60 seconds. Excludes demo-suffix channels and future heartbeats. Private sessions additionally require a matching active invitation updated within 75 seconds. This uses the existing public/stream and private-invitation timeout rules. It does not depend on an instance's in-memory registry, expose private viewing credentials, or call Agora. It counts heartbeat-active session records, not independently observed video delivery.
- **Coins gifted:** sum of `coin_transactions.amount` only where `type='gift'` in the period. Grants, escrow holds, private-entry settlements/refunds, and other types are excluded. Values are coins, not cash revenue or creator payouts.
- **Growth:** zero-filled daily counts from `users.created_at` using the same range. Account and ledger timestamp-without-time-zone columns are treated as UTC, matching the existing storage convention. The line and data table use the same seven returned counts.

All aggregates are computed in one PostgreSQL statement for a consistent snapshot. They neither mutate account/stream/ledger records nor grant additional permissions. Each successful overview request is audited as `overview.view`. The API returns environment, provider environment, UTC range, comparison range, and refresh time; responses remain `no-store`.

The browser refreshes the overview every 60 seconds while the Overview is visible and provides **Refresh overview**. It shows last refresh time, loading, zero-data, and retry states. Failed refreshes remove the previous values instead of presenting them as current. Navigation/session changes invalidate pending responses. Existing user-directory search, filters, pagination, and sign-in behavior are preserved.

### Validation

- `admin-overview.integration.mjs` uses transaction-local temporary tables so real accounts, transactions, and streams are untouched. Checks include empty data, UTC midnight and interval boundaries, equal-duration comparisons, seven zero-filled days, gift-type exclusions, verification environment, ended/demo/stale/future streams, private invitation expiry, and independence from the database session timezone. Passed.
- `admin.integration.mjs` additionally verifies overview 401/403 protection, successful authorized response, `no-store`, daily-count/period-total agreement, and rejection of unsupported query parameters. Passed.
- API type check, generated library type checks, and API build passed. The running development API was rebuilt/restarted with its existing environment. The overview rejects missing/forged credentials with 401; the admin shell, existing public website, and health endpoint return 200.
- Browser checks passed in Chromium at desktop and phone widths, including populated/zero/error overview fixtures, chart daily-count access, account-table isolation, retry, cleared metrics on permission loss, and desktop/phone layout. These fixtures test rendering separately from the database aggregate tests; they do not sign in as the owner. Independent read-only queries against the actual development database also matched the current-user total, gifts-only sum, and daily growth total.

## Payoneer payouts — requested 2026-09-19

The user requested Payoneer account linking in Settings → Withdraw Money and the ability to pay linked users from the Pulse admin. This adds a future financial action beyond the earlier read-only wallet scope; it does not enable payouts today. Preserve the existing admin permissions and audited access. See [Payoneer withdrawal requirements and integration flow](payoneer-withdrawals.md) for provider behavior, implementation prerequisites and verification still required.


## Account removals and verification manual review — September 20, 2026

The user approved an admin section for pending deletion requests and completed removals, with separate filters, and requested Verification for items needing manual review. Live streams is intended to list current active broadcasts; its dedicated page remains a placeholder.

- **Account removals:** new menu item using `GET /api/admin-data/account-removals`. Defaults to pending; also supports completed, cancelled, rejected, and all statuses. Shows request ID, Pulse UID/name where available, request/review dates, reason, and internal review notes. Bounded pagination orders newest request IDs first. Completed means the recorded request was marked completed after manual removal, not that the dashboard independently checked erasure. This is history of existing requests, not a recovered archive of accounts deleted outside the request process. No deletion executor, status changes, or new profile-retention scheme was added. Existing coin/payment resolution requirements remain mandatory before actual removal.
- **Verification:** `GET /api/admin-data/verification-reviews` lists only `status=review_needed` or `upgrade_status=review_needed` in the configured Didit environment. Filters distinguish initial and ID-upgrade reviews, with bounded UID pagination, account details, established verification, update date, environment label, and refresh. Pending/in-progress/id-required states alone do not enter the queue. A verified account awaiting upgrade review keeps its established verification. The Overview's verification attention link now opens this queue.
- Both queues are read-only, use the existing owner/MFA guard, return `no-store`, audit successful reads, escape user content, and clear private content on lost access. Provider sessions, documents, consent, and mature preferences remain excluded. Review decisions must be resolved in Didit and accepted through existing provider evidence validation; no manual verified toggle was added. Operator assignment, case decisions, and provider-review controls remain future work.

Validation evidence is recorded below; these development additions do not complete production launch readiness.

### September 20 validation

- API type check and build passed. `admin.integration.mjs` passed against temporary database fixtures, including both new queues' 401/403 boundaries, production MFA, staff removal, filters, bounded cursor pagination, review environment isolation, preservation of established verification, audit events, and unchanged mobile profile. Fixtures were removed afterward.
- `admin-queues.browser.cjs` passed in Chromium using network fixtures: removal/review filters, pagination, escaped content, empty/error/retry states, permission-loss clearing, and desktop/390px layouts. The longer removal breadcrumb initially caused phone-width header overflow; it now truncates within the available header space and the overflow assertion passes. Existing `admin.browser.cjs` also passed, covering users, overview, account details, and session-specific logout.
- Development API was rebuilt/restarted preserving its environment. Served admin HTML/updated assets and health returned 200; both queue endpoints reject missing and forged tokens with 401. Authorized data behavior was verified in the database integration harness, not by signing in as the real owner.
- Physical iPhone/Android and a real owner-authenticated browser session were not tested. The review workflow in Didit and actual account removal remain outside these read-only checks.


## Live streams and moderation report list — September 20, 2026

User requested replacing the remaining Live streams and Moderation placeholders.

- **Live streams:** `GET /api/admin-data/live-streams` supplies a read-only, bounded, cursor-paginated list of current durable broadcasts. Shows host name/UID, broadcast ID, title/category, public/private visibility, start time and last heartbeat in UTC. Filters support all/public/private. Refreshes every 30 seconds while the page is visible, plus manual refresh. Empty/error states clear stale rows. Pagination is a refreshed live view, not a historical snapshot.
- The Overview and list now share one SQL active predicate: no end time, started by refresh time, heartbeat within the preceding 60 seconds and not in the future, no demo suffix, and an active private invitation updated within 75 seconds for private streams. The list does not expose channel names, credentials, admission data, private viewing access, or an unverified viewer count. It reports heartbeat activity, not independently observed video delivery.
- **Moderation:** `GET /api/admin-data/moderation` lists existing stream, post, and account/DM reports via a report-type selector, defaulting to stream reports. Each type supports pending (default) or all recorded statuses. Shows report and target IDs, target account UID where available, reason, submitted details, recorded status, and date. Pagination orders descending report IDs within the selected type. Rows are individual reports, not unique content/account totals or confirmed violations. Deleted post/account targets remain identifiable from retained report IDs where the schema supports it. No reporter identity, DM message body, private media, or provider evidence is returned.
- Both endpoints use existing staff/MFA checks, no-store, allowlisted fields and audit events (`live-streams.list`, `moderation.list`). Both pages clear private content on lost access and escape report/title text. No stream mutation, host/viewer controls, message behavior, or mobile code changed.
- Moderation is report visibility only. A6 workflow requirements, owners, enforcement, notices, appeals, and decision/audit controls remain open. The Overview now links to the report list without inventing an open-report count; a flagged-stream queue remains undefined.

Validation for Live streams/Moderation: API type check/build and extended database-backed `admin-overview.integration.mjs`/`admin.integration.mjs` passed. Fixtures cover public/private/demo/stale/ended/future stream rules, consistency with overview, expiry, pagination and response field allowlists; report-source/status filtering, deleted-target summaries, staff authorization/removal, MFA and audits. `admin-queues.browser.cjs` and existing `admin.browser.cjs` passed in Chromium with network fixtures at desktop and 390px widths, including filters, pagination, escaped text, empty/error/retry, and clearing on permission loss. The API was rebuilt/restarted preserving its environment; both new running endpoints reject missing/forged credentials with 401, and local/public admin plus health return 200. Real owner-authenticated sessions, actual live broadcasting on phones and physical-device verification were not performed. Mobile stream screens and shared controls were not changed.
