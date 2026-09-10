import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
export type PrivacyPreferences = { hideLocation: boolean; partyInvites: "everyone" | "friends"; postsVisibility: "everyone" | "friends" };
const defaults: PrivacyPreferences = { hideLocation: false, partyInvites: "everyone", postsVisibility: "everyone" };
const base = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
export function usePrivacyPreferences() {
  const { userId, getToken } = useAuth();
  const client = useQueryClient();
  const key = ["privacy-preferences",userId];
  const request = async (patch?: Partial<PrivacyPreferences>): Promise<PrivacyPreferences> => {
    const token = await getToken();
    if (!token) throw new Error("Please sign in again.");
    const response = await fetch(`${base}/api/privacy/preferences`, { method: patch ? "PATCH" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type":"application/json" }, ...(patch ? { body: JSON.stringify(patch) } : {}) });
    if (!response.ok) throw new Error(patch ? "Couldn't save privacy settings. Please try again." : "Couldn't load privacy settings. Please try again.");
    return response.json();
  };
  const query = useQuery({ queryKey:key,enabled:!!userId,queryFn:()=>request() });
  const save = useMutation({mutationFn:request,onSuccess:async data=>{
    await client.cancelQueries({queryKey:key});client.setQueryData(key,data);
    void client.invalidateQueries({ predicate:q=>typeof q.queryKey[0]==="string" && (q.queryKey[0].includes('/posts') || q.queryKey[0].includes('/party') || q.queryKey[0].includes('/users/')) });
  }});
  return {...query,preferences:query.data??defaults,save};
}
