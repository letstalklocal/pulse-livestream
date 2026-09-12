import { createHmac, timingSafeEqual } from "node:crypto";

export class VerificationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const verificationEnvironment = () => process.env.DIDIT_ENVIRONMENT === "live" ? "live" : "sandbox";
export function verificationOrigin() {
  const value = process.env.VERIFICATION_PUBLIC_ORIGIN;
  if (!value) throw new VerificationError(503, "Verification is not available yet. Please try again later.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new VerificationError(503, "Verification is not available yet. Please try again later.");
  return url.origin;
}
export function verificationConfigured() {
  try {
    verificationOrigin();
    const privacy = new URL(process.env.PULSE_PRIVACY_URL ?? "");
    return !!(process.env.DIDIT_API_KEY && process.env.DIDIT_WORKFLOW_ID && process.env.DIDIT_WEBHOOK_SECRET)
      && privacy.protocol === "https:" && !privacy.username && !privacy.password
      && !(process.env.NODE_ENV === "production" && verificationEnvironment() !== "live");
  } catch { return false; }
}
export function requireVerificationConfiguration(uid: number) {
  if (!verificationConfigured()) throw new VerificationError(503, "Verification is not available yet. Please try again later.");
  if (verificationEnvironment() === "sandbox" && !(process.env.DIDIT_TEST_USER_IDS ?? "").split(",").map(s => s.trim()).includes(String(uid)))
    throw new VerificationError(503, "Verification is not available yet. Please try again later.");
}
export async function diditRequest(path: string, body?: Record<string, unknown>): Promise<Record<string, any>> {
  const response = await fetch(`https://verification.didit.me/v3/${path}`, {
    method: body ? "POST" : "GET",
    headers: { "x-api-key": process.env.DIDIT_API_KEY!, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (!response.ok) throw new VerificationError(502, "The verification service is unavailable. Please try again later.");
  const result = await response.json();
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new VerificationError(502, "Invalid verification response.");
  return result;
}
export function safeDiditUrl(value: unknown): string {
  if (typeof value !== "string") throw new VerificationError(502, "Invalid verification link.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "verify.didit.me" || url.username || url.password || url.port)
    throw new VerificationError(502, "Invalid verification link.");
  return url.href;
}
export function isAdultDate(value: unknown, now = new Date()): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date > now || date.getUTCFullYear() < 1900) return false;
  // UTC calendar birthday: a leap-day birthday reaches the boundary on March 1 in a non-leap year.
  const eighteenth = new Date(Date.UTC(date.getUTCFullYear() + 18, date.getUTCMonth(), date.getUTCDate()));
  return now >= eighteenth;
}
const approved = (value: unknown) => typeof value === "string" && value.toLowerCase() === "approved";
export function decisionStatus(decision: Record<string, any>, now = new Date()) {
  const status = String(decision.status ?? "").toLowerCase().replaceAll("_", " ");
  if (["declined", "rejected", "expired", "abandoned", "cancelled"].includes(status)) return "failed";
  if (status === "in review") return "review_needed";
  if (!approved(decision.status)) return "pending";
  const ids = decision.id_verifications;
  const lives = decision.liveness_checks;
  const faces = decision.face_matches;
  // Require documentary identity + liveness + face match, not a bare overall Approved flag.
  if (![ids, lives, faces].every(a => Array.isArray(a) && a.length > 0 && a.every(v => v && approved(v.status)))) return "review_needed";
  if (!ids.every((v: any) => (!v.verification_method || v.verification_method === "document") && isAdultDate(v.date_of_birth, now))) return "failed";
  return "verified";
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  // Didit's V2 canonicalizer rounds non-integral floats to six decimal places.
  if (typeof value === "number" && !Number.isInteger(value)) return JSON.stringify(Number(value.toFixed(6)));
  return JSON.stringify(value);
}
export function verifyDiditWebhook(raw: Buffer, v2: string | undefined, signature: string | undefined, timestamp: string | undefined, secret: string, now = Date.now()) {
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw.toString("utf8")); } catch { return false; }
  if (!body || typeof body !== "object" || Number(body.timestamp) !== Number(timestamp)) return false;
  const matches = (data: string | Buffer, received?: string) => {
    if (!received || !/^[a-f0-9]{64}$/i.test(received)) return false;
    return timingSafeEqual(createHmac("sha256", secret).update(data).digest(), Buffer.from(received, "hex"));
  };
  return matches(canonical(body), v2) || matches(raw, signature);
}
