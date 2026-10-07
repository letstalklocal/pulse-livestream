const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');
function load(file, imports, extra = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve(file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: imports, ...extra });
  return exports;
}
function fixture() {
  const requests = [], callbacks = new Set(), timers = new Map(), fallback = [];
  let released = 0, sequence = 0;
  const service = load('../utils/publishedCatalogGiftSound.native.ts', name => ({
    './giftAssetCache': { acquireGiftAsset: () => new Promise((resolve, reject) => requests.push({ resolve: () => resolve({ uri: 'file:///verified.mp3', release: () => released++ }), reject })) },
    './liveGiftSound': { playLiveGiftSound: (...args) => fallback.push(args) },
    'react-native': { AppState: { addEventListener: (_, callback) => { callbacks.add(callback); return { remove: () => callbacks.delete(callback) }; } } },
  })[name], { setTimeout: callback => { const id = ++sequence; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id) });
  function engine() { return { played: [], stopped: [], code: 0, playEffect(...args) { this.played.push(args); return this.code; }, stopEffect(id) { this.stopped.push(id); } }; }
  const snapshot = { name: 'Gift', sound: { durationMs: 3000 } };
  return { service, requests, timers, fallback, callbacks, snapshot, engine, get released() { return released; } };
}
test('published effects have three bounded voices, publish once and release active engine leases', async () => {
  const f = fixture(), engine = f.engine();
  for (let i = 0; i < 4; i++) {
    const playing = f.service.playPublishedCatalogGiftSound(engine, f.snapshot, () => true);
    f.requests[i].resolve(); await playing;
  }
  assert.equal(engine.played.length, 4); assert.equal(new Set(engine.played.map(args => args[0])).size, 3);
  assert.equal(f.released, 1, 'fourth gift retires oldest voice');
  assert.equal(f.timers.size, 3); assert.equal(f.callbacks.size, 3);
  assert.equal(engine.played.every(args => args[6] === true && args[2] === 0), true, 'Each sound publishes one-shot to viewers/PiP');
  f.service.stopPublishedCatalogGiftSounds(engine); f.service.stopPublishedCatalogGiftSounds(engine);
  assert.equal(f.released, 4); assert.equal(f.timers.size, 0); assert.equal(f.callbacks.size, 0);
});
test('failed verified assets/native playback use default once; stale and stopped engine downloads never play', async () => {
  const f = fixture(), engine = f.engine();
  let operation = f.service.playPublishedCatalogGiftSound(engine, f.snapshot, () => true);
  f.requests[0].reject(new Error('checksum mismatch')); await operation;
  assert.equal(f.fallback.length, 1);
  engine.code = -2;
  operation = f.service.playPublishedCatalogGiftSound(engine, f.snapshot, () => true); f.requests[1].resolve(); await operation;
  assert.equal(f.fallback.length, 2); assert.equal(f.released, 1);
  let current = true;
  operation = f.service.playPublishedCatalogGiftSound(engine, f.snapshot, () => current); current = false; f.requests[2].resolve(); await operation;
  assert.equal(f.released, 2); assert.equal(engine.played.length, 1);
  operation = f.service.playPublishedCatalogGiftSound(engine, f.snapshot, () => true);
  f.service.stopPublishedCatalogGiftSounds(engine); f.requests[3].resolve(); await operation;
  assert.equal(f.released, 3); assert.equal(engine.played.length, 1, 'Cleanup invalidates pending downloads even if caller predicate remains true');
  operation = f.service.playPublishedCatalogGiftSound(engine, f.snapshot, () => true);
  f.service.stopPublishedCatalogGiftSounds(engine); f.requests[4].reject(new Error('network')); await operation;
  assert.equal(f.fallback.length, 2, 'A retired download failure cannot restart fallback audio');
});
test('engine cleanup isolates other engine audio; background and duration completion release sound leases', async () => {
  const f = fixture(), first = f.engine(), second = f.engine();
  let operation = f.service.playPublishedCatalogGiftSound(first, f.snapshot, () => true); f.requests[0].resolve(); await operation;
  operation = f.service.playPublishedCatalogGiftSound(second, f.snapshot, () => true); f.requests[1].resolve(); await operation;
  f.service.stopPublishedCatalogGiftSounds(first); assert.equal(f.released, 1); assert.equal(f.timers.size, 1);
  [...f.callbacks][0]('background'); assert.equal(f.released, 2); assert.equal(f.timers.size, 0);
  operation = f.service.playPublishedCatalogGiftSound(second, f.snapshot, () => true); f.requests[2].resolve(); await operation;
  [...f.timers.values()][0](); assert.equal(f.released, 3);
});
test('edited managed Crown revisions cannot use the bundled native Crown recording', () => {
  const presentation = load('../utils/giftPresentation.ts', () => { throw new Error('Unexpected import'); });
  assert.equal(presentation.expectsNativeCrown('Crown', 500), true);
  assert.equal(presentation.expectsNativeCrown('Crown', 500, { revisionId: 'crown_legacy_v1' }), true);
  assert.equal(presentation.expectsNativeCrown('Crown', 500, { revisionId: 'crown_edited_v2' }), false);
  assert.equal(presentation.expectsNativeCrown('Dragon', 9999, { revisionId: 'dragon_r1' }), false);
});
