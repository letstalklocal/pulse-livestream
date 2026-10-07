const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');
test('local catalog sounds mix without a video surface, bound voices and release on completion/error', async () => {
  const players = []; let releases = 0;
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../utils/localCatalogGiftSound.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: id => ({
      'react-native': { Platform: { OS: 'ios' } },
      './giftAssetCache': { acquireGiftAsset: async () => ({ uri: 'file:///verified.mp3', release: () => releases++ }) },
      'expo-video': { createVideoPlayer: source => {
        const callbacks = {};
        const player = { source, callbacks, stopped: 0, started: 0,
          play() { this.started++; }, pause() {}, release() { this.stopped++; }, replace(source) { this.source = source; },
          addListener(name, cb) { callbacks[name] = cb; return { remove() {} }; } };
        players.push(player); return player;
      } },
      './momentGiftAssets.native': { prepareMomentGiftSound: () => '/default.wav' },
    })[id],
  });
  const sounds = await Promise.all(Array.from({ length: 4 }, () => exports.prepareLocalCatalogGiftSound({ id: 'audio' })));
  sounds.forEach(sound => sound.play());
  assert.equal(players[0].stopped, 1, 'oldest voice ends when fourth starts');
  assert.equal(players.every(player => player.audioMixingMode === 'mixWithOthers' && player.loop === false && player.muted === false), true);
  assert.equal(players[1].source.uri, 'file:///verified.mp3');
  sounds[1].play(); assert.equal(players[1].started, 1, 'ready callbacks cannot duplicate the sound');
  players[1].callbacks.playToEnd(); players[2].callbacks.statusChange({ status: 'error' });
  assert.equal(players[2].source.uri, 'file:///default.wav', 'decoder failure falls back once to the existing default chime');
  players[2].callbacks.statusChange({ status: 'error' }); sounds[3].stop(); sounds[3].stop();
  assert.equal(releases, 4); assert.equal(players.every(player => player.stopped === 1), true);
});
test('static and Reduced Motion gifts play local custom audio once and clean up background/unmount/late loads', async () => {
  const source = fs.readFileSync(require.resolve('../components/GiftFloater.tsx'), 'utf8');
  const tree = ts.createSourceFile('GiftFloater.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect' && node.arguments[0].getText(tree).includes('prepareLocalCatalogGiftSound')) callback = node.arguments[0].getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree); assert.ok(callback);
  const code = ts.transpileModule(`const effect = ${callback};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  function fixture(remoteAnimation, reduceMotion, playbackAudio = true) {
    let resolve, background, played = 0, stopped = 0, calls = 0, retired = false;
    const sound = { play() { if (!retired) played++; }, stop() { if (!retired) { retired = true; stopped++; } } };
    const effect = new Function('gift', 'remoteAnimation', 'prepareLocalCatalogGiftSound', 'AppState', code + '; return effect;')(
      { playbackAudio, reduceMotion, giftSnapshot: { sound: { id: 'custom' } } }, remoteAnimation,
      () => { calls++; return new Promise(r => { resolve = r; }); },
      { addEventListener: (_, cb) => { background = cb; return { remove() {} }; } },
    );
    return { cleanup: effect(), complete: () => resolve(sound), background: () => background('background'), get played() { return played; }, get stopped() { return stopped; }, get calls() { return calls; } };
  }
  const staticGift = fixture(null, false); staticGift.complete(); await new Promise(setImmediate); assert.equal(staticGift.played, 1);
  staticGift.background(); staticGift.cleanup(); assert.equal(staticGift.stopped, 1);
  const reduced = fixture({ format: 'svga' }, true); reduced.complete(); await new Promise(setImmediate); assert.equal(reduced.played, 1); reduced.cleanup();
  const retired = fixture(null, false); retired.cleanup(); retired.complete(); await new Promise(setImmediate); assert.equal(retired.played, 0); assert.equal(retired.stopped, 1);
  assert.equal(fixture({ format: 'svga' }, false).calls, 0, 'Animated gift audio belongs to its player');
  assert.equal(fixture(null, false, false).calls, 0, 'Live overlays never duplicate host-published audio');
});
