/** These controls keep the channel and its admission/presence alive. */
export function setBroadcastPaused(engine: any, paused: boolean, muted: boolean) {
  if (!engine) throw new Error("Live camera is unavailable.");
  if (paused) {
    // Stop local camera/audio immediately, before changing published tracks.
    const video = engine.muteLocalVideoStream(true);
    const audio = engine.muteLocalAudioStream(true);
    engine.stopAllEffects();
    if (video < 0 || audio < 0) throw new Error("Could not mute the broadcast.");
  }
  const result = engine.updateChannelMediaOptions({ publishCameraTrack: !paused, publishMicrophoneTrack: !paused });
  if (result < 0) throw new Error("Could not update the broadcast.");
  if (!paused) {
    const video = engine.muteLocalVideoStream(false);
    const audio = engine.muteLocalAudioStream(muted);
    if (video < 0 || audio < 0) {
      engine.muteLocalVideoStream(true);
      engine.muteLocalAudioStream(true);
      engine.updateChannelMediaOptions({ publishCameraTrack: false, publishMicrophoneTrack: false });
      throw new Error("Could not resume the broadcast.");
    }
  }
}
export function flipBroadcastCamera(engine: any) {
  if (!engine || engine.switchCamera() < 0) throw new Error("Could not flip the camera.");
}
