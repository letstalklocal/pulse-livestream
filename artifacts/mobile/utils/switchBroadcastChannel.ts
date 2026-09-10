// Keep publishing disabled until the old channel has been left. Tokens for the
// old current channel must not receive frames from the new Premium broadcast.
export async function switchBroadcastChannel(
  engine: any, token: string, channelName: string, uid: number, muted: boolean,
  stillActive: () => boolean, currentChannelName?: string,
) {
  if (engine.getConnectionState() !== 1) {
    const publish = engine.updateChannelMediaOptions({ publishCameraTrack: false, publishMicrophoneTrack: false });
    if (publish < 0) throw new Error(`Could not pause the current broadcast (${publish}).`);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error("Leaving the current stream timed out.")); }, 10000);
      const handler = { onLeaveChannel: (connection?: { channelId?: string }) => {
        if (currentChannelName && connection?.channelId !== currentChannelName) return;
        cleanup(); resolve();
      } };
      const cleanup = () => { clearTimeout(timer); engine.unregisterEventHandler(handler); };
      engine.registerEventHandler(handler);
      const result = engine.leaveChannel();
      if (result < 0) { cleanup(); reject(new Error(`Could not leave the current channel (${result}).`)); }
    });
  }
  if (!stillActive()) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error("Reconnecting live video timed out. Retrying…")); }, 15000);
    const handler = {
      onJoinChannelSuccess: (connection: { channelId?: string }) => {
        if (connection.channelId === channelName) { cleanup(); resolve(); }
      },
    };
    const cleanup = () => { clearTimeout(timer); engine.unregisterEventHandler(handler); };
    engine.registerEventHandler(handler);
    engine.muteLocalAudioStream(muted);
    const result = engine.joinChannel(token, channelName, uid, {
      clientRoleType: 1, publishCameraTrack: true, publishMicrophoneTrack: true,
    });
    if (result < 0) { cleanup(); reject(new Error(`Could not reconnect live video (${result}).`)); }
  });
}
