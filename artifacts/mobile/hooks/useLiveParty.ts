import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { actOnStreamParty, getStreamParty, type PartyAction } from "@workspace/api-client-react";

export function useLiveParty(channelId: string, enabled: boolean) {
  const client = useQueryClient();
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  const key = ["live-party", channelId];
  const query = useQuery({
    queryKey: key, queryFn: () => getStreamParty(channelId),
    enabled: enabled && !!channelId, refetchInterval: 1000, retry: 1,
  });
  const mutation = useMutation({
    mutationFn: (data: PartyAction) => actOnStreamParty(channelId, data),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  const party = enabled && !query.isError && clock - query.dataUpdatedAt < 10000 ? query.data?.party ?? null : null;
  const now = (query.data?.serverTime ?? clock) + Math.max(0, clock - query.dataUpdatedAt);
  return { party, now, query, mutation, act: mutation.mutateAsync };
}
