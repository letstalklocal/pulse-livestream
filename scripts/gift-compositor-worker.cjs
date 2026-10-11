// Development-only child process. Receives bounded, server-issued RTC credentials
// over IPC; never records cameras or accepts paths/URLs from a phone.
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
let browser, server, stopped = false;
async function stop() {
  if (stopped) return;
  stopped = true;
  const forced = setTimeout(() => process.exit(0), 2500);
  forced.unref();
  await browser?.close().catch(() => {});
  server?.close();
  process.exit(0);
}
process.on('disconnect', stop);
process.on('SIGTERM', stop);
process.once('message', async cfg => {
  try {
    const { chromium } = require(process.env.PULSE_PLAYWRIGHT_MODULE);
    const root = path.resolve(__dirname, '..');
    const gift = cfg.giftBase64 ? Buffer.from(cfg.giftBase64, 'base64') : await fs.readFile(cfg.giftPath);
    clearTimeout(lifetime);
    lifetime = setTimeout(stop, Math.min(1800000, Math.max(180000, cfg.lifetimeMs || 180000))); lifetime.unref();
    if (gift.length > 40 * 1024 * 1024) throw Error('Gift exceeds test limit');
    const sdk = await fetch('https://download.agora.io/sdk/release/AgoraRTC_N-4.24.8.js', { signal: AbortSignal.timeout(15000) });
    if (!sdk.ok) throw Error('SDK unavailable');
    const files = new Map([
      ['', ['text/html', Buffer.from('<!doctype html><canvas id="output" width="360" height="640"></canvas><div id="svga" style="width:360px;height:640px;position:absolute;left:-1000px"></div><script src="agora.js"></script><script src="svga.js"></script>')]],
      ['agora.js', ['application/javascript', Buffer.from(await sdk.arrayBuffer())]],
      ['svga.js', ['application/javascript', await fs.readFile(path.join(root, 'artifacts/admin/node_modules/svgaplayerweb/build/svga.min.js'))]],
      ['gift.svga', ['application/octet-stream', gift]],
    ]);
    if (cfg.customSoundBase64) {
      const sound = Buffer.from(cfg.customSoundBase64, 'base64');
      if (!sound.length || sound.length > 10 * 1024 * 1024) throw Error('Invalid custom sound');
      files.set('sound', ['application/octet-stream', sound]);
    }
    const prefix = `/${randomUUID()}/`;
    server = http.createServer((req, res) => {
      const entry = req.url?.startsWith(prefix) && files.get(req.url.slice(prefix.length));
      if (req.method !== 'GET' || !entry) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': entry[0], 'Cache-Control': 'no-store' }).end(entry[1]);
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ executablePath: process.env.PULSE_CHROMIUM_EXECUTABLE || '/repl/tools/bin/chromium', headless: true,
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
    const page = await browser.newPage();
    await page.exposeFunction('sourceLost', () => { process.send?.({ type: 'ended' }); void stop(); });
    await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
    await page.evaluate(async c => {
      AgoraRTC.setLogLevel(4); AgoraRTC.disableLogUpload();
      window.received = {};
      if (c.demo) return; // The server draws a synthetic background; no camera is subscribed.
      window.input = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      input.on('user-published', async (user, kind) => {
        if (Number(user.uid) !== c.hostUid) return;
        try { await input.subscribe(user, kind); received[kind] = kind === 'video' ? user.videoTrack : user.audioTrack; }
        catch { sourceLost(); }
      });
      input.on('user-unpublished', user => { if (Number(user.uid) === c.hostUid) sourceLost(); });
      input.on('user-left', user => { if (Number(user.uid) === c.hostUid) sourceLost(); });
      await input.setClientRole('audience');
      await input.join(c.appId, c.sourceChannel, c.sourceToken, c.sourceUid);
    }, cfg);
    if (!cfg.demo) await page.waitForFunction(() => !!received.video, null, { timeout: 20000 });
    const info = await page.evaluate(async c => {
      const loadStarted = performance.now();
      const item = await new Promise((resolve, reject) => new SVGA.Parser().load('gift.svga', resolve, reject));
      const duration = item.frames / item.FPS;
      if (!(duration > 0 && duration <= 60)) throw Error('Unsupported duration');
      const player = new SVGA.Player('#svga'); player.setVideoItem(item);
      const canvas = document.getElementById('output'), ctx = canvas.getContext('2d');
      const video = document.createElement('video'); video.muted = true; video.playsInline = true;
      if (!c.demo) { video.srcObject = new MediaStream([received.video.getMediaStreamTrack()]); await video.play(); }
      const audio = new AudioContext(); await audio.resume();
      const destination = audio.createMediaStreamDestination();
      // Keep the demo's audio stream producing frames before the first chime.
      // Without an input, WebAudio can leave the remote audio track waiting.
      if (c.demo) {
        const silence = audio.createOscillator(), gain = audio.createGain();
        gain.gain.value = 0; silence.connect(gain).connect(destination); silence.start();
      }
      let connectedAudio = null;
      // Custom admin audio overrides SVGA audio; otherwise preserve its frame
      // timing and seek offsets. Never substitute a default chime silently.
      const sounds = [];
      if (c.customSoundBase64) {
        const buffer = await audio.decodeAudioData(await (await fetch('sound')).arrayBuffer());
        sounds.push({ buffer, start: 0, offset: 0, end: Math.min(duration, buffer.duration) });
      } else {
        if ((item.audios?.length ?? 0) > 16) throw Error('Too many audio tracks');
        for (const track of item.audios ?? []) {
          const encoded = item.images[track.audioKey];
          if (typeof encoded !== 'string' || encoded.length > 14 * 1024 * 1024) throw Error('Invalid embedded audio');
          const bytes = Uint8Array.from(atob(encoded), x => x.charCodeAt(0));
          const buffer = await audio.decodeAudioData(bytes.buffer);
          const start = Math.max(0, (track.startFrame || 0) / item.FPS);
          const offset = Math.max(0, (track.startTime || 0) / 1000);
          const end = Math.min(duration, (track.endFrame || item.frames) / item.FPS, start + buffer.duration - offset);
          if ([start, offset, end].every(Number.isFinite) && end > start) sounds.push({ buffer, start, offset, end });
        }
      }
      let giftStarted = null;
      setInterval(() => {
        if (received.audio && connectedAudio !== received.audio) {
          connectedAudio = received.audio;
          audio.createMediaStreamSource(new MediaStream([received.audio.getMediaStreamTrack()])).connect(destination);
        }
        ctx.globalAlpha = 1;
        if (c.demo) {
          ctx.fillStyle = '#12517b'; ctx.fillRect(0, 0, 360, 640);
          ctx.fillStyle = '#a4ebff'; ctx.fillRect(performance.now() / 8 % 360, 0, 20, 640);
          ctx.fillStyle = 'white'; ctx.font = '18px sans-serif';
          ctx.fillText('SERVER DEMO · NO CAMERA', 20, 175);
          ctx.fillText(new Date().toISOString().slice(11, 23), 20, 205);
        } else {
          // Match a portrait cover viewport without stretching the host camera.
          const scale = Math.max(360 / video.videoWidth, 640 / video.videoHeight);
          ctx.drawImage(video, (360 - video.videoWidth * scale) / 2, (640 - video.videoHeight * scale) / 2, video.videoWidth * scale, video.videoHeight * scale);
        }
        if (giftStarted === null) return;
        const elapsed = (performance.now() - giftStarted) / 1000;
        if (elapsed >= duration) return;
        player.stepToFrame(Math.min(item.frames - 1, Math.floor(elapsed * item.FPS)), false);
        ctx.globalAlpha = Math.min(1, Math.max(0, duration - elapsed));
        const framing = c.framing || {}, scale = framing.scale || 1;
        const baseW = framing.preset === 'contained' ? 220 : 360;
        const baseH = framing.preset === 'contained' ? 220 : 640;
        ctx.drawImage(document.querySelector('#svga canvas'), (360 - baseW * scale) / 2 + (framing.x || 0) * 360,
          (640 - baseH * scale) / 2 + (framing.y || 0) * 640, baseW * scale, baseH * scale);
        ctx.globalAlpha = 1;
      }, 50);
      window.output = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      await output.setClientRole('host');
      await output.join(c.appId, c.outputChannel, c.outputToken, c.outputUid);
      await output.publish([
        AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: canvas.captureStream(20).getVideoTracks()[0], encoderConfig: { width: 360, height: 640, frameRate: 20, bitrateMin: 400, bitrateMax: 1200 } }),
        AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: destination.stream.getAudioTracks()[0] }),
      ]);
      window.startGift = () => {
        giftStarted = performance.now();
        const startedAt = audio.currentTime;
        for (const track of sounds) {
          const source = audio.createBufferSource(), gain = audio.createGain();
          source.buffer = track.buffer; source.connect(gain).connect(destination);
          const when = startedAt + track.start;
          gain.gain.setValueAtTime(Math.min(1, Math.max(0, duration - track.start)), when);
          gain.gain.setValueAtTime(Math.min(1, Math.max(0, duration - track.start)), Math.max(when, startedAt + duration - 1));
          gain.gain.linearRampToValueAtTime(0, startedAt + duration);
          source.onended = () => { source.disconnect(); gain.disconnect(); };
          source.start(when, track.offset, track.end - track.start);
        }
      };
      return { durationMs: Math.round(duration * 1000), loadMs: Math.round(performance.now() - loadStarted),
        audioSource: c.customSoundBase64 ? 'custom' : sounds.length ? 'embedded' : 'none', audioTracks: sounds.length };
    }, cfg);
    process.send?.({ type: 'ready', ...info, giftBytes: gift.length });
    let busyUntil = 0;
    process.on('message', async msg => {
      if (msg.type === 'stop') return void stop();
      if (msg.type !== 'trigger') return;
      if (Date.now() < busyUntil) { process.send?.({ type: 'rejected', giftId: msg.giftId }); return; }
      busyUntil = Date.now() + info.durationMs + 1000;
      try { await page.evaluate(() => startGift()); process.send?.({ type: 'played', giftId: msg.giftId }); }
      catch { process.send?.({ type: 'failed' }); void stop(); }
    });
  } catch {
    // SDK errors can contain tokens. Keep diagnostics generic outside the worker.
    process.send?.({ type: 'failed' }); void stop();
  }
});
let lifetime = setTimeout(stop, 180000); lifetime.unref();
