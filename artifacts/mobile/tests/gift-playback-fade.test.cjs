const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');
function load(file, scope = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve(file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, ...scope });
  return exports;
}
test('final second only, short clips, invalid metadata, and cancellation', () => {
  let now = 0, timeout, interval, delay;
  const fade = load('../utils/giftPlaybackFade.ts', {
    Date: { now: () => now }, setTimeout(fn, ms) { timeout = fn; delay = ms; return 1; },
    clearTimeout() { timeout = null; }, setInterval(fn) { interval = fn; return 2; }, clearInterval() { interval = null; },
  });
  assert.equal(fade.giftEndGain(4999, 6000), 1);
  assert.equal(fade.giftEndGain(5500, 6000), .5);
  assert.equal(fade.giftEndGain(6000, 6000), 0);
  assert.equal(fade.giftEndGain(250, 500), .5);
  assert.equal(fade.giftEndGain(100, NaN), 1);
  assert.equal(fade.giftEndGain(-1, 6000), 1);
  const values = [];
  const cancel = fade.scheduleGiftEndFade(6000, v => values.push(v));
  assert.equal(delay, 5000); assert.deepEqual(values, []);
  now = 5000; timeout(); assert.equal(values.at(-1), 1);
  now = 5500; interval(); assert.equal(values.at(-1), .5);
  now = 6000; interval(); assert.equal(values.at(-1), 0); assert.equal(interval, null);
  cancel(); assert.equal(timeout, null);
  fade.scheduleGiftEndFade(6000, () => assert.fail('cancelled'))();
  assert.equal(timeout, null);
});
test('WebM opacity and embedded audio follow media time, including a stalled frame', () => {
  const html = load('../utils/webmGiftHtml.ts').webmGiftHtml('AAAA', true);
  const events = {}, messages = []; let next;
  const video = { duration: 6, currentTime: 0, ended: false, style: {},
    addEventListener(name, cb) { events[name] = cb; }, play() { return Promise.resolve(); }, pause() {} };
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    document: { getElementById: () => video, addEventListener() {} },
    window: { ReactNativeWebView: { postMessage: value => messages.push(value) } },
    requestAnimationFrame(cb) { next = cb; },
  });
  next(); assert.equal(video.volume, 1);
  video.currentTime = 5.5; next(); assert.equal(video.style.opacity, '0.5'); assert.equal(video.volume, .5);
  next(); assert.equal(video.volume, .5, 'stall does not advance fade');
  assert.equal(video.muted, true, 'fade never unmutes viewer audio');
  assert.ok(!messages.includes('ended'), 'fade never truncates video');
  video.currentTime = 6; video.ended = true; next(); assert.equal(video.volume, 0);
  events.ended(); assert.equal(messages.at(-1), 'ended');
});
test('recipient published effect fades individually and cleanup cancels polling', async () => {
  const fade = load('../utils/giftPlaybackFade.ts');
  let interval, timer, position = 0, releases = 0, stopped = 0;
  const volumes = [];
  const engine = { playEffect: () => 0, stopEffect() { stopped++; }, getEffectDuration: () => 6000,
    getEffectCurrentPosition: () => position, setVolumeOfEffect(id, volume) { volumes.push([id, volume]); } };
  const mod = load('../utils/publishedCatalogGiftSound.native.ts', {
    setTimeout(cb) { timer = cb; return 1; }, clearTimeout() { timer = null; },
    setInterval(cb) { interval = cb; return 2; }, clearInterval() { interval = null; },
    require: id => ({ './giftPlaybackFade': fade,
      './giftAssetCache': { acquireGiftAsset: async () => ({ uri: 'file:///audio.mp3', release() { releases++; } }) },
      './liveGiftSound': { playLiveGiftSound() { assert.fail('unexpected fallback'); } },
      'react-native': { Platform: { OS: 'android' }, AppState: { addEventListener: () => ({ remove() {} }) } },
    })[id],
  });
  await mod.playPublishedCatalogGiftSound(engine, { sound: { durationMs: 6000 }, animation: { durationMs: 6000 } }, () => true);
  position = 5000; interval(); assert.equal(volumes.at(-1)[1], 65);
  position = 5500; interval(); assert.equal(volumes.at(-1)[1], 32.5);
  position = 6000; interval(); assert.equal(volumes.at(-1)[1], 0);
  assert.equal(releases, 0, 'fade does not terminate the effect');
  mod.stopPublishedCatalogGiftSounds(engine);
  assert.equal(interval, null); assert.equal(timer, null); assert.equal(releases, 1); assert.equal(stopped, 2);
});
