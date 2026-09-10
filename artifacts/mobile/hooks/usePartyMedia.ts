import { useEffect, useState, type RefObject } from "react";
import { actOnStreamParty, getPartyMedia, type LiveParty } from "@workspace/api-client-react";
import { openPartyConnection } from "@/utils/partyConnection";

export function usePartyMedia(engineRef: RefObject<any>, channelId: string, party: LiveParty | null, enabled: boolean, host: boolean) {
  const peer = party?.status === "active" ? party.participants.find(p => p.channelId !== channelId) : undefined;
  const [state, setState] = useState<{ connection: { channelId: string; localUid: number } | null; ready: boolean; error: string | null }>({ connection: null, ready: false, error: null });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setState({ connection: null, ready: false, error: null });
    const engine = engineRef.current;
    if (!enabled || !engine || !peer || !party) return;
    const dispose = openPartyConnection(engine, () => getPartyMedia(channelId), peer.uid, setState);
    return () => { void dispose(); };
  }, [enabled, engineRef, channelId, party?.id, peer?.uid, peer?.rtcChannelName, retry]);
  useEffect(() => {
    if (!state.error || !enabled || !peer) return;
    const timer = setTimeout(() => setRetry(n => n + 1), 4000);
    return () => clearTimeout(timer);
  }, [state.error, enabled, peer?.uid, retry]);
  useEffect(() => {
    if (!host || !enabled || !state.ready || !party) return;
    const ready = () => void actOnStreamParty(channelId, { action: "ready", partyId: party.id }).catch(() => {});
    ready();
    const timer = setInterval(ready, 5000);
    return () => clearInterval(timer);
  }, [host, enabled, state.ready, channelId, party?.id]);
  return { ...state, peer, retry: () => setRetry(n => n + 1) };
}
