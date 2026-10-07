export const withdrawalStatusKeys: Record<string, string> = {
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
};
export function withdrawalStatus(status: string) {
  return withdrawalStatusKeys[status] ?? "Withdrawal under review";
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
