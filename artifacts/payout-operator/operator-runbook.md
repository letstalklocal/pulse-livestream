# Operator runbook

## Start a verified role run

Check the exact profile health and fetch current preflight/role playbooks first. Workflow revision `2026-10-08.4` includes recipient errors, pending contact corrections and guarded recovery while preserving initial-request consent; compatible profile version `2026-10-04.1` is unchanged, so existing Keychain items and MCP connections remain valid. Confirm the API identity/environment/account/operator/role and the actual Remitly Business browser session. Acquire the backend browser lease before browser access. Maker acquires the durable withdrawal attempt before possible draft creation. Keep auto-send off and stop before final send or link issuance.

Health mismatch, revoked/expired token, Keychain prompt that cannot be satisfied, missing browser access, account mismatch or preparation pause blocks the applicable job. Preserve withdrawal state and return a category/count-only summary. Do not fix a mismatch by pointing a production profile at an unapproved origin or another account.

## First-time Colombia withdrawal

The creator's existing Pulse wallet is cashable at 400 coins per USD; USD 15 gross reserves 6,000 coins. Enrollment enables permission without granting coins. The maker must obtain an actual signed-in quote for the post-fee send amount, verify provider minimums and method restrictions, and record fee/tax separately. The original withdrawal submission is consent for its amount and selected method; no second quote approval is required. Record the valid actual quote, then claim preparation and save the supported one-time draft in the same operator run. Retain its draft ID/reference to avoid duplicate entry. If the first-time link flow cannot save an unsent reviewable draft, stop for the human rather than issuing the link.

An independent checker inspects the stored draft/reference and recorded history. The human decides approve or decline, performs the provider action if approved, and records the manual action; a first-time recipient link is optional, while saved-recipient transfers require their reference. The creator enters delivery details in Remitly. The reconciler verifies onboarding and authoritative outcomes. Opening a link or returning to Pulse never proves readiness or payment completion.

## Interrupted run or unknown draft

Stop the job and browser actions. Keep the local lock and backend reservation. Determine the current backend attempt/lease state and compare exact draft/activity/reference IDs in Remitly history under a new authorized browser lease. A timeout, computer sleep, empty history page or expired draft does not establish that nothing happened.

Record factual investigation evidence in protected backend fields, not local logs. Resolve provider cancellation/return before refund/retry when necessary. After the old local process is stopped and its provider investigation recorded, the exact run-ID recovery command may remove the local lock. It cannot clear an unknown backend attempt. PID ambiguity or an active process leaves the lock intact.

## Changed quote, recipient method or delivery amount

Do not silently change an approved route, recipient or financial bounds. Preserve reserved coins and escalate through the backend exception path. Before any provider attempt, refresh a quote within the existing requested amount and method without asking the creator to approve again. A changed quote/version still needs a fresh preparation binding and independent check; after an attempt, investigate that attempt before replacing it. New request-consented local-currency amounts are estimates and can change with FX. Genuine legacy exact-quote consent retains its receive minimum. Actual USD send/fee/tax violations, changed method/currency or conflicting references require investigation.

## Recipient details rejected by Remitly

Read the returned `progress` alongside the financial status. `error_unknown` needs investigation; `error_identified` has a classified rejection; `correction_saved` with `nextAction=verify_saved_correction` confirms the contact edit is saved and ready for provider verification. `blocked=true` continues to prohibit replacement preparation. After guarded recovery, `awaiting_quote`/`continue` permits the maker to resume fresh quoting on the same withdrawal. The progress display never proves money was sent or delivered.

The normal creator/admin correction flow is edit phone/email and Save once. A successful save is ready for operator recovery; no extra admin checklist, new correction or quote approval is required. On its next run, the authorized reconciler processes active pending corrections, verifies existing provider history/contact and invokes guarded recovery. The admin manual recovery form is an advanced fallback. Actual Mac scheduling/connection readiness remains a deployment acceptance check, not established by these instructions.

Human admin owners can record rejected fields, save corrected phone/email and complete verified recovery through the admin portal without an extra payout role or secret. This owner-only recipient workflow does not grant the Mac a human session: MCP credentials retain their existing role and browser-lease restrictions.

When the signed-in provider explicitly rejects the saved phone, email, legal name or other recipient details after preparation starts, call `pulse_payout_unknown` with protected factual `reason` and optional `recipientIssue: {code: "recipient_validation_failed", fields: ["phone"]}` inside `data`. Allowed fields are `phone`, `email`, `name` and `other`; include only fields the provider actually rejected. Pulse returns `creatorStatus: "error"` and an `errorMessage`, and displays translated, fixed messages to the creator. Do not put recipient values, raw provider errors, URLs or screenshots in the public issue payload. A timeout without a validation error must remain generic unknown.

Contact creation may have persisted even if no transfer or schedule was created. Keep the withdrawal and reserved coins in investigation. Do not modify the immutable recipient snapshot, retry preparation, create another contact or claim nothing happened from an error screen alone. The creator can edit phone/email and save a pending correction from the error screen. Saving does not change the active recipient snapshot, quote, reservation or attempt and does not resume payout preparation. Remitly remains responsible for actual phone/country validation; no new country-code validation is added. Existing basic formatting checks remain. Legal-name/other errors remain review-only.

For an existing unknown attempt recorded before this update, fetch workflow revision `2026-10-08.4` and re-record that same unknown attempt with the structured issue if the current provider evidence supports it. Do not infer the issue by parsing old free-text notes. A later generic unknown observation supersedes the public validation warning, and a progressed or terminal state hides it. Neither operation refunds coins or authorizes sending.

Guarded recovery is now explicitly approved and implemented through reconciler-only `pulse_payout_resolve_recipient_error`. Hold the current owned backend browser lease. Bind the latest pending correction hash, unknown/expired attempt and stable observation ID to fresh signed-in provider evidence. Confirm all nine checks: history inspected, recipient record inspected, correction applied, no recipient link issued, no funds sent, no funding debit, no pending transfers, no uncertain transfers and previous draft definitively closed. Any recorded human decline/release, provider reference/activity or issued link blocks recovery. Successful recovery closes the old attempt, applies corrected snapshot/version, clears quote/check and resumes the same withdrawal at awaiting_quote without releasing coins. Maker must obtain a fresh quote and new durable attempt; independent checker and final human sending remain required.

## Human decline

Before any provider attempt, the protected owner action can cancel and return reserved coins. After an attempt, decline blocks release and retains coins for investigation. Automated roles cannot reverse this human decision or continue an unknown/declined attempt. Only a verified safe resolution permits a later new request.

## Logging and summaries

Local logs are restricted JSON records containing timestamps, profile/role, fixed event/error codes and bounded counts. Heartbeats contain only time/profile/role/healthy. Provider evidence belongs in the protected backend audit trail. No token, session cookie, MFA value, recipient/contact/bank information, payment URL, amount or screenshot belongs in automation summaries or local logs. No email/Slack notification is configured or sent.

## First-time links emailed by Remitly

The human manually sends the first-time payout in Remitly, which emails the recipient link directly. Pulse accepts recording that completed human action without copying its recipient link or reference; it remains awaiting the recipient with onboarding pending and coins reserved. Supplied links still require approved URL prefixes. Saved-recipient transfers retain their provider-reference requirement.

Later browser acceptance must inspect the sent transfer record to establish its stable reference/activity ID, status labels, URL format and whether a recipient link is available. `scheduledDraftId` identifies scheduled review drafts only; do not assume it is a sent-transfer identifier. Match recipient, route, approved amounts and human release time before recording a discovered reference. Ambiguous matches require human investigation. Existing reconciliation pins the first verified reference and rejects conflicts. Automatic recipient-link retrieval/storage remains future work. Link opening or email delivery alone does not confirm recipient readiness or payment delivery.

## Manual acceptance checklist

- Store/read/rotate one scoped Keychain credential and verify revoked credentials fail.
- Confirm identity pins and production/development separation in the actual Mac Codex job.
- Confirm maker/checker credentials belong to independent authorized operators and each job exposes only its role.
- Verify authenticated browser tools are available in the scheduled context, with the intended Business account.
- Verify leases stop competing/expired runs; exercise sleep/app-close/browser-crash recovery without replaying draft creation.
- Verify first-time unsent draft limitations, approved URL prefixes and actual recipient method restrictions.
- Verify checker pass stays version-bound and final send/link issuance remains human-only.
- Verify authoritative processing/delivery/cancellation/return evidence, wallet refunds and redacted summaries.

These are Mac/provider acceptance steps, not completed device or live-provider evidence from the package's automated tests.

The recipientCorrectionApplied check supports updating a persisted recipient or documenting that no provider recipient was persisted and fresh preparation will use the corrected details. State the branch in protected evidence; do not falsely claim a contact edit. Phone/email recovery cannot clear mixed name/other errors.
