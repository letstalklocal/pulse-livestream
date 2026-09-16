import { isAdultDate } from "./didit";

// Development terms are still a preview; final launch terms need a new version.
export const SIGNUP_TERMS_VERSION = "pulse-terms-preview-2026-09-16";
export function signupEligibility(value: unknown, now = new Date()): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Complete your birthday and agree to the Terms of Service.";
  const { dateOfBirth, termsAccepted, termsVersion } = value as Record<string, unknown>;
  if (typeof dateOfBirth !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return "Enter a valid birthday.";
  const date = new Date(`${dateOfBirth}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateOfBirth || date.getUTCFullYear() < 1900 || date > now) return "Enter a valid birthday.";
  if (!isAdultDate(dateOfBirth, now)) return "You must be 18 or older to use Pulse.";
  if (termsAccepted !== true || termsVersion !== SIGNUP_TERMS_VERSION) return "Please agree to the current Terms of Service.";
  return null;
}
