export const SIGNUP_TERMS_VERSION = "pulse-terms-preview-2026-09-16";
export interface SignupDeclaration { dateOfBirth: string; termsAccepted: boolean; termsVersion: string }
export function birthdayDigits(value: string) {
  return value.replace(/[٠-٩]/g, char => String(char.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, char => String(char.charCodeAt(0) - 0x6f0)).replace(/[०-९]/g, char => String(char.charCodeAt(0) - 0x966))
    .replace(/[０-９]/g, char => String(char.charCodeAt(0) - 0xff10)).replace(/[^0-9]/g, "");
}
export function birthdayFromParts(day: string, month: string, year: string) {
  return /^\d{1,2}$/.test(day) && /^\d{1,2}$/.test(month) && /^\d{4}$/.test(year)
    ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` : "";
}
export function birthdayError(value: string, now = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Enter a valid birthday.";
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 1900 || date > now) return "Enter a valid birthday.";
  // UTC calendar boundary, shared with server policy: Feb 29 reaches 18 on March 1.
  const eighteenth = new Date(Date.UTC(date.getUTCFullYear() + 18, date.getUTCMonth(), date.getUTCDate()));
  return now >= eighteenth ? null : "You must be 18 or older to use Pulse.";
}
