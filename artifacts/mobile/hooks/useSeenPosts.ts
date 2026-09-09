import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";

const writes = new Map<number, Promise<unknown>>();
export function useSeenPosts() {
  const { user } = useAuth();
  const uid = user?.uid;
  const client = useQueryClient();
  const key = ["seen-posts", uid] as const;
  const storageKey = `pulse:seen-posts:${uid}`;
  const query = useQuery<number[]>({
    queryKey: key,
    enabled: !!uid,
    staleTime: Infinity,
    queryFn: async () => {
      const raw = await AsyncStorage.getItem(storageKey);
      try {
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)) : [];
      } catch { return []; }
    },
  });
  const markSeen = (ids: number[]) => {
    if (!uid || !query.isSuccess || !ids.length) return;
    const current = client.getQueryData<number[]>(key) ?? [];
    const next = [...new Set([...current, ...ids])];
    if (next.length === current.length) return;
    client.setQueryData(key, next);
    const write = (writes.get(uid) ?? Promise.resolve()).catch(() => {}).then(() =>
      AsyncStorage.setItem(storageKey, JSON.stringify(next)));
    writes.set(uid, write);
    void write.catch(() => {});
  };
  return { seen: query.data ?? [], ready: !!uid && query.isSuccess, markSeen };
}
