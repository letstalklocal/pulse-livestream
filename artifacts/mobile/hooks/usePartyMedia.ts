import { useEffect, useRef, useState, type RefObject } from "react";
import { actOnStreamParty, getPartyMedia, type LiveParty } from "@workspace/api-client-react";
import { openPartyConnection } from "@/utils/partyConnection";

export function usePartyMedia(engineRef: RefObject<any>, channelId: string, party: LiveParty | null, enabled: boolean, host: boolean) {
  const peer = party?.status === "active" ? party.participants.find(p => p.channelId !== channelId) : undefined;
  const [state, setState] = useState<{ connection: { channelId: string; localUid: number } | null; ready: boolean; error: string | null }>({ connection: null, ready: false, error: null });
  const audioScope = `${party?.id ?? ""}:${peer?.uid ?? ""}`;
  const [audioPreference, setAudioPreference] = useState({ scope: "", muted: false });
  const audioMuted = audioPreference.scope === audioScope && audioPreference.muted;
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioRef = useRef({ scope: audioScope, muted: audioMuted });
  audioRef.current = { scope: audioScope, muted: audioMuted };
  useEffect(() => setAudioError(null), [audioScope]);
  const setAudioMuted = (muted: boolean) => {
    try {
      if (!enabled || !peer || !state.connection || !engineRef.current) throw new Error("Partner audio is reconnecting. Try again shortly.");
      const result = engineRef.current.muteRemoteAudioStreamEx(peer.uid, muted, state.connection);
      if (result < 0) throw new Error("Could not change partner audio. Please try again.");
      audioRef.current = { scope: audioScope, muted };
      setAudioPreference({ scope: audioScope, muted });
      setAudioError(null);
    } catch (e) { setAudioError(e instanceof Error ? e.message : "Could not change partner audio."); }
  };
  useEffect(() => {
    if (!enabled || !peer || !state.connection || !state.ready || !audioMuted) return;
    try {
      const result = engineRef.current?.muteRemoteAudioStreamEx(peer.uid, true, state.connection);
      if (result == null || result < 0) throw new Error("Could not restore partner audio mute. Please try again.");
      setAudioError(null);
    } catch (e) { setAudioError(e instanceof Error ? e.message : "Could not restore partner audio mute."); }
  }, [state, enabled, peer?.uid, audioMuted, engineRef]);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setState({ connection: null, ready: false, error: null });
    const engine = engineRef.current;
    if (!enabled || !engine || !peer || !party) return;
    const dispose = openPartyConnection(engine, () => getPartyMedia(channelId), peer.uid, setState, () => audioRef.current.scope === audioScope && audioRef.current.muted);
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
  return { ...state, peer, audioMuted, audioError, setAudioMuted, retry: () => setRetry(n => n + 1) };
}
