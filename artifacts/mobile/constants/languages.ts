export const LANGUAGES = [
  ["en", "English"], ["es", "Español"], ["pt", "Português"], ["fr", "Français"],
  ["de", "Deutsch"], ["it", "Italiano"], ["ar", "العربية"], ["hi", "हिन्दी"],
  ["id", "Bahasa Indonesia"], ["ja", "日本語"], ["ko", "한국어"], ["zh-CN", "简体中文"],
  ["zh-TW", "繁體中文"], ["ru", "Русский"], ["tr", "Türkçe"], ["vi", "Tiếng Việt"],
  ["th", "ไทย"], ["nl", "Nederlands"], ["pl", "Polski"], ["uk", "Українська"],
] as const;
export function deviceLanguage() {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || "en";
  if (locale.startsWith("zh")) return /TW|HK|Hant/i.test(locale) ? "zh-TW" : "zh-CN";
  const base = locale.split(/[-_]/)[0];
  return LANGUAGES.find(([code]) => code === base)?.[0] ?? "en";
}
