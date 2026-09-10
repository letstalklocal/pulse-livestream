import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { deviceLanguage, LANGUAGES } from "@/constants/languages";

type Preferences = { consent: boolean; language: string; live: boolean; conversations: Record<string, boolean> };
const defaults: Preferences = { consent: false, language: "device", live: false, conversations: {} };
const writes = new Map<number, Promise<void>>();
export function useTranslationPreferences() {
  const { user } = useAuth();
  const uid = user?.uid;
  const client = useQueryClient();
  const key = ["translation-preferences", uid] as const;
  const storageKey = `pulse:translation:${uid}`;
  const query = useQuery({
    queryKey: key, enabled: !!uid, staleTime: Infinity,
    queryFn: async (): Promise<Preferences> => {
      const raw = await AsyncStorage.getItem(storageKey);
      try {
        const saved = raw ? JSON.parse(raw) : null;
        return {
          consent: saved?.consent === true,
          language: LANGUAGES.some(([code]) => code === saved?.language) ? saved.language : "device",
          live: saved?.live === true,
          conversations: saved?.conversations && typeof saved.conversations === "object" && !Array.isArray(saved.conversations)
            ? Object.fromEntries(Object.entries(saved.conversations).filter(([, value]) => typeof value === "boolean")) as Record<string, boolean> : {},
        };
      } catch { return defaults; }
    },
  });
  const update = async (change: Partial<Preferences>) => {
    if (!uid || !query.isSuccess) return;
    // Serialize writes so a slow earlier save cannot overwrite a later choice.
    const write = (writes.get(uid) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const current = client.getQueryData<Preferences>(key) ?? defaults;
      const next = { ...current, ...change, conversations: { ...current.conversations, ...change.conversations } };
      await AsyncStorage.setItem(storageKey, JSON.stringify(next));
      client.setQueryData(key, next);
    });
    writes.set(uid, write);
    try { await write; } finally { if (writes.get(uid) === write) writes.delete(uid); }
  };
  const preferences = query.data ?? defaults;
  return { preferences, ready: query.isSuccess, language: preferences.language === "device" ? deviceLanguage() : preferences.language, update };
}
