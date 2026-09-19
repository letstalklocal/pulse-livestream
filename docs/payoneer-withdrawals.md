# Payoneer withdrawals

## User decision — 2026-09-19

Payoneer is the provider for users to withdraw their earnings. The app entry point must be **Settings → Withdraw Money**. Users need to connect their Payoneer account to Pulse so authorized staff can make payments from the Pulse admin. A provider label or an email field alone does not satisfy this requirement.

This is a recorded requirement and researched integration design, not an implemented or verified payout feature. The user confirmed they have a Payoneer business account. Mass Payout program/API availability is still unconfirmed; business-account ownership alone is not evidence of integration access. No app or backend payout code was changed during this investigation.

## Intended user flow

1. Open Withdraw Money and choose Connect Payoneer, or register if the user has no account.
2. The authenticated Pulse backend creates a Payoneer registration link using a stable, server-owned payee ID associated with the signed-in Pulse user. For an existing account, use `already_have_an_account: true`.
3. Open the returned URL in the browser. Users enter Payoneer credentials on Payoneer, never in a Pulse form.
4. Return to Pulse and query authoritative payee status from the backend. A redirect alone must not mark an account connected or approved.
5. Show the actual connection/approval state, including pending and failed states. Payoneer requires an Active payee before payment.

Provider reference: [Payee onboarding](https://www.payoneer.com/developers-docs/mass-payout/mass-payee-onboarding/).

## Intended admin flow

The authenticated admin should show the Pulse user, linked payee ID, provider approval state and payout history. Authorized staff review the payable earnings and amount/currency, confirm a payment, and receive a tracked payout result. Enforce finance permissions on the server and audit the action.

Payoneer supports API submission from our backend and manual payment-file upload in its own Admin Console. The requested Pulse admin flow would use the API. Funding must be available in the Payoneer program. Submission is asynchronous; an accepted request is not proof of a completed payment.

Provider reference: [Submit mass payout](https://www.payoneer.com/developers-docs/mass-payout/mass-submit-payout/).

## Prerequisites and implementation boundaries

- Confirm Pulse has the appropriate Mass Payout program and sandbox/API access. Store credentials only on the server. Keep sandbox and production recipients and transactions separate.
- Confirm program-specific redirect URLs, supported statuses and webhook authentication using the actual integration documentation/configuration before implementing callbacks.
- Preserve the established earnings calculation and reference strategy in [coin purchases](coin-purchases.md). A spendable coin balance or gift total is not automatically a withdrawable cash balance.
- Define payable earnings, currency, eligibility, minimums, fees and settlement rules before enabling payments; these decisions are not supplied by the provider selection.
- Prevent duplicate payouts with persistent unique payment references, transactional earnings reservations and reconciliation of ambiguous submission outcomes. Re-check recipient readiness at submission time.
- Add the withdrawal screen, server-owned payee mapping and status routes, finance-authorized admin payout controls, ledger/history and provider reconciliation as one coherent flow.

## Required verification

Automated: account ownership, ordinary-user/admin authorization, registration cancellation, pending/approved/declined states, forged redirects, duplicate submission, concurrent payout requests, insufficient payable earnings, provider timeouts and reconciliation. Rebuild/restart the development API while preserving its environment and verify changed endpoints on the running server.

Provider sandbox: actual hosted account linking, payee approval and a tracked sandbox payout with sufficient program funding.

Device/browser: iPhone and Android browser handoff/return, Settings navigation and account switching; authenticated admin review, payment confirmation and status/history. These checks are pending; no live payment is authorized by this implementation request.
