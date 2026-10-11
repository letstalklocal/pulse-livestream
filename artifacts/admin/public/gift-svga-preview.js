// Runs in an opaque-origin sandbox. No admin tokens or API access are passed in.
(() => {
  let player, url, generation = 0;
  const canvas = document.getElementById('animation');
  const resize = () => {
    // SVGA draws in CSS pixels; a fixed 720x1280 backing store scales twice.
    canvas.width = Math.max(1, window.innerWidth);
    canvas.height = Math.max(1, window.innerHeight);
    player?.setContentMode('AspectFit');
  };
  window.addEventListener('resize', resize);
  const reply = (type, message) => parent.postMessage({type, message}, '*');
  const stop = () => {
    generation++;
    player?.stopAnimation(true);
    if (url) URL.revokeObjectURL(url);
    url = null;
  };
  window.addEventListener('message', event => {
    if (event.source !== parent) return;
    const data = event.data;
    if (data?.type === 'gift-svga-stop') return stop();
    if (data?.type === 'gift-svga-pause') return player?.pauseAnimation();
    if (data?.type === 'gift-svga-play') return player?.startAnimation();
    if (data?.type !== 'gift-svga-load' || !(data.blob instanceof Blob)) return;
    stop();
    const current = generation;
    try {
      if (!window.SVGA) throw new Error('SVGA player unavailable.');
      resize();
      player = new SVGA.Player(canvas);
      player.loops = 0; player.clearsAfterStop = false;
      player.setContentMode('AspectFit');
      url = URL.createObjectURL(data.blob);
      new SVGA.Parser().load(url, item => {
        if (current !== generation) return;
        player.setVideoItem(item); player.startAnimation(); reply('gift-svga-playing');
      }, error => { if (current === generation) reply('gift-svga-error', error?.message || 'Unable to decode SVGA file.'); });
    } catch (error) { reply('gift-svga-error', error.message); }
  });
  window.addEventListener('pagehide', stop);
  reply('gift-svga-ready');
})();
