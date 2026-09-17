import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useGenerateAgoraToken, useUpdateViewerCount, useListStreams, useGetStream, useGetPrivateStreamInvitation, getGetStreamQueryKey, updateStreamPresence } from "@workspace/api-client-react";
import { ChannelProfileType, ClientRoleType, createEngine } from "@/utils/agora";
import { useStreamSocket } from "@/hooks/useStreamSocket";
import { usePremiumGiftRequest, premiumGiftRequestKey } from "@/hooks/usePremiumGiftRequest";
import { useLiveParty } from "@/hooks/useLiveParty";
import { usePartyMedia } from "@/hooks/usePartyMedia";

const isNative = Platform.OS === "ios" || Platform.OS === "android";
const preferenceKey = "pulse.picture-in-picture.enabled";
type Session = { channelId: string; privateInvitationId?: string; accountUid?: number; admitted: boolean };

function usePlaybackController() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [minimized, setMinimized] = useState(false);
  const minimizedRef = useRef(false);
  const [enabled, setEnabled] = useState(true);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(preferenceKey).then(value => {
      if (active) setEnabled(value !== "false");
    }).catch(() => {}).finally(() => { if (active) setPreferenceReady(true); });
    return () => { active = false; };
  }, []);
  const close = useCallback(() => {
    minimizedRef.current = false;
    setMinimized(false);
    sessionRef.current = null;
    setSession(null);
  }, []);
  const saveEnabled = useCallback(async (value: boolean) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await AsyncStorage.setItem(preferenceKey, String(value));
      setEnabled(value);
      if (!value && minimizedRef.current) close();
    } finally { savingRef.current = false; setSaving(false); }
  }, [close]);
  const attach = useCallback((channelId: string, privateInvitationId?: string) => {
    minimizedRef.current = false;
    setMinimized(false);
    if (sessionRef.current?.channelId === channelId && sessionRef.current.accountUid === user?.uid) return;
    const next = { channelId, privateInvitationId, accountUid: user?.uid, admitted: false };
    sessionRef.current = next;
    setSession(next);
  }, [user?.uid]);
  const detach = useCallback((channelId: string) => {
    if (sessionRef.current?.channelId === channelId && !minimizedRef.current) close();
  }, [close]);
  const admit = useCallback((channelId: string) => {
    setSession(previous => previous?.channelId === channelId ? { ...previous, admitted: true } : previous);
  }, []);
  const minimize = useCallback((channelId: string) => {
    if (!enabled || !preferenceReady || sessionRef.current?.channelId !== channelId) return false;
    minimizedRef.current = true;
    setMinimized(true);
    return true;
  }, [enabled, preferenceReady]);
  // Stop the audience engine before entering the broadcaster, and never retain
  // playback from another signed-in account. Native media is a singleton.
  const accountMatches = session?.accountUid === user?.uid;
  const channelId = accountMatches && pathname !== "/go-live" ? session?.channelId ?? "" : "";
  useEffect(() => {
    if (session && (!accountMatches || pathname === "/go-live")) close();
  }, [session, accountMatches, pathname, close]);
  const isDemo = channelId.endsWith("-demo");
  const isPrivateStream = channelId.startsWith("private-") || !!session?.privateInvitationId;
  const queryClient = useQueryClient();
  const streamQuery = useGetStream(channelId, { query: { enabled: !!channelId, refetchInterval: 5000 } as any });
  const stream = streamQuery.data?.stream;
  const streamList = useListStreams({ query: { enabled: !!channelId && isDemo } as any });
  const demoCategory = stream?.category ?? streamList.data?.streams?.find(item => item.channelId === channelId)?.category;
  const invitationQuery = useGetPrivateStreamInvitation(Number(session?.privateInvitationId), {
    query: { enabled: !!channelId && isPrivateStream && !!session?.privateInvitationId, refetchInterval: 1000 } as any,
  });
  const premiumGift = usePremiumGiftRequest(channelId, !!stream?.requiredGift && !isPrivateStream && !isDemo, user?.uid);
  const [restrictedByEvent, setRestrictedByEvent] = useState(false);
  const [streamEnded, setStreamEnded] = useState(false);
  const streamEndedRef = useRef(false);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [remoteVideoReady, setRemoteVideoReady] = useState(false);
  const [agoraError, setAgoraError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const engineRef = useRef<any>(null);
  const primaryRtcChannelRef = useRef("");
  const generateToken = useGenerateAgoraToken();
  const updateViewers = useUpdateViewerCount();
  useEffect(() => {
    streamEndedRef.current = false;
    setStreamEnded(false);
    setRestrictedByEvent(false);
  }, [channelId]);
  useEffect(() => {
    if (stream) setRestrictedByEvent(!!stream.viewerRemoved || !!stream.viewerBlocked);
  }, [stream]);
  const accessRestricted = streamQuery.error?.status === 403 || restrictedByEvent || !!stream?.viewerRemoved || !!stream?.viewerBlocked || premiumGift.removed || premiumGift.expired;
  const invitationEnded = !!invitationQuery.data?.invitation && invitationQuery.data.invitation.status !== "active";
  const missingStream = !isDemo && ((streamQuery.isSuccess && !stream) || streamQuery.error?.status === 404);
  const ended = streamEnded || invitationEnded || missingStream;
  const canEnterStream = !!channelId && !ended && !accessRestricted && (isDemo || !!stream) && (!stream?.requiredGift || !!session?.admitted || stream.viewerAdmitted === true);
  const hostUid = stream?.hostUid ?? (Number(channelId.split("-")[1]) || null);
  useEffect(() => {
    if (ended) streamEndedRef.current = true;
    if (minimized && (ended || accessRestricted)) close();
  }, [ended, accessRestricted, minimized, close]);
  useStreamSocket({
    channelId, enabled: !!channelId && !isDemo && !accessRestricted,
    onConnect: () => { void streamQuery.refetch(); },
    onMessage: event => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.type === "stream_ended") { streamEndedRef.current = true; setStreamEnded(true); }
        if (message.type === "stream_restricted") setRestrictedByEvent(true);
        if (message.type === "stream_updated" || message.type === "stream_restricted") {
          void queryClient.invalidateQueries({ queryKey: getGetStreamQueryKey(channelId) });
          void queryClient.invalidateQueries({ queryKey: premiumGiftRequestKey(channelId) });
        }
      } catch { /* Ignore malformed stream events. */ }
    },
  });
  useEffect(() => {
    if (!canEnterStream || isDemo || !user?.uid) return;
    const refresh = () => void updateStreamPresence(channelId, { action: "join" }).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => { clearInterval(timer); void updateStreamPresence(channelId, { action: "leave" }).catch(() => {}); };
  }, [channelId, canEnterStream, isDemo, user?.uid]);
  // Join Agora channel on native
  useEffect(() => {
    // Access loss must discard public-channel rendering state before admission.
    setJoined(false);
    setRemoteUid(null);
    setRemoteVideoReady(false);
    primaryRtcChannelRef.current = "";
    if (!channelId || !isNative || !canEnterStream) return;
    let didUnmount = false;
    let engine: any = null;
    const setupIsCancelled = () => didUnmount || streamEndedRef.current;
    const releaseSetupEngine = () => {
      // Agora returns a singleton wrapper. Clear this attempt's handle during
      // cleanup so its late token response cannot release a newer connection.
      const ownedEngine = engine;
      engine = null;
      if (!ownedEngine || engineRef.current !== ownedEngine) return;
      engineRef.current = null;
      try { ownedEngine.leaveChannel?.(); } catch (_error) {}
      try { ownedEngine.release?.(); } catch (_error) {}
    };
    const setup = async () => {
      try {
        if (setupIsCancelled()) return;
        setAgoraError(null);
        engine = createEngine();
        if (!engine) throw new Error("This development build does not include the Agora video module.");
        engineRef.current = engine;
        const appId = process.env["EXPO_PUBLIC_AGORA_APP_ID"] ?? "";
        if (!appId) throw new Error("Agora App ID is missing.");
        const initializeResult = engine.initialize({
          appId,
          channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
        });
        if (initializeResult < 0) throw new Error(`Agora initialization failed (${initializeResult}).`);
        const videoResult = engine.enableVideo();
        const audioResult = engine.enableAudio();
        if (videoResult < 0 || audioResult < 0) {
          throw new Error(`Agora media setup failed (${videoResult}, ${audioResult}).`);
        }
        engine.registerEventHandler({
          onError: (err: number, msg: string) => {
            console.warn("[Agora viewer] onError:", err, msg);
            if (!didUnmount) setAgoraError(`Live video error ${err}: ${msg || "Unknown Agora error"}`);
          },
          onJoinChannelSuccess: (connection: any, elapsed: number) => {
            if (connection?.channelId !== primaryRtcChannelRef.current) return;
            console.log("[Agora viewer] joined:", connection?.channelId, elapsed);
            if (!didUnmount) {
              setJoined(true);
              setAgoraError(null);
            }
          },
          onConnectionStateChanged: (connection: any, state: number, reason: number) => {
            if (connection?.channelId !== primaryRtcChannelRef.current) return;
            console.log(
              "[Agora viewer] connectionState channel:",
              connection?.channelId,
              "state:",
              state,
              "reason:",
              reason,
            );
            if (!didUnmount && reason === 3) { // Agora ConnectionChangedBannedByServer
              setRestrictedByEvent(true);
              void queryClient.invalidateQueries({ queryKey: getGetStreamQueryKey(channelId ?? "") });
              return;
            }
            if (!didUnmount && state === 5) {
              setAgoraError(`Could not connect to the live stream (reason ${reason}).`);
            }
          },
          onUserJoined: (_connection: any, uid: number, elapsed: number) => {
            if (_connection?.channelId !== primaryRtcChannelRef.current) return;
            console.log("[Agora viewer] onUserJoined uid:", uid, "elapsed:", elapsed);
            if (!didUnmount) setRemoteUid(uid);
          },
          onRemoteVideoStateChanged: (
            _connection: any,
            uid: number,
            state: number,
            reason: number,
            elapsed: number,
          ) => {
            if (_connection?.channelId !== primaryRtcChannelRef.current) return;
            console.log(
              "[Agora viewer] remoteVideoState uid:",
              uid,
              "state:",
              state,
              "reason:",
              reason,
              "elapsed:",
              elapsed,
            );
            if (didUnmount) return;
            setRemoteUid(uid);
            if (state === 2) {
              setRemoteVideoReady(true);
              setAgoraError(null);
            } else if (state === 0 || state === 4) {
              setRemoteVideoReady(false);
              if (state === 4) {
                setAgoraError(`The host video could not be decoded (reason ${reason}).`);
              }
            }
          },
          onFirstRemoteVideoFrame: (
            _connection: any,
            uid: number,
            width: number,
            height: number,
            elapsed: number,
          ) => {
            if (_connection?.channelId !== primaryRtcChannelRef.current) return;
            console.log(
              "[Agora viewer] firstRemoteVideoFrame uid:",
              uid,
              "size:",
              `${width}x${height}`,
              "elapsed:",
              elapsed,
            );
            if (!didUnmount) {
              setRemoteUid(uid);
              setRemoteVideoReady(true);
              setAgoraError(null);
            }
          },
          onUserOffline: (_conn: any, uid: number, reason: number) => {
            if (_conn?.channelId !== primaryRtcChannelRef.current) return;
            console.log("[Agora viewer] onUserOffline uid:", uid, "reason:", reason);
            if (!didUnmount) {
              setRemoteUid(null);
              setRemoteVideoReady(false);
            }
          },
        });
        const tokenData = await generateToken.mutateAsync({
          data: { channelName: channelId, uid: user?.uid ?? 0, role: "audience" },
        });
        if (setupIsCancelled() || engineRef.current !== engine) {
          releaseSetupEngine();
          return;
        }
        primaryRtcChannelRef.current = tokenData.channelName;
        const joinResult = engine.joinChannel(tokenData.token, tokenData.channelName, user?.uid ?? 0, {
          clientRoleType: ClientRoleType.ClientRoleAudience,
          autoSubscribeAudio: true,
          autoSubscribeVideo: true,
        });
        console.log("[Agora viewer] joinChannel result:", joinResult, "channel:", channelId);
        if (joinResult < 0) throw new Error(`Could not join the live stream (${joinResult}).`);
        // Explicitly unmute remote streams — Agora v4 can default to muted
        const videoUnmuteResult = engine.muteAllRemoteVideoStreams(false);
        const audioUnmuteResult = engine.muteAllRemoteAudioStreams(false);
        console.log(
          "[Agora viewer] remote unmute results video:",
          videoUnmuteResult,
          "audio:",
          audioUnmuteResult,
        );
        console.log("[Agora viewer] joined and unmuted remote streams");
        updateViewers.mutate({ channelId, data: { action: "join" } });
      } catch (e) {
        console.warn("[Agora viewer] setup error:", e);
        releaseSetupEngine();
        if (!setupIsCancelled()) {
          setAgoraError(e instanceof Error ? e.message : "Could not start live video.");
        }
      }
    };

    setup();
    return () => {
      didUnmount = true;
      releaseSetupEngine();
      try { updateViewers.mutate({ channelId, data: { action: "leave" } }); } catch (_e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, canEnterStream, stream?.rtcChannelName]);

  // Once joined, pre-set the remote uid from the known host uid so the
  // RtcTextureView mounts immediately — don't wait for onUserPublished
  // (which can fire before React has a chance to mount the view).
  useEffect(() => {
    if (joined && hostUid != null && remoteUid === null) {
      console.log("[Agora viewer] pre-setting remoteUid from hostUid:", hostUid);
      setRemoteUid(hostUid);
    }
  }, [joined, hostUid, remoteUid]);


  const partyState = useLiveParty(channelId, isNative && !isPrivateStream && !isDemo && canEnterStream);
  const partyMedia = usePartyMedia(engineRef, channelId, partyState.party, isNative && joined && canEnterStream, false);
  return { previewsBlocked: !!session || pathname === "/go-live", session, channelId, minimized, enabled, preferenceReady, saving, saveEnabled, attach, detach, admit, minimize, close,
    canEnterStream, accessRestricted, ended, joined, remoteUid, remoteVideoReady, agoraError, stream, demoCategory,
    backgroundImageUrl: stream?.hostBackgroundImageUrl ?? invitationQuery.data?.invitation?.backgroundImageUrl,
    premiumGift, partyState, partyMedia };
}
const PlaybackContext = createContext<ReturnType<typeof usePlaybackController> | null>(null);
export function LivePlaybackProvider({ children }: { children: React.ReactNode }) {
  const playback = usePlaybackController();
  return <PlaybackContext.Provider value={playback}>{children}</PlaybackContext.Provider>;
}
export function useLivePlayback() {
  const playback = useContext(PlaybackContext);
  if (!playback) throw new Error("LivePlaybackProvider is required");
  return playback;
}
