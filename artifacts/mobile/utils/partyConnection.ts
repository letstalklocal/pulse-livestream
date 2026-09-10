type Connection = { channelId: string; localUid: number };
type Token = { token: string; channelName: string; uid: number };
type State = { connection: Connection | null; ready: boolean; error: string | null };
const queues = new WeakMap<object, Promise<void>>();

/** Serialize secondary joins/leaves without releasing the primary live engine. */
export function openPartyConnection(engine: any, fetchToken: () => Promise<Token>, peerUid: number, onState: (state: State) => void) {
  let disposed = false;
  let connection: Connection | null = null;
  let joined = false;
  let ready = false;
  let refresh: ReturnType<typeof setInterval> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let leaveDone: (() => void) | undefined;
  const matches = (c: { channelId?: string }) => !!connection && c.channelId === connection.channelId;
  const emit = (error: string | null = null) => { if (!disposed) onState({ connection, ready, error }); };
  const renew = async () => {
    try {
      const token = await fetchToken();
      if (disposed || !connection) return;
      if (token.channelName !== connection.channelId) { ready = false; emit("Partner video changed. Reconnecting..."); return; }
      const result = engine.updateChannelMediaOptionsEx({ token: token.token }, connection);
      if (result < 0) throw new Error("Could not refresh partner video");
    } catch (e) {
      ready = false;
      emit(e instanceof Error ? e.message : "Partner connection interrupted");
    }
  };
  const handler = {
    onJoinChannelSuccess: (c: Connection) => { if (matches(c)) { joined = true; emit(); } },
    onFirstRemoteVideoFrame: (c: Connection, uid: number) => {
      if (matches(c) && uid === peerUid) { ready = true; clearTimeout(watchdog); emit(); }
    },
    onRemoteVideoStateChanged: (c: Connection, uid: number, state: number) => {
      if (!matches(c) || uid !== peerUid) return;
      ready = state === 2;
      if (ready) clearTimeout(watchdog);
      emit(state === 4 ? "Partner video interrupted" : null);
    },
    onUserOffline: (c: Connection, uid: number) => {
      if (matches(c) && uid === peerUid) { ready = false; emit("Partner disconnected"); }
    },
    onConnectionStateChanged: (c: Connection, state: number) => {
      if (!matches(c)) return;
      if (state === 1 || state === 4 || state === 5) { ready = false; emit("Reconnecting partner..."); }
    },
    onTokenPrivilegeWillExpire: (c: Connection) => { if (matches(c)) void renew(); },
    onLeaveChannel: (c: Connection) => {
      if (matches(c)) { joined = false; ready = false; leaveDone?.(); emit("Partner connection closed"); }
    },
  };
  const previous = queues.get(engine) ?? Promise.resolve();
  const start = previous.catch(() => {}).then(async () => {
    if (disposed) return;
    try {
      const token = await fetchToken();
      if (disposed) return;
      connection = { channelId: token.channelName, localUid: token.uid };
      engine.registerEventHandler(handler);
      const result = engine.joinChannelEx(token.token, connection, {
        channelProfile: 1, clientRoleType: 2,
        publishCameraTrack: false, publishMicrophoneTrack: false,
        autoSubscribeAudio: true, autoSubscribeVideo: true,
        isInteractiveAudience: true,
      });
      if (result < 0) throw new Error(`Could not connect partner video (${result})`);
      joined = true;
      emit();
      watchdog = setTimeout(() => { if (!ready) emit("Waiting for partner video"); }, 15000);
      refresh = setInterval(() => void renew(), 60000);
    } catch (e) { emit(e instanceof Error ? e.message : "Could not connect partner"); }
  });
  return async () => {
    if (disposed) return;
    disposed = true;
    clearInterval(refresh);
    clearTimeout(watchdog);
    const closing = start.then(async () => {
      clearInterval(refresh);
      clearTimeout(watchdog);
      if (connection && joined) {
        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, 3000);
          leaveDone = () => { clearTimeout(timer); resolve(); };
          try {
            if (engine.leaveChannelEx(connection, { stopMicrophoneRecording: false }) < 0) leaveDone();
          } catch { leaveDone(); }
        });
      }
      try { engine.unregisterEventHandler(handler); } catch {}
    });
    queues.set(engine, closing);
    await closing;
  };
}
