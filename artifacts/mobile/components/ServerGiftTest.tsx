import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStreamKeepAwake } from "@/hooks/useStreamKeepAwake";
import { RtcTextureViewComponent, VideoSourceType } from "@/utils/agora";
import { stickerApi } from "@/utils/liveStickers";
import { openCompositorTest, type CompositorLease, type TestConnection } from "@/utils/compositorTestConnection";

type Status = { ready: boolean; expiresAt: number; durationMs: number; audioSource?: string; token?: string; channelName?: string; uid?: number; publisherUid?: number };
// English diagnostic copy is confined to this Android development-only experiment.
export function ServerGiftTest({ channelId, hostUid, getToken, getLease, onClose }: {
  channelId: string; hostUid: number; getToken: () => Promise<string | null>;
  getLease: () => CompositorLease | null; onClose: () => void;
}) {
  useStreamKeepAwake();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState("Preparing server-rendered Mummy…");
  const [video, setVideo] = useState<{ connection: TestConnection; publisherUid: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [soundLabel, setSoundLabel] = useState("Checking gift audio…");
  // Clerk's getToken wrapper can change on every parent render (including live
  // status ticks). Read the latest callbacks without restarting the RTC session.
  const callbacks = useRef({ getToken, getLease });
  callbacks.current = { getToken, getLease };
  const sessionToken = useCallback(() => callbacks.current.getToken(), []);
  const id = useRef<string | null>(null);
  const alive = useRef(false);
  const actionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    alive.current = true;
    setFailed(false); setReady(false); setBusy(false); setVideo(null);
    setStatus("Preparing server-rendered Mummy…");
    let stopped = false, frameSeen = false, connection: ReturnType<typeof openCompositorTest> | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const stop = () => {
      if (stopped) return;
      stopped = true; alive.current = false;
      clearTimeout(timer); clearTimeout(actionTimer.current);
      connection?.close();
      if (id.current) void stickerApi(`/gift-compositor-test/${id.current}`, sessionToken, "DELETE").catch(() => {});
      id.current = null;
    };
    const fail = (message: string) => { if (!stopped) { setReady(false); setFailed(true); setVideo(null); setStatus(message); stop(); } };
    const poll = async () => {
      if (stopped || !id.current) return;
      try {
        const result = await stickerApi<Status>(`/gift-compositor-test/${id.current}`, sessionToken);
        if (stopped) return;
        if (Date.now() >= result.expiresAt) throw Error("Three-minute test finished. Close to return to the live.");
        const lease = callbacks.current.getLease();
        if (!lease) throw Error("Live connection ended");
        if (result.ready && !connection) {
          setSoundLabel(result.audioSource === "embedded" ? "Original SVGA audio" : result.audioSource === "custom" ? "Admin-selected sound" : "No soundtrack in this gift");
          if (!result.token || !result.channelName || !result.uid || !result.publisherUid) throw Error("Incomplete test connection");
          connection = openCompositorTest(lease, { token: result.token, channelName: result.channelName,
            uid: result.uid, publisherUid: result.publisherUid, hostUid },
          () => { if (!stopped) { frameSeen = true; setReady(true); setStatus("Server feed ready · no coins charged"); } }, fail);
          setVideo({ connection: connection.connection, publisherUid: result.publisherUid });
          setStatus("Connecting to the server feed…");
        }
        if (Date.now() - startedAt > 45000 && !frameSeen) throw Error("Server video timed out. Close and try again.");
        timer = setTimeout(() => void poll(), 2000);
      } catch (e) { fail(e instanceof Error ? e.message : "Server test unavailable"); }
    };
    void stickerApi<{ id: string }>("/gift-compositor-test/start", sessionToken, "POST", { channelId }).then(result => {
      if (stopped) { void stickerApi(`/gift-compositor-test/${result.id}`, sessionToken, "DELETE").catch(() => {}); return; }
      id.current = result.id; void poll();
    }).catch(e => fail(e instanceof Error ? e.message : "Could not start test"));
    const appState = AppState.addEventListener("change", state => { if (state !== "active") { stop(); closeRef.current(); } });
    return () => { appState.remove(); stop(); };
  }, [channelId, hostUid, sessionToken]);
  const play = async () => {
    if (!id.current || busy || !ready) return;
    const playingSession = id.current;
    setBusy(true);
    try {
      const result = await stickerApi<{ durationMs: number }>(`/gift-compositor-test/${id.current}/play`, sessionToken, "POST");
      if (alive.current && id.current === playingSession) actionTimer.current = setTimeout(() => { if (alive.current && id.current === playingSession) setBusy(false); }, result.durationMs + 1000);
    } catch (e) { if (alive.current && id.current === playingSession) { setBusy(false); setStatus(e instanceof Error ? e.message : "Test playback failed"); } }
  };
  const Video = RtcTextureViewComponent;
  return <Modal visible animationType="fade" onRequestClose={onClose}>
    <View style={styles.page}>
      {video && Video ? <Video style={StyleSheet.absoluteFill} connection={video.connection}
        canvas={{ uid: video.publisherUid, sourceType: VideoSourceType.VideoSourceRemote }} /> : failed ? null : <ActivityIndicator color="#fff" />}
      <View style={[styles.top, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Server gift test · Android</Text>
        <Text style={styles.text}>{channelId.endsWith("-demo") ? "One-phone demo · moving server picture, not a camera" : "Only you see this test feed. No recording or payment."}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.button}><Text style={styles.title}>Close test</Text></TouchableOpacity>
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.text}>{status}</Text>
        <TouchableOpacity accessibilityRole="button" disabled={!ready || busy} onPress={() => void play()} style={[styles.button, (!ready || busy) && { opacity: 0.4 }]}>
          <Text style={styles.title}>{busy ? "Playing…" : "Play Mummy · free test"}</Text>
        </TouchableOpacity>
        <Text style={styles.text}>27.6 MB SVGA stays on the server · {soundLabel} · expires after 3 minutes</Text>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#000", justifyContent: "center" },
  top: { position: "absolute", top: 0, left: 0, right: 0, padding: 16, gap: 8, backgroundColor: "#0009" },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, gap: 12, backgroundColor: "#0009" },
  title: { color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center" },
  text: { color: "#fff", textAlign: "center", fontSize: 13 },
  button: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#fff", minHeight: 48 },
});
