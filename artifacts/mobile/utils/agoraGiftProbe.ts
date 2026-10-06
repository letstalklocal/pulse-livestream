import type { IMediaPlayer, IMediaPlayerSourceObserver, IRtcEngine } from "react-native-agora";

export interface AgoraGiftEngineLease {
  engine: IRtcEngine;
  isCurrent: () => boolean;
}

/** Owns only a media player, never initializes/joins/releases the shared engine. */
export function createAgoraGiftProbe(lease: AgoraGiftEngineLease, callbacks: {
  opened: () => void; ended: () => void; error: (code: number) => void;
}) {
  if (!lease.isCurrent()) throw new Error("Agora session unavailable");
  let active = true;
  let finished = false;
  let opened = false;
  const player: IMediaPlayer = lease.engine.createMediaPlayer();
  const current = () => active && lease.isCurrent();
  const check = (method: string, result: number) => { if (result < 0) throw new Error(`Agora ${method} error ${result}`); };
  const observer: IMediaPlayerSourceObserver = {
    onPlayerSourceStateChanged(state, reason) {
      if (!current()) return;
      if (state === 2) { opened = true; callbacks.opened(); }
      else if ((state === 5 || state === 6) && !finished) { finished = true; callbacks.ended(); }
      else if (state === 100) { dispose(); callbacks.error(reason); }
    },
  };
  const dispose = () => {
    if (!active) return;
    active = false;
    // A retired engine's cleanup must never touch a replacement session.
    if (!lease.isCurrent()) return;
    try { player.unregisterPlayerSourceObserver(observer); } catch {}
    try { player.stop(); } catch {}
    try { lease.engine.destroyMediaPlayer(player); } catch {}
  };
  try {
    const id = player.getMediaPlayerId();
    if (id < 0) throw new Error(`Agora player ID ${id}`);
    check("registerPlayerSourceObserver", player.registerPlayerSourceObserver(observer));
    return { id, dispose,
      open(path: string) { if (current()) check("open", player.open(path, 0)); },
      play() {
        if (!current()) return;
        if (!opened) throw new Error("Agora open pending");
        // Media-dependent controls are valid only after the open callback.
        // Zero repeats means one complete playback.
        check("setLoopCount", player.setLoopCount(0));
        check("mute", player.mute(false));
        check("adjustPlayoutVolume", player.adjustPlayoutVolume(100));
        check("play", player.play());
      },
    };
  } catch (error) { dispose(); throw error; }
}
