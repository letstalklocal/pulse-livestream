// Real Agora smoke test of the exact child worker used by the development API.
// Synthetic camera only; no app live, coins, catalog writes or phone recording.
const { fork } = require('node:child_process');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const { RtcTokenBuilder, RtcRole } = createRequire(path.join(root, 'artifacts/api-server/package.json'))('agora-token');
const { chromium } = require(process.env.PULSE_PLAYWRIGHT_MODULE);
(async () => {
  const output = await fs.mkdtemp('/tmp/pulse-worker-smoke-');
  const appId = process.env.AGORA_APP_ID;
  const demo = process.env.PULSE_SMOKE_DEMO === '1';
  const globalDelivery = process.env.PULSE_SMOKE_GLOBAL === '1';
  const customSoundBase64 = process.env.PULSE_SMOKE_SOUND_FILE ? (await fs.readFile(process.env.PULSE_SMOKE_SOUND_FILE)).toString('base64') : undefined;
  const sourceChannel = `test-source-${randomUUID()}`, outputChannel = `test-output-${randomUUID()}`;
  const token = (channel, uid, publisher = false) => RtcTokenBuilder.buildTokenWithUid(appId, process.env.AGORA_APP_CERTIFICATE,
    channel, uid, publisher ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER, 120, 120);
  const sdk = await (await fetch('https://download.agora.io/sdk/release/AgoraRTC_N-4.24.8.js', { signal: AbortSignal.timeout(15000) })).text();
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', req.url === '/sdk.js' ? 'application/javascript' : 'text/html');
    res.end(req.url === '/sdk.js' ? sdk : '<!doctype html><canvas id="source" width="360" height="640"></canvas><div id="view" style="width:360px;height:640px"></div><script src="/sdk.js"></script>');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser, child;
  const deadline = setTimeout(() => { child?.kill('SIGKILL'); void browser?.close().catch(() => {}); }, 70000);
  try {
    browser = await chromium.launch({ executablePath: '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    if (!demo) {
    const source = await browser.newPage();
    await source.goto(`http://127.0.0.1:${server.address().port}`);
    await source.evaluate(async c => {
      AgoraRTC.setLogLevel(4); AgoraRTC.disableLogUpload();
      window.client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' }); await client.setClientRole('host');
      await client.join(c.appId, c.channel, c.token, 101);
      const canvas = document.getElementById('source'), ctx = canvas.getContext('2d');
      setInterval(() => { ctx.fillStyle = '#12517b'; ctx.fillRect(0, 0, 360, 640); ctx.fillStyle = 'white'; ctx.font = '20px sans-serif'; ctx.fillText('SYNTHETIC HOST', 20, 50); ctx.fillText(String(Date.now()), 20, 80); }, 50);
      const audio = new AudioContext(); await audio.resume();
      const dest = audio.createMediaStreamDestination(), oscillator = audio.createOscillator(), gain = audio.createGain();
      gain.gain.value = 0.02; oscillator.connect(gain).connect(dest); oscillator.start();
      await client.publish([AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: canvas.captureStream(20).getVideoTracks()[0] }),
        AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: dest.stream.getAudioTracks()[0] })]);
    }, { appId, channel: sourceChannel, token: token(sourceChannel, 101, true) });
    }
    child = fork(path.join(__dirname, globalDelivery ? 'live-gift-renderer.cjs' : 'gift-compositor-worker.cjs'), [], { execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Worker startup timeout')), 45000);
      child.on('message', m => {
        if (m.type === 'ready') { clearTimeout(timer); resolve(m); }
        if (m.type === 'failed') { clearTimeout(timer); reject(Error('Worker failed')); }
      });
      child.once('error', reject);
    });
    child.send({ appId, demo, customSoundBase64, sourceChannel, sourceUid: 3000000001, sourceToken: demo ? null : token(sourceChannel, 3000000001), hostUid: 101,
      outputChannel, outputUid: globalDelivery ? 101 : 4000000001, outputToken: token(outputChannel, globalDelivery ? 101 : 4000000001, true), giftPath: process.env.PULSE_GIFT_TEST_FILE });
    const info = await ready;
    const viewer = await browser.newPage({ viewport: { width: 360, height: 640 } });
    const assets = [];
    viewer.on('request', r => { if (/svga|sound\.mp3/.test(r.url())) assets.push(r.url()); });
    await viewer.goto(`http://127.0.0.1:${server.address().port}`);
    await viewer.evaluate(async c => {
      document.getElementById('source').remove(); document.body.style.margin = '0';
      AgoraRTC.setLogLevel(4); AgoraRTC.disableLogUpload();
      window.client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      window.received = {};
      window.audioPeak = 0;
      client.on('user-published', async (u, kind) => {
        await client.subscribe(u, kind); received[kind] = true;
        if (kind === 'video') u.videoTrack.play('view'); else {
          u.audioTrack.play();
          const ac = new AudioContext(); await ac.resume();
          const analyser = ac.createAnalyser();
          ac.createMediaStreamSource(new MediaStream([u.audioTrack.getMediaStreamTrack()])).connect(analyser);
          const silent = ac.createGain(); silent.gain.value = 0; analyser.connect(silent).connect(ac.destination);
          const data = new Float32Array(analyser.fftSize);
          setInterval(() => { analyser.getFloatTimeDomainData(data); const rms = Math.sqrt(data.reduce((s, x) => s + x * x, 0) / data.length); window.audioPeak = Math.max(window.audioPeak, rms); }, 30);
        }
      });
      await client.setClientRole('audience'); await client.join(c.appId, c.channel, c.token, 103);
    }, { appId, channel: outputChannel, token: token(outputChannel, 103) });
    await viewer.waitForFunction(() => received.video && received.audio, null, { timeout: 20000 });
    if (globalDelivery) {
      const format = process.env.PULSE_SMOKE_FORMAT || 'svga';
      const played = new Promise((resolve, reject) => {
        child.on('message', m => { if (m.type === 'played') resolve(m); if (m.type === 'failed') reject(Error('Rendering failed')); });
      });
      child.send({ type: 'play', event: { giftId: 'smoke', combo: { id: 'smoke', count: 3 } }, gift: {
        id: 'smoke', revisionId: 'smoke', type: format === 'png' ? 'image' : 'animation',
        framing: { preset: 'fullscreen', scale: 1, x: 0, y: 0, ...(process.env.PULSE_SMOKE_FRAMING ? JSON.parse(process.env.PULSE_SMOKE_FRAMING) : {}) },
        asset: { format, width: format === 'packed-alpha-mp4' ? 2160 : format === 'webm-alpha' ? 1080 : 360, height: format.includes('mp4') || format.includes('webm') ? 1920 : 640,
          base64: (await fs.readFile(process.env.PULSE_GIFT_TEST_FILE)).toString('base64') },
        sound: customSoundBase64 ? { base64: customSoundBase64 } : null,
      } });
      Object.assign(info, await played);
      if (process.env.PULSE_SMOKE_EXPECT_DURATION_MS && info.durationMs !== Number(process.env.PULSE_SMOKE_EXPECT_DURATION_MS)) throw Error('Incorrect image sequence duration');
    } else child.send({ type: 'trigger' });
    await new Promise(r => setTimeout(r, 2500));
    await viewer.screenshot({ path: path.join(output, 'during.png') });
    if (assets.length) throw Error('Viewer downloaded a gift asset');
    await new Promise(r => setTimeout(r, info.durationMs));
    await viewer.screenshot({ path: path.join(output, 'after.png') });
    const audioPeak = await viewer.evaluate(() => window.audioPeak);
    if (demo && (info.audioTracks > 0 || globalDelivery && process.env.PULSE_SMOKE_FORMAT !== 'png') && !(audioPeak > 0.001)) throw Error('Gift audio was silent at the viewer');
    const ended = new Promise(r => child.once('exit', r)); child.send({ type: 'stop' }); await ended;
    console.log(JSON.stringify({ output, demo, globalDelivery, ...info, audioPeak, viewerGiftRequests: assets.length, workerExited: true, physicalAndroidVerified: false }));
  } finally { clearTimeout(deadline); child?.kill('SIGTERM'); await browser?.close(); await new Promise(r => server.close(r)); }
})().catch(() => { console.error('Worker smoke failed (credentials/SDK details withheld)'); process.exitCode = 1; });
