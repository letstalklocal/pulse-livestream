/** Isolated, bounded Agora experiment. Never joins an application live or charges coins.
 * Requires AGORA_APP_ID / AGORA_APP_CERTIFICATE in the environment.
 * PULSE_PLAYWRIGHT_MODULE and PULSE_CHROMIUM_EXECUTABLE may select existing tooling.
 * Run: node scripts/test-server-gift-compositor.cjs
 * Optional PULSE_TEST_SVGA is a local .svga file (at most 40 MiB).
 * This headless-browser prototype is NOT an Agora Server Gateway implementation.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const apiRequire = createRequire(path.join(root, 'artifacts/api-server/package.json'));
const { RtcTokenBuilder, RtcRole } = apiRequire('agora-token');
const { chromium } = require(process.env.PULSE_PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const appId = process.env.AGORA_APP_ID, certificate = process.env.AGORA_APP_CERTIFICATE;
  if (!appId || !certificate) throw Error('Agora credentials are not configured');
  const giftFile = process.env.PULSE_TEST_SVGA || path.join(root, 'artifacts/mobile/assets/gifts/luxury/Virtual-Kiss-Gift.svga');
  const stat = await fs.stat(giftFile);
  if (!giftFile.toLowerCase().endsWith('.svga') || stat.size > 40 * 1024 * 1024) throw Error('Use a local SVGA up to 40 MiB');
  const channel = `gift-poc-${randomUUID()}`;
  const nonce = randomUUID();
  const output = await fs.mkdtemp('/tmp/pulse-server-gift-poc-');
  const sdkResponse = await fetch('https://download.agora.io/sdk/release/AgoraRTC_N-4.24.8.js', { signal: AbortSignal.timeout(15000) });
  if (!sdkResponse.ok) throw Error('Could not load the pinned Agora Web SDK');
  const files = {
    'agora.js': ['application/javascript', Buffer.from(await sdkResponse.arrayBuffer())],
    'svga.js': ['application/javascript', await fs.readFile(path.join(root, 'artifacts/admin/node_modules/svgaplayerweb/build/svga.min.js'))],
    'gift.svga': ['application/octet-stream', await fs.readFile(giftFile)],
    'sound.mp3': ['audio/mpeg', await fs.readFile(path.join(root, 'artifacts/mobile/assets/moments/default-gift.mp3'))],
    '': ['text/html', Buffer.from('<!doctype html><html><body style="margin:0;background:#111"><canvas id="output" width="360" height="640"></canvas><div id="svga" style="position:absolute;left:-1000px;width:360px;height:640px"></div><script src="agora.js"></script></body></html>')],
  };
  const requests = [];
  const server = http.createServer((req, res) => {
    const prefix = `/${nonce}/`;
    const entry = req.url.startsWith(prefix) ? files[req.url.slice(prefix.length)] : null;
    if (req.method !== 'GET' || !entry) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': entry[0], 'Cache-Control': 'no-store' }); res.end(entry[1]);
  });
  let browser;
  const deadline = setTimeout(() => { void browser?.close().catch(() => {}); server.close(); }, 90000);
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, executablePath: process.env.PULSE_CHROMIUM_EXECUTABLE || '/repl/tools/bin/chromium',
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
    const pages = {};
    for (const role of ['source', 'worker', 'viewer']) {
      const page = await browser.newPage({ viewport: { width: 360, height: 640 } });
      page.on('request', r => { if (/\/(gift\.svga|sound\.mp3|svga\.js)$/.test(r.url())) requests.push({ role, asset: r.url().split('/').pop() }); });
      await page.goto(`http://127.0.0.1:${server.address().port}/${nonce}/`);
      pages[role] = page;
    }
    // Five-minute tokens are restricted to a random disposable channel and role UID.
    const token = uid => RtcTokenBuilder.buildTokenWithUid(appId, certificate, channel, uid,
      uid === 103 ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER, 300, 300);
    for (const [role, uid, upstream] of [['worker', 102, 101], ['viewer', 103, 102], ['source', 101, null]]) {
      console.log(`Joining isolated ${role}`);
      await pages[role].evaluate(async cfg => {
        AgoraRTC.setLogLevel(4); AgoraRTC.disableLogUpload();
        window.client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
        window.received = {};
        client.on('user-published', async (user, kind) => {
          if (Number(user.uid) !== cfg.upstream) return;
          try {
            await client.subscribe(user, kind);
            received[kind] = kind === 'video' ? user.videoTrack : user.audioTrack;
          } catch { window.subscribeFailed = true; }
        });
        await client.setClientRole(cfg.role === 'viewer' ? 'audience' : 'host');
        await client.join(cfg.appId, cfg.channel, cfg.token, cfg.uid);
      }, { role, uid, upstream, appId, channel, token: token(uid) });
    }
    await pages.source.evaluate(async () => {
      const canvas = document.getElementById('output'), ctx = canvas.getContext('2d');
      const start = performance.now();
      window.sourceTimer = setInterval(() => {
        ctx.fillStyle = '#12517b'; ctx.fillRect(0, 0, 360, 640);
        ctx.fillStyle = '#a4ebff'; ctx.fillRect((performance.now() - start) / 8 % 360, 0, 20, 640);
        ctx.fillStyle = 'white'; ctx.font = '20px sans-serif'; ctx.fillText('SYNTHETIC BROADCAST', 28, 50);
        ctx.fillText(String(Math.round(performance.now() - start)), 28, 80);
      }, 50);
      const ac = new AudioContext(); await ac.resume();
      const tone = ac.createOscillator(), gain = ac.createGain(), dest = ac.createMediaStreamDestination();
      tone.frequency.value = 220; gain.gain.value = .03; tone.connect(gain).connect(dest); tone.start();
      window.tracks = [AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: canvas.captureStream(20).getVideoTracks()[0] }),
        AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: dest.stream.getAudioTracks()[0] })];
      await client.publish(tracks);
    });
    await pages.worker.waitForFunction(() => received.video && received.audio, null, { timeout: 25000 });
    console.log('Worker received source audio/video');
    await pages.worker.addScriptTag({ url: `http://127.0.0.1:${server.address().port}/${nonce}/svga.js` });
    const info = await pages.worker.evaluate(async () => {
      const loadStarted = performance.now();
      const item = await new Promise((resolve, reject) => new SVGA.Parser().load('gift.svga', resolve, reject));
      const loadMs = Math.round(performance.now() - loadStarted);
      if (!(item.frames > 0 && item.FPS > 0) || item.frames / item.FPS > 20) throw Error('Test supports animations up to 20 seconds');
      const player = new SVGA.Player('#svga'); player.setVideoItem(item);
      const canvas = document.getElementById('output'), ctx = canvas.getContext('2d');
      const video = document.createElement('video'); video.muted = true; video.playsInline = true;
      video.srcObject = new MediaStream([received.video.getMediaStreamTrack()]); await video.play();
      const ac = new AudioContext(); await ac.resume();
      const dest = ac.createMediaStreamDestination();
      ac.createMediaStreamSource(new MediaStream([received.audio.getMediaStreamTrack()])).connect(dest);
      // Explicit test soundtrack, not the gift's embedded sound. Production must use its saved sound revision.
      const sound = await ac.decodeAudioData(await (await fetch('sound.mp3')).arrayBuffer());
      const duration = item.frames / item.FPS;
      window.framesDrawn = 0; window.giftStarted = null;
      window.renderTimer = setInterval(() => {
        ctx.globalAlpha = 1; ctx.drawImage(video, 0, 0, 360, 640);
        if (giftStarted !== null) {
          const elapsed = (performance.now() - giftStarted) / 1000;
          if (elapsed < duration) {
            player.stepToFrame(Math.min(item.frames - 1, Math.floor(elapsed * item.FPS)), false);
            ctx.globalAlpha = Math.min(1, Math.max(0, duration - elapsed));
            ctx.drawImage(document.querySelector('#svga canvas'), 0, 0, 360, 640); ctx.globalAlpha = 1;
          }
        }
        framesDrawn++;
      }, 50);
      const composite = canvas.captureStream(20); composite.addTrack(dest.stream.getAudioTracks()[0]);
      window.tracks = [AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: composite.getVideoTracks()[0] }),
        AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: dest.stream.getAudioTracks()[0] })];
      await client.publish(tracks);
      window.startGift = () => {
        giftStarted = performance.now();
        const source = ac.createBufferSource(), gain = ac.createGain(); source.buffer = sound;
        source.connect(gain).connect(dest);
        const end = Math.min(duration, sound.duration);
        gain.gain.setValueAtTime(1, ac.currentTime);
        gain.gain.setValueAtTime(1, ac.currentTime + Math.max(0, end - 1));
        gain.gain.linearRampToValueAtTime(0, ac.currentTime + end); source.start();
      };
      return { duration, frames: item.frames, fps: item.FPS, loadMs };
    });
    await pages.viewer.waitForFunction(() => received.video && received.audio, null, { timeout: 25000 });
    await pages.viewer.evaluate(async () => {
      const video = document.createElement('video'); video.id = 'view'; video.style = 'position:fixed;inset:0;width:360px;height:640px';
      video.muted = true; video.playsInline = true;
      const stream = new MediaStream([received.video.getMediaStreamTrack(), received.audio.getMediaStreamTrack()]);
      video.srcObject = stream; document.body.append(video); await video.play();
      window.chunks = []; window.recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.start(250);
    });
    console.log('Viewer received composed video/audio; starting gift');
    await pages.viewer.screenshot({ path: path.join(output, 'before.png') });
    await pages.worker.evaluate(() => startGift());
    await new Promise(r => setTimeout(r, Math.min(2500, info.duration * 500)));
    await pages.viewer.screenshot({ path: path.join(output, 'during.png') });
    await new Promise(r => setTimeout(r, Math.max(0, info.duration * 1000 - Math.min(2500, info.duration * 500)) + 1500));
    await pages.viewer.screenshot({ path: path.join(output, 'after.png') });
    const memory = await pages.viewer.evaluate(async () => {
      await new Promise(resolve => { recorder.onstop = resolve; recorder.stop(); });
      const blob = new Blob(chunks, { type: 'video/webm' });
      return await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); });
    });
    const memoryFile = path.join(output, 'viewer-memory.webm'); await fs.writeFile(memoryFile, Buffer.from(memory, 'base64'));
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height', '-of', 'json', memoryFile], { encoding: 'utf8' });
    if (probe.status !== 0) throw Error('Recorded memory metadata could not be read');
    const decode = spawnSync('ffmpeg', ['-v', 'error', '-xerror', '-i', memoryFile, '-f', 'null', '-'], { encoding: 'utf8', timeout: 15000 });
    if (decode.status !== 0) throw Error('Recorded memory could not be fully decoded');
    const streams = JSON.parse(probe.stdout).streams;
    if (!streams.some(s => s.codec_type === 'video') || !streams.some(s => s.codec_type === 'audio')) throw Error('Missing memory media track');
    if (requests.some(r => r.role !== 'worker')) throw Error('Gift assets downloaded outside compositor');
    const report = { experiment: 'server Chromium compositor through a real Agora test channel', syntheticBroadcaster: true,
      phoneVerified: false, productionChanged: false, giftBytes: stat.size, gift: info, requests, streams,
      framesDrawn: await pages.worker.evaluate(() => framesDrawn), viewerRecordingBytes: Buffer.byteLength(memory, 'base64'),
      limits: ['Not a Server Gateway worker', 'Synthetic input, not a phone camera', 'Uses default test chime, not embedded SVGA audio', 'No concurrency/load/cost or physical device proof'] };
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, ...report }, null, 2));
  } finally {
    clearTimeout(deadline);
    if (browser) {
      for (const context of browser.contexts()) for (const page of context.pages()) {
        await page.evaluate(async () => { clearInterval(window.sourceTimer); clearInterval(window.renderTimer); for (const track of window.tracks || []) track.close(); await window.client?.leave(); }).catch(() => {});
      }
      await browser.close();
    }
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => {
  // Do not print SDK URLs, token-bearing stacks, or credentials.
  const message = String(error.message || 'Test failed').split('\n')[0];
  console.error('Compositor experiment failed:', message.replace(/https?:\/\/\S+/g, '[URL redacted]'));
  process.exitCode = 1;
});
