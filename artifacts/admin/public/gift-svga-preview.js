// Runs in an opaque-origin sandbox. No admin tokens or API access are passed in.
(() => {
  let player, url, generation = 0, audio, tracks = [], sources = [], audioEnabled = false, duration = 0, fps = 20, lastFrame = -1;
  const canvas = document.getElementById('animation');
  const resize = () => {
    // SVGA draws in CSS pixels; a fixed 720x1280 backing store scales twice.
    canvas.width = Math.max(1, window.innerWidth);
    canvas.height = Math.max(1, window.innerHeight);
    player?.setContentMode('AspectFit');
  };
  window.addEventListener('resize', resize);
  const reply = (type, message) => parent.postMessage({type, message}, '*');
  const silence = () => {
    for (const source of sources) { try { source.stop(); } catch {} source.disconnect(); }
    sources = [];
  };
  const soundtrack = elapsed => {
    silence();
    if (!audioEnabled || audio?.state !== 'running') return;
    const now = audio.currentTime;
    for (const track of tracks) {
      const start = Math.max(elapsed, track.start);
      if (start >= track.end) continue;
      const source = audio.createBufferSource(), gain = audio.createGain();
      source.buffer = track.buffer; source.connect(gain).connect(audio.destination);
      const when = now + start - elapsed, end = now + track.end - elapsed;
      gain.gain.setValueAtTime(Math.min(1, Math.max(0, duration - start)), when);
      gain.gain.setValueAtTime(1, Math.max(when, now + duration - elapsed - 1));
      gain.gain.linearRampToValueAtTime(0, Math.max(end, now + duration - elapsed));
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      source.start(when, track.offset + start - track.start, track.end - start); sources.push(source);
    }
  };
  const play = async () => {
    const current = generation;
    if (audioEnabled) {
      if (!tracks.length) { reply('gift-svga-audio-error', 'This SVGA file has no embedded soundtrack.'); audioEnabled = false; }
      else {
        await audio.resume();
        if (current !== generation) return;
        if (audio.state !== 'running') reply('gift-svga-audio-error', 'Browser blocked audio. Click Play original animation audio to retry.');
      }
    }
    lastFrame = -1; player.startAnimation();
    soundtrack(0);
  };
  const stop = () => {
    generation++;
    silence(); tracks = []; audioEnabled = false;
    if (audio) void audio.close(); audio = null;
    player?.stopAnimation(true);
    if (url) URL.revokeObjectURL(url);
    url = null;
  };
  window.addEventListener('message', event => {
    if (event.source !== parent) return;
    const data = event.data;
    if (data?.type === 'gift-svga-stop') return stop();
    if (data?.type === 'gift-svga-audio-stop') { audioEnabled = false; silence(); return; }
    if (data?.type === 'gift-svga-pause') { silence(); return player?.pauseAnimation(); }
    if (data?.type === 'gift-svga-play') { void play().catch(error => reply('gift-svga-audio-error', error.message)); return; }
    if (data?.type !== 'gift-svga-load' || !(data.blob instanceof Blob)) return;
    stop();
    audioEnabled = data.audio === true;
    const current = generation;
    try {
      if (!window.SVGA) throw new Error('SVGA player unavailable.');
      resize();
      player = new SVGA.Player(canvas);
      player.loops = 0; player.clearsAfterStop = false;
      player.setContentMode('AspectFit');
      url = URL.createObjectURL(data.blob);
      new SVGA.Parser().load(url, async item => {
        if (current !== generation) return;
        try {
          duration = item.frames / item.FPS; fps = item.FPS;
          if ((item.audios?.length || 0) > 16) throw Error('SVGA has too many audio tracks.');
          if (item.audios?.length) {
            audio = new AudioContext();
            for (const track of item.audios) {
              const raw = item.images[track.audioKey];
              if (typeof raw !== 'string' || raw.length > 14 * 1024 * 1024) throw Error('Invalid SVGA soundtrack.');
              const buffer = await audio.decodeAudioData(Uint8Array.from(atob(raw), x => x.charCodeAt(0)).buffer);
              if (current !== generation) return;
              const start = Math.max(0, (track.startFrame || 0) / fps), offset = Math.max(0, (track.startTime || 0) / 1000);
              const end = Math.min(duration, (track.endFrame || item.frames) / fps, start + buffer.duration - offset);
              if (end > start) tracks.push({buffer, start, offset, end});
            }
          }
          player.setVideoItem(item);
          player.onFrame(frame => { if (frame < lastFrame) soundtrack(frame / fps); lastFrame = frame; });
          await play();
          if (current === generation) reply('gift-svga-playing');
        } catch (error) { if (current === generation) reply('gift-svga-error', error.message); }
      }, error => { if (current === generation) reply('gift-svga-error', error?.message || 'Unable to decode SVGA file.'); });
    } catch (error) { reply('gift-svga-error', error.message); }
  });
  window.addEventListener('pagehide', stop);
  reply('gift-svga-ready');
})();
