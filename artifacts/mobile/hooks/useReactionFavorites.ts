import { useRef } from "react";
import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isReactionEmoji } from "@/utils/reactionEmoji";
export const DEFAULT_REACTION_FAVORITES = ["❤️", "🔥", "👏", "😂", "😍", "🎉", "👍", "🙌"];
export type ReactionFavorites = { emojis: string[]; customized: boolean };
export function useReactionFavorites() {
  const { userId, getToken } = useAuth();
  const account = useRef(userId);
  account.current = userId;
  const client = useQueryClient();
  const key = ["reaction-favorites", userId];
  const request = async (emojis?: string[], signal?: AbortSignal, owner = userId): Promise<ReactionFavorites> => {
    const abort = new AbortController();
    const cancel = () => abort.abort();
    if (signal?.aborted) abort.abort();
    signal?.addEventListener("abort", cancel);
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error("Request timed out")); }, 12000); }),
        (async () => {
          const token = await getToken();
          if (!token || abort.signal.aborted || !owner || owner !== account.current) throw new Error("Sign in required");
          const domain = process.env.EXPO_PUBLIC_DOMAIN;
          const response = await fetch(`${domain ? `https://${domain}` : ""}/api/reaction-preferences`, {
            method: emojis ? "PUT" : "GET", signal: abort.signal,
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            ...(emojis ? { body: JSON.stringify({ emojis }) } : {}),
          });
          if (!response.ok) throw new Error("Reaction favorites unavailable");
          const data = await response.json();
          if (!Array.isArray(data.emojis) || data.emojis.length !== 8 || !data.emojis.every(isReactionEmoji) || new Set(data.emojis).size !== 8 || typeof data.customized !== "boolean") throw new Error("Invalid favorites");
          return data;
        })(),
      ]);
    } finally { clearTimeout(timer!); signal?.removeEventListener("abort", cancel); }
  };
  const query = useQuery({ queryKey: key, enabled: !!userId, queryFn: ({ signal }) => request(undefined, signal), retry: false });
  const save = useMutation({ mutationFn: ({ emojis, owner }: { emojis: string[]; owner: string | null | undefined }) => request(emojis, undefined, owner), onSuccess: async (data, variables) => {
    const ownerKey = ["reaction-favorites", variables.owner];
    await client.cancelQueries({ queryKey: ownerKey });
    client.setQueryData(ownerKey, data);
  } });
  return { ...query, save: { ...save, mutateAsync: (emojis: string[]) => save.mutateAsync({ emojis, owner: userId }) }, signedIn: !!userId, accountId: userId, favorites: query.data?.emojis ?? DEFAULT_REACTION_FAVORITES };
}
