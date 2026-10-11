import type { AgoraGiftEngineLease } from "./agoraGiftProbe";
import type { IRtcEngineEx } from "react-native-agora";
export type TestConnection = { channelId: string; localUid: number };
export type CompositorLease = AgoraGiftEngineLease & { primaryConnection: TestConnection | null };

/** Borrow the live engine, join only a secondary feed, and restore primary audio.
 * Never initialize, release, leave or republish the broadcaster's primary channel.
 */
export function openCompositorTest(lease: CompositorLease, config: {
  token: string; channelName: string; uid: number; publisherUid: number; hostUid: number;
}, onReady: () => void, onError: (message: string) => void) {
  const connection = { channelId: config.channelName, localUid: config.uid };
  // createAgoraRtcEngine returns RtcEngineExInternal but declares its base type.
  const engine = lease.engine as IRtcEngineEx;
  let closed = false, joined = false, primaryMuted = false;
  const current = () => !closed && lease.isCurrent();
  const matches = (c: { channelId?: string }) => current() && c.channelId === connection.channelId;
  const check = (value: number, label: string) => { if (value < 0) throw Error(`${label} (${value})`); };
  const handler = {
    onFirstRemoteVideoFrame: (c: TestConnection, uid: number) => { if (matches(c) && uid === config.publisherUid) onReady(); },
    onUserOffline: (c: TestConnection, uid: number) => { if (matches(c) && uid === config.publisherUid) onError("Server test ended"); },
    onConnectionStateChanged: (c: TestConnection, state: number) => { if (matches(c) && state === 5) onError("Test connection failed"); },
  };
  const close = () => {
    if (closed) return;
    closed = true;
    if (!lease.isCurrent()) return; // Never touch a replacement engine.
    try { engine.unregisterEventHandler(handler); } catch {}
    try { if (joined) engine.leaveChannelEx(connection, { stopMicrophoneRecording: false }); } catch {}
    try { if (primaryMuted && lease.primaryConnection) engine.muteRemoteAudioStreamEx(config.hostUid, false, lease.primaryConnection); } catch {}
  };
  try {
    if (!current()) throw Error("Live connection unavailable");
    engine.registerEventHandler(handler);
    if (lease.primaryConnection) {
      check(engine.muteRemoteAudioStreamEx(config.hostUid, true, lease.primaryConnection), "Could not isolate test audio");
      primaryMuted = true;
    }
    check(engine.joinChannelEx(config.token, connection, {
      channelProfile: 1, clientRoleType: 2, publishCameraTrack: false, publishMicrophoneTrack: false,
      autoSubscribeAudio: true, autoSubscribeVideo: true, isInteractiveAudience: true,
    }), "Could not join server test");
    joined = true;
    return { connection, close };
  } catch (error) { close(); throw error; }
}
