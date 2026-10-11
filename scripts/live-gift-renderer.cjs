// One isolated renderer per host feed. Only trusted backend IPC supplies assets.
// No browser/client URLs, payment APIs, ledger writes or camera recording.
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
let browser, server, page, stopping = false;
const assets = new Map();
const assetKeys = new Map();
async function stop() {
  if (stopping) return; stopping = true;
  setTimeout(() => process.exit(0), 2500).unref();
  await browser?.close().catch(() => {}); server?.close(); process.exit(0);
}
process.on('disconnect', stop); process.on('SIGTERM', stop);
function send(message) { if (process.connected) process.send(message); }
process.once('message', async cfg => {
  try {
    const { chromium } = process.env.PULSE_PLAYWRIGHT_MODULE ? require(process.env.PULSE_PLAYWRIGHT_MODULE) : require('playwright-core');
    const root = path.resolve(__dirname, '..');
    const sdk = await fetch('https://download.agora.io/sdk/release/AgoraRTC_N-4.24.8.js', { signal: AbortSignal.timeout(15000) });
    if (!sdk.ok) throw Error('SDK unavailable');
    const files = new Map([
      ['', ['text/html', Buffer.from('<!doctype html><canvas id="output" width="360" height="640"></canvas><script src="agora.js"></script><script src="svga.js"></script>')]],
      ['agora.js', ['application/javascript', Buffer.from(await sdk.arrayBuffer())]],
      ['svga.js', ['application/javascript', await fs.readFile(cfg.svgaScript || path.join(root, 'artifacts/admin/node_modules/svgaplayerweb/build/svga.min.js'))]],
    ]);
    const prefix = `/${randomUUID()}/`;
    server = http.createServer((req, res) => {
      const key = req.url?.startsWith(prefix) ? req.url.slice(prefix.length) : '';
      const entry = req.url?.startsWith(prefix) && (files.get(key) || assets.get(key));
      if (req.method !== 'GET' || !entry) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': entry[0], 'Cache-Control': 'no-store' }).end(entry[1]);
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const executablePath = cfg.chromiumExecutable || process.env.PULSE_CHROMIUM_EXECUTABLE;
    if (!executablePath) throw Error('Chromium executable was not configured by the delivery service');
    browser = await chromium.launch({ executablePath, headless: true,
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
    page = await browser.newPage();
    await page.exposeFunction('sourceEnded', () => { send({ type: 'ended' }); void stop(); });
    await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
    await page.evaluate(async c => {
      AgoraRTC.setLogLevel(4); AgoraRTC.disableLogUpload();
      const input = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      const output = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      const audio = new AudioContext(); await audio.resume();
      const destination = audio.createMediaStreamDestination();
      const silence = audio.createOscillator(), silentGain = audio.createGain();
      silentGain.gain.value = 0; silence.connect(silentGain).connect(destination); silence.start();
      const hostVideo = document.createElement('video'); hostVideo.muted = true; hostVideo.playsInline = true;
      let hostAudio, hostAudioTrack, sawVideo = !!c.demo;
      const canvas = document.getElementById('output'), ctx = canvas.getContext('2d');
      input.on('user-published', async (user, kind) => {
        if (Number(user.uid) !== c.hostUid) return;
        try {
          await input.subscribe(user, kind);
          if (kind === 'video') { hostVideo.srcObject = new MediaStream([user.videoTrack.getMediaStreamTrack()]); await hostVideo.play(); sawVideo = true; }
          else {
            hostAudio?.disconnect(); hostAudioTrack = user.audioTrack;
            hostAudio = audio.createMediaStreamSource(new MediaStream([hostAudioTrack.getMediaStreamTrack()])); hostAudio.connect(destination);
          }
        } catch { sourceEnded(); }
      });
      input.on('user-unpublished', (user, kind) => { if (Number(user.uid) === c.hostUid && kind === 'audio') { hostAudio?.disconnect(); hostAudio = null; } });
      input.on('user-left', user => { if (Number(user.uid) === c.hostUid) sourceEnded(); });
      input.on('connection-state-change', state => { if (state === 'DISCONNECTED') sourceEnded(); });
      if (!c.demo) { await input.setClientRole('audience'); await input.join(c.appId, c.sourceChannel, c.sourceToken, c.sourceUid); }
      await new Promise((resolve, reject) => {
        const started = performance.now();
        const tick = () => sawVideo ? resolve() : performance.now() - started > 20000 ? reject(Error('No host video')) : setTimeout(tick, 100);
        tick();
      });
      const prepared = new Map(), playing = new Map();
      function imageGiftFrame(elapsed, duration, mode, entrance, exitType, settings = {}) {
        entrance = entrance || (mode === 'fade' ? 'fade' : 'pop');
        exitType = exitType || (mode === 'fade' ? 'fade' : 'float-up');
        const clamp = value => Math.max(0, Math.min(1, value));
        if (settings.imageEnterMs !== undefined || settings.imageHoldMs !== undefined || settings.imageExitMs !== undefined || settings.imageFeel !== undefined || entrance === 'none' || exitType === 'none') {
          const entryDuration = entrance === 'none' ? 0 : (settings.imageEnterMs ?? 1000) / 1000;
          const exitDuration = exitType === 'none' ? 0 : (settings.imageExitMs ?? 1000) / 1000;
          const entry = entryDuration ? clamp(elapsed / entryDuration) : 1;
          const exit = exitDuration ? clamp((elapsed - duration + exitDuration) / exitDuration) : 0;
          const feel = settings.imageFeel || 'smooth';
          const ease = t => feel === 'bouncy' ? 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2) : 1 - Math.pow(1 - t, feel === 'snappy' ? 5 : 3);
          const peak = feel === 'bouncy' ? 1.4 : feel === 'snappy' ? 1.08 : 1.25;
          const entryProgress = feel === 'snappy' ? ease(clamp(entry / .35)) : ease(entry);
          const snapExit = clamp((exit - .65) / .35);
          const pop = feel === 'snappy' ? .35 + .65 * entryProgress : entry < .33 ? .35 + (peak - .35) * ease(entry / .33) : peak + (1 - peak) * ease((entry - .33) / .67);
          const out = feel === 'snappy' ? snapExit * snapExit : exit * exit;
          const scale = (entrance === 'pop' ? pop : 1) * (exitType === 'shrink' ? 1 - .65 * out : exitType.startsWith('float') ? 1 + .12 * out : 1);
          const y = (entrance === 'slide-up' ? 150 : entrance === 'slide-down' ? -150 : 0) * (1 - entryProgress) + (exitType === 'float-up' ? -150 : exitType === 'float-down' ? 150 : 0) * out;
          return { scale, y, opacity: (entrance === 'none' ? 1 : feel === 'snappy' ? entryProgress : entry) * (1 - (feel === 'snappy' ? snapExit : exit)) };
        }
        const exit = clamp((elapsed - (duration - 1)));
        const opacity = Math.min(clamp(elapsed / .18), 1 - exit);
        const cubic = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const entryScale = entrance !== 'pop' ? 1 : elapsed < .32 ? .35 + .9 * (1 - Math.pow(1 - clamp(elapsed / .32), 3))
          : elapsed < .97 ? 1.25 - .25 * cubic(clamp((elapsed - .32) / .65)) : 1;
        const exitScale = exitType === 'shrink' ? 1 - .65 * exit * exit : exitType.startsWith('float') ? 1 + .12 * exit * exit : 1;
        const entryY = (entrance === 'slide-up' ? 150 : entrance === 'slide-down' ? -150 : 0) * Math.pow(1 - clamp(elapsed / .38), 3);
        const exitY = (exitType === 'float-up' ? -150 : exitType === 'float-down' ? 150 : 0) * exit * exit;
        return { scale: entryScale * exitScale, y: entryY + exitY, opacity };
      }
      window.cachedGiftIds = () => [...prepared.keys()];
      const dispose = item => { item.video?.pause(); item.node?.remove(); item.mediaAudio?.disconnect(); };
      window.prepareGift = async gift => {
        if (prepared.has(gift.revisionId)) return;
        // Bound decoded memory, not just compressed transfer bytes. Active players
        // are protected; overflow is surfaced to the coordinator, never hidden.
        while (prepared.size >= 3) {
          const victim = [...prepared.keys()].find(key => ![...playing.values()].some(p => p.item.gift.revisionId === key));
          if (!victim) throw Error('Renderer capacity');
          dispose(prepared.get(victim)); prepared.delete(victim);
        }
        const item = { gift, sounds: [], duration: 3 };
        if (gift.type === 'image' && (gift.framing.imageEnterMs !== undefined || gift.framing.imageHoldMs !== undefined || gift.framing.imageExitMs !== undefined || gift.framing.imageFeel !== undefined || gift.framing.imageEntrance === 'none' || gift.framing.imageExit === 'none')) {
          const f = gift.framing;
          item.duration = ((f.imageEntrance === 'none' ? 0 : f.imageEnterMs ?? 1000) + (f.imageHoldMs ?? 1000) + (f.imageExit === 'none' ? 0 : f.imageExitMs ?? 1000)) / 1000;
        }
        const asset = gift.asset;
        if (asset?.format === 'svga') {
          const data = await new Promise((resolve, reject) => new SVGA.Parser().load(asset.url, resolve, reject));
          if (!(data.frames / data.FPS > 0 && data.frames / data.FPS <= 60)) throw Error('SVGA duration');
          let decodedBytes = 0;
          const rasters = [];
          if (Object.keys(data.images || {}).length > 512) throw Error('SVGA image limit');
          for (const [key, encoded] of Object.entries(data.images || {})) {
            if (typeof encoded !== 'string') continue;
            const header = Uint8Array.from(atob(encoded.slice(0, 64)), x => x.charCodeAt(0));
            if (header[0] === 137 && header[1] === 80 && header.length >= 24) {
              const dimensions = new DataView(header.buffer), width = dimensions.getUint32(16), height = dimensions.getUint32(20);
              if (!width || !height || width > 4096 || height > 4096) throw Error('SVGA image dimensions');
              decodedBytes += width * height * 4;
              rasters.push({ key, width, height });
            }
          }
          // Large full-frame SVGA sequences previously tripped global fallback,
          // where older hosts publish a chime instead of the embedded soundtrack.
          // Keep the existing memory ceiling: shrink rasters, not movie geometry
          // or audio. Decode one source at a time and retain only smaller images.
          const resized = [];
          if (decodedBytes > 128 * 1024 * 1024) {
            const ratio = Math.sqrt(96 * 1024 * 1024 / decodedBytes);
            const scratch = document.createElement('canvas');
            for (const { key, width, height } of rasters) {
              const bytes = Uint8Array.from(atob(data.images[key]), x => x.charCodeAt(0));
              scratch.width = Math.max(1, Math.floor(width * ratio)); scratch.height = Math.max(1, Math.floor(height * ratio));
              const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), {
                resizeWidth: scratch.width, resizeHeight: scratch.height, resizeQuality: 'high',
              });
              try { scratch.getContext('2d').drawImage(bitmap, 0, 0); }
              finally { bitmap.close(); }
              data.images[key] = scratch.toDataURL('image/png').split(',')[1];
              resized.push({ key: key.replace('.matte', ''), encoded: data.images[key], transform: [width / scratch.width, 0, 0, height / scratch.height, 0, 0] });
            }
            scratch.width = scratch.height = 1;
          }
          const node = document.createElement('div'); node.id = 'gift-' + crypto.randomUUID();
          const size = data.videoSize || { width: 360, height: 640 };
          const fit = Math.min(360 / size.width, 640 / size.height);
          node.style.cssText = `width:${size.width * fit}px;height:${size.height * fit}px;position:absolute;left:-1000px`; document.body.append(node);
          item.node = node; item.player = new SVGA.Player('#' + node.id); item.player.setVideoItem(data); item.data = data;
          for (const raster of resized) item.player.setImage(raster.encoded, raster.key, raster.transform);
          item.duration = data.frames / data.FPS;
          if (!gift.sound) {
            if ((data.audios?.length || 0) > 16) throw Error('Audio limit');
            for (const track of data.audios || []) {
              const raw = data.images[track.audioKey];
              if (typeof raw !== 'string' || raw.length > 14 * 1024 * 1024) throw Error('Audio limit');
              const buffer = await audio.decodeAudioData(Uint8Array.from(atob(raw), x => x.charCodeAt(0)).buffer);
              const start = Math.max(0, (track.startFrame || 0) / data.FPS), offset = Math.max(0, (track.startTime || 0) / 1000);
              const end = Math.min(item.duration, (track.endFrame || data.frames) / data.FPS, start + buffer.duration - offset);
              if (end > start) item.sounds.push({ buffer, start, offset, end });
            }
          }
        } else if (['webm-alpha', 'packed-alpha-mp4'].includes(asset?.format)) {
          const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = asset.url;
          await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; video.load(); });
          if (!(video.duration > 0 && video.duration <= 60)) throw Error('Video duration');
          item.video = video; item.duration = video.duration;
          if (!gift.sound) {
            item.mediaAudio = audio.createMediaElementSource(video); item.videoGain = audio.createGain();
            item.mediaAudio.connect(item.videoGain).connect(destination); video.muted = false;
          }
          if (asset.format === 'packed-alpha-mp4') {
            item.mask = document.createElement('canvas'); item.mask.width = 360; item.mask.height = 640;
            item.color = document.createElement('canvas'); item.color.width = 360; item.color.height = 640;
          }
        } else if (asset) {
          const image = new Image(); image.src = asset.url; await image.decode(); item.image = image;
        }
        if (gift.sound) {
          const buffer = await audio.decodeAudioData(await (await fetch(gift.sound.url)).arrayBuffer());
          item.sounds.push({ buffer, start: 0, offset: 0, end: Math.min(item.duration, buffer.duration) });
        }
        if (!gift.sound && !item.sounds.length && !item.video && gift.defaultSound) {
          const buffer = await audio.decodeAudioData(await (await fetch(gift.defaultSound.url)).arrayBuffer());
          item.sounds.push({ buffer, start: 0, offset: 0, end: Math.min(item.duration, buffer.duration) });
        }
        prepared.set(gift.revisionId, item);
      };
      window.playGift = async event => {
        const template = prepared.get(event.revisionId);
        if (!template) throw Error('Gift not prepared');
        const key = event.combo?.id || event.giftId;
        const previous = playing.get(key);
        if (previous) { previous.count = Math.max(previous.count, event.combo?.count || 1); return template.duration * 1000; }
        while (playing.size >= 3) await new Promise(resolve => setTimeout(resolve, 50));
        const item = { ...template };
        if (template.video) {
          // Independent media clock for different senders using the same gift.
          item.video = template.video.cloneNode(true); item.video.muted = true;
          if (template.mediaAudio) {
            item.mediaAudio = audio.createMediaElementSource(item.video); item.videoGain = audio.createGain();
            item.mediaAudio.connect(item.videoGain).connect(destination); item.video.muted = false;
          }
          await item.video.play();
        }
        const start = performance.now(), audioStart = audio.currentTime;
        const sounds = [];
        for (const track of item.sounds) {
          const source = audio.createBufferSource(), gain = audio.createGain(); source.buffer = track.buffer; source.connect(gain).connect(destination);
          gain.gain.setValueAtTime(1, audioStart + track.start);
          gain.gain.setValueAtTime(1, Math.max(audioStart + track.start, audioStart + item.duration - 1)); gain.gain.linearRampToValueAtTime(0, audioStart + item.duration);
          source.onended = () => { source.disconnect(); gain.disconnect(); };
          source.start(audioStart + track.start, track.offset, track.end - track.start); sounds.push(source);
        }
        playing.set(key, { item, start, count: event.combo?.count || 1, sounds }); return item.duration * 1000;
      };
      setInterval(() => {
        ctx.globalAlpha = 1;
        if (c.demo) { ctx.fillStyle = '#12517b'; ctx.fillRect(0, 0, 360, 640); ctx.fillStyle = 'white'; ctx.fillRect(performance.now() / 8 % 360, 0, 15, 640); }
        else if (hostVideo.videoWidth) {
          const fit = Math.max(360 / hostVideo.videoWidth, 640 / hostVideo.videoHeight);
          ctx.drawImage(hostVideo, (360 - hostVideo.videoWidth * fit) / 2, (640 - hostVideo.videoHeight * fit) / 2, hostVideo.videoWidth * fit, hostVideo.videoHeight * fit);
        }
        for (const [key, p] of playing) {
          const { item } = p, { gift } = item;
          const elapsed = item.video ? item.video.currentTime : (performance.now() - p.start) / 1000;
          if (elapsed >= item.duration || item.video?.ended) { item.video?.pause(); if (item.video) item.mediaAudio?.disconnect(); playing.delete(key); continue; }
          const gain = Math.min(1, Math.max(0, item.duration - elapsed)); ctx.globalAlpha = gain;
          const motion = gift.type === 'image' ? imageGiftFrame(elapsed, item.duration, gift.framing.imageMotion, gift.framing.imageEntrance, gift.framing.imageExit, gift.framing) : { scale: 1, y: 0, opacity: gain };
          ctx.globalAlpha = motion.opacity;
          if (item.videoGain) item.videoGain.gain.value = gain;
          let source = item.image || item.video;
          if (item.player) { item.player.stepToFrame(Math.min(item.data.frames - 1, Math.floor(elapsed * item.data.FPS)), false); source = item.node.querySelector('canvas'); }
          if (item.mask) {
            const mask = item.mask.getContext('2d', { willReadFrequently: true }), color = item.color.getContext('2d');
            mask.drawImage(item.video, 0, 0, item.video.videoWidth / 2, item.video.videoHeight, 0, 0, 360, 640);
            const pixels = mask.getImageData(0, 0, 360, 640);
            for (let i = 0; i < pixels.data.length; i += 4) pixels.data[i + 3] = pixels.data[i];
            mask.putImageData(pixels, 0, 0); color.clearRect(0, 0, 360, 640);
            color.globalCompositeOperation = 'source-over'; color.drawImage(item.video, item.video.videoWidth / 2, 0, item.video.videoWidth / 2, item.video.videoHeight, 0, 0, 360, 640);
            color.globalCompositeOperation = 'destination-in'; color.drawImage(item.mask, 0, 0); source = item.color;
          }
          if (source) {
            const f = gift.framing, image = gift.type === 'image';
            const aw = (gift.asset?.width || item.image?.naturalWidth || item.video?.videoWidth || item.data?.videoSize?.width || 360) / (gift.asset?.format === 'packed-alpha-mp4' ? 2 : 1), ah = gift.asset?.height || item.image?.naturalHeight || item.video?.videoHeight || item.data?.videoSize?.height || 640;
            const fit = image ? Math.min(180 / aw, 220 / ah) * (f.artworkScale || 1) : (f.preset === 'fullscreen' ? Math.max(360 / aw, 640 / ah) : Math.min(360 / aw, 640 / ah)) * f.scale;
            const w = aw * fit * motion.scale, h = ah * fit * motion.scale; ctx.drawImage(source, (360 - w) / 2 + f.x * 360, (640 - h) / 2 + f.y * 640 + motion.y, w, h);
          } else { ctx.font = '100px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(gift.emoji || '', 180, 360); }
          if (p.count > 1) { ctx.fillStyle = '#FFD700'; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('×' + p.count, 180, 65); }
        }
        ctx.globalAlpha = 1;
      }, 50);
      await output.setClientRole('host'); await output.join(c.appId, c.outputChannel, c.outputToken, c.hostUid);
      await output.publish([
        AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: canvas.captureStream(20).getVideoTracks()[0], encoderConfig: { width: 360, height: 640, frameRate: 20, bitrateMin: 400, bitrateMax: 1200 } }),
        AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: destination.stream.getAudioTracks()[0] }),
      ]);
      window.renew = async tokens => { await input.renewToken(tokens.sourceToken); await output.renewToken(tokens.outputToken); };
    }, cfg);
    send({ type: 'ready' });
    let chain = Promise.resolve();
    process.on('message', message => {
      if (message.type === 'stop') return void stop();
      chain = chain.then(async () => {
        if (message.type === 'renew') return page.evaluate(tokens => renew(tokens), message);
        if (!['prepare', 'play'].includes(message.type)) return;
        const gift = structuredClone(message.gift);
        const keys = [];
        try {
          for (const field of ['asset', 'sound', 'defaultSound']) if (gift[field]) {
            const bytes = Buffer.from(gift[field].base64, 'base64');
            if (!bytes.length || bytes.length > 32 * 1024 * 1024) throw Error('Asset limit');
            const key = 'asset-' + randomUUID(); keys.push(key); assets.set(key, [gift[field].mime || 'application/octet-stream', bytes]);
            delete gift[field].base64; gift[field].url = key;
          }
          await page.evaluate(g => prepareGift(g), gift);
          if (!assetKeys.has(gift.revisionId)) assetKeys.set(gift.revisionId, keys);
          else for (const key of keys) assets.delete(key);
          const cached = await page.evaluate(() => cachedGiftIds());
          for (const [revision, owned] of assetKeys) if (!cached.includes(revision)) {
            for (const key of owned) assets.delete(key); assetKeys.delete(revision);
          }
          if ([...assets.values()].reduce((n, entry) => n + entry[1].length, 0) > 96 * 1024 * 1024) throw Error('Asset memory limit');
          if (message.type === 'play') {
            const durationMs = await page.evaluate(e => playGift(e), { ...message.event, revisionId: gift.revisionId });
            send({ type: 'played', giftId: message.event.giftId, durationMs });
          }
        } catch (error) { for (const key of keys) assets.delete(key); throw error; }
      }).catch(() => { if (message.type === 'prepare') send({ type: 'prepare-failed' }); else { send({ type: 'failed' }); void stop(); } });
    });
  } catch { send({ type: 'failed' }); void stop(); }
});
