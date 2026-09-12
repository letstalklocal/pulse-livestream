# Account settings

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
