// Fixed public diagnostics only. Never reflect provider text, input or SQL errors.
const messages = Object.freeze({
  unauthorized: "Operator authentication required.",
  forbidden: "This operator role or scope cannot perform that action.",
  invalid_request: "Payout request fields are invalid or unsupported.",
  request_conflict:
    "Payout state conflicts with this request. Reload before proceeding.",
  endpoint_not_found:
    "The payout endpoint or scoped withdrawal was not found. Verify the deployed backend.",
  rate_limited:
    "Operator request limit reached. Wait before making another request.",
  service_unavailable: "Payout operator service is temporarily unavailable.",
  preparation_paused:
    "Preparation is paused. Resume preparation before guarded Maker retry.",
  browser_lease_required:
    "A current browser lease owned by this operator is required.",
  browser_lease_expired:
    "Browser lease expired during the operation. The mutation was rolled back.",
  recovery_checks_missing:
    "All correction, provider-history and no-payment/no-link recovery checks must be confirmed.",
  unsaved_provider_checks_missing:
    "Maker retry requires verified absence of a saved provider recipient and draft.",
  recovery_observation_stale:
    "Provider recovery inspection must be recent and cover the latest saved correction.",
  recovery_observation_conflict:
    "This recovery observation ID was already used with different evidence.",
  pending_correction_missing:
    "No active correction is bound to the current recipient issue and withdrawal version. Inspect correction diagnostics; do not resubmit blindly.",
  correction_hash_mismatch:
    "The supplied correction hash is stale. Read the latest saved correction before guarded recovery.",
  correction_integrity_mismatch:
    "The saved correction does not match its integrity binding. Investigate without changing the withdrawal.",
  recipient_issue_not_correctable:
    "Recovery requires a current phone/email-only rejection. Other recipient errors still require investigation.",
  recovery_attempt_conflict:
    "The requested attempt is not the sole current unknown or expired attempt.",
  provider_record_exists:
    "A saved provider recipient or draft is recorded. Investigate the existing record instead of creating another.",
  provider_effects_recorded:
    "A human decision, payment, debit, link or provider activity is recorded. Investigate the existing outcome.",
  saved_draft_required:
    "Preparation could not complete without a verified saved Remitly draft and its final quote. Report the blocker; never send or issue a link to complete it.",
  first_time_draft_unverified:
    "First-time preparation requires an actual saved draft, verified reopening and inspected prior-transfer history. An open form or contact is insufficient.",
  first_time_draft_ineligible:
    "This recipient has a verified prior payment. Inspect the existing recipient and scheduling path before preparing.",
  reservation_mismatch:
    "The exact withdrawal coin reservation is missing or inconsistent.",
  saved_recipient_missing:
    "The saved recipient record is missing. Investigate before applying a correction.",
  recipient_revision_mismatch:
    "The saved recipient revision differs from the withdrawal snapshot. Investigate before applying a correction.",
  recipient_snapshot_mismatch:
    "The saved recipient details differ from the withdrawal snapshot. Investigate before applying a correction.",
});

export function safePayoutRejection(code) {
  return typeof code === "string" && Object.hasOwn(messages, code)
    ? { code, message: messages[code] }
    : null;
}

export function payoutHttpRejection(status) {
  const code =
    {
      400: "invalid_request",
      401: "unauthorized",
      403: "forbidden",
      404: "endpoint_not_found",
      409: "request_conflict",
      413: "invalid_request",
      429: "rate_limited",
    }[status] ?? "service_unavailable";
  return safePayoutRejection(code);
}
