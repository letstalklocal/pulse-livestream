export const APP_LANGUAGES = [
  ["en", "English"], ["es", "Español"], ["pt-BR", "Português (Brasil)"],
  ["ar", "العربية"], ["de", "Deutsch"], ["fr", "Français"],
  ["zh-CN", "简体中文"], ["hi", "हिन्दी"], ["id", "Bahasa Indonesia"], ["ja", "日本語"],
] as const;
export type AppLanguage = typeof APP_LANGUAGES[number][0];
export type AppLanguagePreference = AppLanguage | "device";
export type TranslationValues = Record<string, string | number | boolean | null | undefined>;
export type Catalog = Record<string, string>;
export function isLanguagePreference(value: unknown): value is AppLanguagePreference {
  return value === "device" || APP_LANGUAGES.some(([code]) => code === value);
}
export function resolveAppLanguage(locale: string): AppLanguage {
  const normalized = locale.replace(/_/g, "-").toLowerCase();
  if (/^zh(?:-|$)/.test(normalized)) return /(?:hant|tw|hk|mo)/.test(normalized) ? "en" : "zh-CN";
  const base = normalized.split("-")[0];
  if (base === "pt") return "pt-BR";
  return APP_LANGUAGES.find(([code]) => code === base)?.[0] ?? "en";
}
export function translateText(catalog: Catalog, source: string, values: TranslationValues = {}, fallback: Catalog = {}): string {
  const template = Object.prototype.hasOwnProperty.call(catalog, source) ? catalog[source] : Object.prototype.hasOwnProperty.call(fallback, source) ? fallback[source] : source;
  // Replace only known placeholders, once. User content is never reinterpreted as a key or markup.
  return template.replace(/\{(\w+)\}/g, (original, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return original;
    const value = values[key];
    return value == null || typeof value === "boolean" ? "" : String(value);
  });
}
