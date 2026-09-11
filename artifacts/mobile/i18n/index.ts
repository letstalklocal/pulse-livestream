import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { resolveAppLanguage, isLanguagePreference, translateText, type AppLanguage, type AppLanguagePreference, type TranslationValues, type Catalog } from "./core";
import en from "./locales/en.json";
import es from "./locales/es.json";
import pt from "./locales/pt-BR.json";
import ar from "./locales/ar.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import zh from "./locales/zh-CN.json";
import hi from "./locales/hi.json";
import id from "./locales/id.json";
import ja from "./locales/ja.json";
export { APP_LANGUAGES } from "./core";
export type { AppLanguagePreference } from "./core";
const catalogs: Record<AppLanguage, Catalog> = { en, es, "pt-BR": pt, ar, de, fr, "zh-CN": zh, hi, id, ja };
const storageKey = "pulse:app-language";
export function phoneAppLanguage(): AppLanguage {
  try { return resolveAppLanguage(Intl.DateTimeFormat().resolvedOptions().locale); } catch { return "en"; }
}
const arabicText = { writingDirection: "rtl" as const, textAlign: "right" as const };
function snapshot(preference: AppLanguagePreference, language: AppLanguage, ready: boolean) {
  let locale: string = language;
  if (preference === "device") {
    try { locale = Intl.DateTimeFormat().resolvedOptions().locale; } catch {}
  }
  return {
    preference, language, ready, locale,
    t: (source: string | null | undefined, values?: TranslationValues): string => translateText(catalogs[language], source ?? "", values, en),
    appLocale: () => locale,
    localizedTextStyle: () => language === "ar" ? arabicText : undefined,
    appNumber: (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, options).format(value),
    appDate: (value: Date, options?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, options).format(value),
  };
}
let state = snapshot("device", phoneAppLanguage(), false);
const listeners = new Set<() => void>();
function publish(preference: AppLanguagePreference, ready = true) {
  const language = preference === "device" ? phoneAppLanguage() : preference;
  const next = snapshot(preference, language, ready);
  if (state.preference === preference && state.language === language && state.ready === ready && state.locale === next.locale) return;
  state = next;
  listeners.forEach(listener => listener());
}
let initialization: Promise<void> | undefined;
export function initializeAppLanguage() {
  return initialization ??= AsyncStorage.getItem(storageKey).then(saved => {
    publish(isLanguagePreference(saved) ? saved : "device");
  }).catch(() => { publish("device"); });
}
let writes = Promise.resolve();
export function setAppLanguage(preference: AppLanguagePreference): Promise<void> {
  if (!isLanguagePreference(preference)) return Promise.reject(new Error("Unsupported app language"));
  const write = writes.catch(() => {}).then(async () => {
    await initializeAppLanguage();
    await AsyncStorage.setItem(storageKey, preference);
    publish(preference);
  });
  writes = write;
  return write;
}
export function refreshPhoneAppLanguage() { if (state.preference === "device") publish("device", state.ready); }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useAppLanguage() { return useSyncExternalStore(subscribe, () => state, () => state); }
export function t(source: string | null | undefined, values?: TranslationValues): string { return state.t(source, values); }
export function appLocale() { return state.appLocale(); }
export function localizedTextStyle() { return state.localizedTextStyle(); }
export function appNumber(value: number, options?: Intl.NumberFormatOptions) { return state.appNumber(value, options); }
export function appDate(value: Date, options?: Intl.DateTimeFormatOptions) { return state.appDate(value, options); }
