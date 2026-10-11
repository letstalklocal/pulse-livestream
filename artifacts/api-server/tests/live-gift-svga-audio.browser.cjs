// Exercise the actual worker page, with only Agora networking stubbed out.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { chromium } = require('playwright-core');
const source = ts.createSourceFile('worker.js', fs.readFileSync('scripts/live-gift-renderer.cjs', 'utf8'), ts.ScriptTarget.Latest, true);
let setup;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'page.evaluate' && node.arguments[0]?.getText(source).includes('window.prepareGift =')) setup = node.arguments[0].getText(source);
  ts.forEachChild(node, visit);
}
visit(source); assert.ok(setup);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PULSE_CHROMIUM_EXECUTABLE, headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    await page.route('http://127.0.0.1/**', route => route.fulfill({ contentType: 'text/html', body: '<canvas id="output" width="360" height="640"></canvas>' }));
    await page.goto('http://127.0.0.1/');
    await page.addScriptTag({ path: 'artifacts/admin/node_modules/svgaplayerweb/build/svga.min.js' });
    await page.evaluate(() => {
      window.AgoraRTC = { setLogLevel() {}, disableLogUpload() {}, createClient: () => ({ on() {}, async setClientRole() {}, async join() {}, async publish() {} }),
        createCustomVideoTrack: x => x, createCustomAudioTrack: x => x };
      window.observed = { starts: [], resized: 0, decodedBytes: 0 };
      const originalSource = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function () {
        const source = originalSource.call(this), start = source.start.bind(source);
        source.start = (...args) => {
          const samples = source.buffer.getChannelData(0);
          observed.starts.push({ duration: source.buffer.duration, audible: samples.some(v => Math.abs(v) > .001), args });
          return start(...args);
        };
        return source;
      };
      const setImage = SVGA.Player.prototype.setImage;
      SVGA.Player.prototype.setImage = function (...args) { observed.resized++; return setImage.apply(this, args); };
      const setVideoItem = SVGA.Player.prototype.setVideoItem;
      SVGA.Player.prototype.setVideoItem = function (data) {
        window.lastPlayer = this;
        observed.decodedBytes = 0;
        for (const encoded of Object.values(data.images)) if (encoded.startsWith('iVBO')) {
          const bytes = Uint8Array.from(atob(encoded.slice(0, 64)), c => c.charCodeAt(0)), view = new DataView(bytes.buffer);
          observed.decodedBytes += view.getUint32(16) * view.getUint32(20) * 4;
        }
        return setVideoItem.call(this, data);
      };
    });
    await page.evaluate(`(${setup})({demo: true})`);
    let bytes;
    if (process.env.GIFT_SVGA_TEST_URL) {
      const response = await fetch(process.env.GIFT_SVGA_TEST_URL); assert.ok(response.ok);
      bytes = Buffer.from(await response.arrayBuffer());
    } else bytes = fs.readFileSync('artifacts/mobile/assets/gifts/luxury/Blast-Off-Gift.svga');
    const result = await page.evaluate(async ({ encoded, synthetic }) => {
      if (synthetic) {
        const load = SVGA.Parser.prototype.load;
        SVGA.Parser.prototype.load = function (url, resolve, reject) {
          return load.call(this, url, data => {
            // Valid small compressed PNGs whose decoded footprint exceeds 128MiB.
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
            canvas.getContext('2d').fillRect(0, 0, 512, 512);
            const png = canvas.toDataURL().split(',')[1];
            for (let i = 0; i < 140; i++) data.images['memory-fixture-' + i] = png;
            resolve(data);
          }, reject);
        };
      }
      const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))]));
      const gift = { revisionId: 'audio-regression', type: 'animation', framing: { preset: 'contained', scale: 1, x: 0, y: 0 },
        asset: { format: 'svga', url }, sound: null,
        defaultSound: { url: 'invalid://default-chime-must-not-be-loaded' } };
      const started = performance.now();
      await prepareGift(gift); const preparationMs = performance.now() - started;
      const resizedPlayer = window.lastPlayer;
      const measured = { resized: observed.resized, decodedBytes: observed.decodedBytes };
      const duration = await playGift({ revisionId: gift.revisionId, giftId: 'paid-once', combo: { id: 'combo', count: 1 } });
      await playGift({ revisionId: gift.revisionId, giftId: 'paid-twice', combo: { id: 'combo', count: 2 } });
      // Compare a fixed frame against the unmodified source player, not a mock.
      const original = await new Promise((resolve, reject) => new SVGA.Parser().load(url, resolve, reject));
      const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 640;
      document.body.append(canvas);
      const baseline = new SVGA.Player(canvas); baseline.setVideoItem(original);
      await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
      await new Promise(resolve => setTimeout(resolve, 1000));
      const frame = Math.floor(original.frames / 2);
      baseline.stepToFrame(frame, false); resizedPlayer.stepToFrame(frame, false);
      const compare = document.createElement('canvas'); compare.width = 72; compare.height = 128;
      const context = compare.getContext('2d', { willReadFrequently: true });
      const pixels = source => { context.clearRect(0, 0, 72, 128); context.drawImage(source, 0, 0, 72, 128); return context.getImageData(0, 0, 72, 128).data; };
      const a = pixels(canvas), b = pixels(resizedPlayer._drawingCanvas || resizedPlayer._container);
      let difference = 0, visible = 0;
      for (let i = 0; i < a.length; i++) { difference += Math.abs(a[i] - b[i]); if (i % 4 === 3) visible += a[i]; }
      return { starts: observed.starts, ...measured, duration, preparationMs, visualDifference: difference / a.length / 255, visible };
    }, { encoded: bytes.toString('base64'), synthetic: !process.env.GIFT_SVGA_TEST_URL });
    assert.equal(result.starts.length, 1, 'Embedded soundtrack plays once; combo update does not restart it');
    assert.ok(result.starts[0].audible, 'Decoded embedded soundtrack is non-silent');
    assert.ok(result.duration > 0 && result.starts[0].args[2] > 0);
    assert.ok(result.decodedBytes <= 128 * 1024 * 1024, 'Original memory ceiling remains enforced');
    assert.ok(result.visible > 0, 'Baseline frame contains visible artwork');
    assert.ok(result.visualDifference < .025, 'Resizing preserves layout, transparency and artwork at stream size');
    if (!process.env.GIFT_SVGA_TEST_URL) assert.ok(result.resized >= 140);
    console.log('PASS: live worker preserves embedded SVGA audio and combo deduplication within its image budget.', result);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
