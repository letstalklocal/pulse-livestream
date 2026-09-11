import policy from "./terminology.json";
import type { Catalog } from "./core";
const placeholders = (value: string) => (value.match(/\{\w+\}/g) ?? []).sort().join("|");
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function validateCatalog(source: Catalog, candidate: unknown, requireComplete = true): string[] {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return ["Catalog must be a JSON object."];
  const errors: string[] = [];
  const values = candidate as Record<string, unknown>;
  for (const [key, original] of Object.entries(source)) {
    const translated = values[key];
    if (translated === undefined && !requireComplete) continue;
    if (typeof translated !== "string" || !translated.trim()) { errors.push(`Missing translation: ${key}`); continue; }
    if (placeholders(original) !== placeholders(translated)) errors.push(`Placeholder mismatch: ${key}`);
    for (const term of policy.protectedTerms) {
      const expression = new RegExp(`(?<![A-Za-z])${escape(term)}(?![A-Za-z])`, "g");
      if ((original.match(expression)?.length ?? 0) > (translated.match(expression)?.length ?? 0)) errors.push(`Protected term ${term}: ${key}`);
    }
  }
  for (const key of Object.keys(values)) if (!Object.prototype.hasOwnProperty.call(source, key)) errors.push(`Unknown key: ${key}`);
  return errors;
}
