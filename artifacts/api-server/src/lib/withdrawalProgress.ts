type ProgressInput = {
  status: string;
  providerLink?: string | null;
  checker?: { status?: string } | null;
  quote?: unknown;
  recipientIssue?: { fields: readonly string[] } | null;
  recipientCorrection?: { hash?: string } | null;
  recordedStage?: "recipient" | "processing" | null;
};

const steps = [
  ["requested", "Requested"],
  ["preparing", "Preparation"],
  ["review", "Payment review"],
  ["recipient", "Recipient setup"],
  ["processing", "Processing"],
  ["delivered", "Delivered"],
] as const;

const labels: Record<string, string> = {
  awaiting_quote: "Awaiting a current quote",
  awaiting_confirmation: "Preparing withdrawal",
  requested: "Preparing withdrawal",
  preparing: "Preparing withdrawal",
  awaiting_human_review: "Awaiting human review",
  awaiting_recipient: "Awaiting recipient details",
  processing: "Processing",
  delivered: "Delivery verified",
  failed: "Failed",
  canceled: "Canceled",
  returned: "Returned",
};

/** Presentation and operator guidance only; never authorizes retry or payment. */
export function withdrawalProgress(w: ProgressInput) {
  const uncertain = ["unknown", "expired"].includes(w.status);
  const identified = uncertain && !!w.recipientIssue?.fields.length;
  const corrected =
    identified &&
    !!w.recipientCorrection?.hash &&
    w.recipientIssue!.fields.every(
      (field) => field === "phone" || field === "email",
    );
  const stage = corrected
    ? "correction_saved"
    : identified
      ? "error_identified"
      : uncertain
        ? "error_unknown"
        : w.status;
  const statusLabel = corrected
    ? "Correction saved — awaiting processing"
    : identified
      ? "Error — identified"
      : uncertain
        ? "Error — awaiting identification"
        : (labels[w.status] ?? "Withdrawal under review");
  let index = 0;
  if (["awaiting_confirmation", "requested", "preparing"].includes(w.status))
    index = 1;
  if (w.status === "awaiting_human_review") index = 2;
  if (w.status === "awaiting_recipient") index = 3;
  if (w.status === "processing") index = 4;
  if (w.status === "delivered" || w.status === "returned") index = 5;
  if (uncertain || ["failed", "canceled"].includes(w.status)) {
    // Show only milestones supported by saved records, never guessed delivery.
    index =
      w.recordedStage === "processing"
        ? 4
        : w.recordedStage === "recipient" || w.providerLink
          ? 3
          : w.checker
            ? 2
            : w.quote || identified
              ? 1
              : 0;
  }
  return {
    stage,
    statusLabel,
    currentStep: steps[index][0],
    blocked: uncertain || ["failed", "canceled", "returned"].includes(w.status),
    nextAction: corrected
      ? "verify_saved_correction"
      : identified
        ? "correct_recipient_details"
        : uncertain
          ? "identify_error"
          : ["delivered", "failed", "canceled", "returned"].includes(w.status)
            ? "none"
            : "continue",
    steps: steps.map(([key, label], i) => ({
      key,
      label,
      state:
        i < index || (i === index && w.status === "delivered")
          ? "complete"
          : i === index
            ? "current"
            : "upcoming",
    })),
  };
}
