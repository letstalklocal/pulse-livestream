import { createHash } from "node:crypto";

export const TRANSLATION_LANGUAGES = new Set(["en", "es", "pt", "fr", "de", "it", "ar", "hi", "id", "ja", "ko", "zh-CN", "zh-TW", "ru", "tr", "vi", "th", "nl", "pl", "uk"]);
export type TranslationResult = { text: string; translated: boolean; targetLanguage: string; sourceLanguage?: string };
export const translationAvailable = () => !!process.env.GOOGLE_TRANSLATE_API_KEY;
const cache = new Map<string, { value: TranslationResult; expires: number }>();
const pending = new Map<string, Promise<TranslationResult>>();
let cooldownUntil = 0;
let daily = { day: "", characters: 0 };

export async function translateMessageText(scope: string, text: string, targetLanguage: string): Promise<TranslationResult> {
  if (!translationAvailable() || !TRANSLATION_LANGUAGES.has(targetLanguage)) throw new Error("Translation unavailable");
  // Scope cache entries to a message; callers must authorize access before every lookup.
  const key = createHash("sha256").update(JSON.stringify([scope, targetLanguage, text])).digest("hex");
  const now = Date.now();
  for (const [id, entry] of cache) if (entry.expires <= now) cache.delete(id);
  const cached = cache.get(key);
  if (cached) return cached.value;
  if (pending.has(key)) return pending.get(key)!;
  if (cooldownUntil > now || pending.size >= 20) throw new Error("Translation unavailable");
  const day = new Date().toISOString().slice(0, 10);
  if (daily.day !== day) daily = { day, characters: 0 };
  const setting = Number(process.env.TRANSLATION_DAILY_CHARACTER_LIMIT ?? 100000);
  const limit = Number.isFinite(setting) && setting >= 0 ? setting : 100000;
  const characters = [...text].length;
  if (daily.characters + characters > limit) throw new Error("Translation unavailable");
  daily.characters += characters;
  const request = (async () => {
    const response = await fetch("https://translation.googleapis.com/language/translate/v2", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": process.env.GOOGLE_TRANSLATE_API_KEY! },
      body: JSON.stringify({ q: text, target: targetLanguage, format: "text" }),
      signal: AbortSignal.timeout(8000), redirect: "error",
    });
    if (!response.ok) { cooldownUntil = Date.now() + 30000; throw new Error("Translation unavailable"); }
    const data = await response.json() as { data?: { translations?: { translatedText?: string; detectedSourceLanguage?: string }[] } };
    const result = data.data?.translations?.[0];
    if (typeof result?.translatedText !== "string") throw new Error("Translation unavailable");
    const sameLanguage = result.detectedSourceLanguage === targetLanguage;
    const value: TranslationResult = { text: sameLanguage ? text : result.translatedText,
      translated: !sameLanguage && result.translatedText !== text, targetLanguage,
      sourceLanguage: result.detectedSourceLanguage };
    if (cache.size >= 2000) cache.delete(cache.keys().next().value!);
    cache.set(key, { value, expires: Date.now() + 10 * 60_000 });
    return value;
  })();
  pending.set(key, request);
  try { return await request; } finally { pending.delete(key); }
}
// Expire cached translations even when there are no more requests. Never write them to disk.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) if (entry.expires <= now) cache.delete(key);
}, 60000).unref();
