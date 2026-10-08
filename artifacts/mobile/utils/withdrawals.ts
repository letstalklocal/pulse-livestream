export const withdrawalStatusKeys: Record<string, string> = {
  error: "Error",
  awaiting_quote: "Awaiting a current quote",
  awaiting_confirmation: "Preparing withdrawal",
  requested: "Preparing withdrawal",
  quote_approved: "Quote confirmed",
  quote_recorded: "Preparing withdrawal",
  independent_check: "Payment review recorded",
  preparation_recorded: "Ready for payment review",
  human_release_recorded: "Payment released",
  reconciled: "Provider status updated",
  awaiting_human_review: "Ready for payment review",
  processing: "Payment submitted",
  delivered: "Paid",
  returned: "Returned",
  canceled: "Cancelled",
  canceled_before_preparation: "Cancelled",
  approved: "Quote confirmed",
  preparing: "Preparing withdrawal",
  awaiting_recipient: "Complete recipient details",
  prepared: "Ready for payment review",
  submitted: "Payment submitted",
  paid: "Paid",
  completed: "Paid",
  failed: "Failed",
  cancelled: "Cancelled",
  unknown: "Payment outcome under review",
  exception: "Needs review",
  error_unknown: "Error — awaiting identification",
  error_identified: "Error — identified",
  correction_saved: "Correction saved — awaiting processing",
  recipient_correction_submitted: "Correction saved — awaiting processing",
  recipient_error_resolved: "Preparing withdrawal",
};
export function withdrawalStatus(status: string) {
  return withdrawalStatusKeys[status] ?? "Withdrawal under review";
}
export const withdrawalProgressSteps = [
  { key: "requested", label: "Requested" },
  { key: "preparing", label: "Preparing" },
  { key: "review", label: "Review" },
  { key: "recipient", label: "Recipient" },
  { key: "processing", label: "Processing" },
  { key: "delivered", label: "Paid" },
] as const;
type ProgressStep = (typeof withdrawalProgressSteps)[number]["key"];
type ProgressWithdrawal = {
  status: string;
  recipientIssue?: { code?: unknown; fields?: unknown } | null;
  recipientCorrection?: { hash?: unknown } | null;
  providerLink?: string | null;
  progress?: { stage?: unknown; currentStep?: unknown } | null;
};
/** Fixed display labels only; saved corrections never imply a payment was retried. */
export function withdrawalProgress(withdrawal: ProgressWithdrawal) {
  const fields = withdrawal.recipientIssue?.fields;
  const validIssue =
    ["unknown", "expired"].includes(withdrawal.status) &&
    withdrawal.recipientIssue?.code === "recipient_validation_failed" &&
    Array.isArray(fields) &&
    fields.length > 0 &&
    fields.length <= 4 &&
    new Set(fields).size === fields.length &&
    fields.every((field) =>
      ["phone", "email", "name", "other"].includes(field),
    );
  const correctionSaved =
    validIssue &&
    fields.every((field) => field === "phone" || field === "email") &&
    typeof withdrawal.recipientCorrection?.hash === "string" &&
    withdrawal.recipientCorrection.hash.length > 0;
  // Derive error stages from the current issue and correction, including on older APIs.
  const stage = ["unknown", "expired"].includes(withdrawal.status)
    ? correctionSaved
      ? "correction_saved"
      : validIssue
        ? "error_identified"
        : "error_unknown"
    : withdrawal.status;
  const stepByStatus: Record<string, ProgressStep> = {
    awaiting_quote: "requested",
    awaiting_confirmation: "requested",
    requested: "requested",
    preparing: "preparing",
    awaiting_human_review: "review",
    prepared: "review",
    awaiting_recipient: "recipient",
    processing: "processing",
    delivered: "delivered",
    paid: "delivered",
    completed: "delivered",
    returned: "processing",
    unknown: withdrawal.providerLink ? "recipient" : "preparing",
    expired: withdrawal.providerLink ? "recipient" : "preparing",
  };
  const serverStep = withdrawal.progress?.currentStep;
  const currentStep = withdrawalProgressSteps.some(
    ({ key }) => key === serverStep,
  )
    ? (serverStep as ProgressStep)
    : (stepByStatus[withdrawal.status] ?? "requested");
  return {
    stage,
    currentStep,
    correctionSaved,
    statusLabel: withdrawalStatus(stage),
  };
}
const recipientIssueCopy: Record<string, string> = {
  phone:
    "Remitly could not accept the recipient phone number. Verify the country code and phone number with support.",
  email:
    "Remitly could not accept the recipient email address. Verify the email address with support.",
  name: "Remitly could not accept the recipient legal name. Verify the full legal name with support.",
  other:
    "Remitly could not accept some recipient details. Contact support to verify them.",
};
/** Provider evidence and free-text messages never become creator-facing copy. */
export function recipientIssueMessages(
  status: string,
  issue: unknown,
): string[] {
  if (
    !["unknown", "expired"].includes(status) ||
    !issue ||
    typeof issue !== "object"
  )
    return [];
  const safeIssue = issue as { code?: unknown; fields?: unknown };
  if (safeIssue.code !== "recipient_validation_failed") return [];
  const fields = Array.isArray(safeIssue.fields)
    ? [
        ...new Set(
          safeIssue.fields.filter(
            (field): field is string =>
              typeof field === "string" &&
              Object.hasOwn(recipientIssueCopy, field),
          ),
        ),
      ]
    : [];
  return (fields.length ? fields : ["other"]).map(
    (field) => recipientIssueCopy[field],
  );
}
export function recipientContactErrors(contact: {
  email?: string;
  phone?: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!/^\S+@\S+\.\S+$/.test(contact.email?.trim() ?? ""))
    errors.email = "Enter a valid recipient email address.";
  if (
    !/^\+\d{8,15}$/.test((contact.phone ?? "").trim().replace(/[\s().-]/g, ""))
  )
    errors.phone = "Enter your phone number with country code.";
  return errors;
}
export function usdCents(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
export type PendingWithdrawal = {
  accountId: string;
  methodId: string;
  withdrawalCents: number;
  idempotencyKey: string;
};
export function sameWithdrawal(
  p: PendingWithdrawal | null,
  accountId: string,
  methodId: string,
  cents: number,
) {
  return (
    p?.accountId === accountId &&
    p.methodId === methodId &&
    p.withdrawalCents === cents
  );
}
export function safeProviderLink(
  link: string | null | undefined,
): string | null {
  try {
    const u = new URL(link ?? "");
    return u.protocol === "https:" &&
      (u.hostname === "remitly.com" || u.hostname.endsWith(".remitly.com")) &&
      !u.username &&
      !u.password
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}

export function parsePendingWithdrawal(
  raw: string | null,
  accountId: string,
): PendingWithdrawal | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    return p &&
      !Array.isArray(p) &&
      p.accountId === accountId &&
      typeof p.methodId === "string" &&
      p.methodId.length > 0 &&
      Number.isSafeInteger(p.withdrawalCents) &&
      (p.withdrawalCents === 1500 ||
        (p.withdrawalCents >= 2500 && p.withdrawalCents <= 50000)) &&
      typeof p.idempotencyKey === "string" &&
      /^[a-zA-Z0-9_-]{1,100}$/.test(p.idempotencyKey)
      ? p
      : null;
  } catch {
    return null;
  }
}
