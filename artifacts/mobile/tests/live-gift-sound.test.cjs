const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript'), vm = require('node:vm');
function load(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => { assert.ok(name in imports, name); return imports[name]; }, console: { warn() {} } });
  return exports;
}
const custom = { Rose: 'custom-rose-wave', Heart: 'bad-write' }, writes = [], effects = [], stops = [];
const sound = load(require.resolve('../utils/liveGiftSound.native.ts'), {
  'expo-file-system': { Paths: { cache: 'cache' }, Directory: class { create() {} }, File: class {
    constructor(_dir, name) { this.uri = `file:///cache/${name}`; }
    write(data) { if (data === 'bad-write') throw Error('disk full'); writes.push(data); }
  } },
  './liveGiftSoundConfig': { customGiftSounds: custom }, './momentGiftAssets.native': { prepareMomentGiftSound: () => '/default.wav' },
});
assert.equal(sound.prepareLiveGiftSound('Rose'), '/cache/custom-0.wav');
assert.equal(sound.prepareLiveGiftSound('Rose'), '/cache/custom-0.wav');
assert.deepEqual(writes, ['custom-rose-wave'], 'A custom sound is prepared once');
assert.equal(sound.prepareLiveGiftSound('Party'), '/default.wav', 'Missing custom sound uses default');
assert.equal(sound.prepareLiveGiftSound('Heart'), '/default.wav', 'Unavailable custom asset uses default');
const engine = { stopEffect: id => stops.push(id), playEffect: (...args) => { effects.push(args); return args[1].includes('custom') ? -2 : 0; } };
sound.playLiveGiftSound(engine, 'Rose');
assert.equal(effects.length, 2); assert.equal(effects[1][1], '/default.wav', 'Failed custom playback retries default');
assert.equal(effects[1][6], true, 'Host publishes the sound for viewers and PiP');
for (let i = 0; i < 7; i++) sound.playLiveGiftSound(engine, 'Party');
assert.equal(new Set(stops).size, 3, 'Rapid gifting bounds concurrent audio effects');
// Execute the real broadcaster websocket callback: duplicates/party forwarding/
// native Crown fallback must not produce duplicate published sounds.
const source = fs.readFileSync(require.resolve('../app/go-live.tsx'), 'utf8');
const ast = ts.createSourceFile('screen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function find(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'onMessage' && node.initializer.getText(ast).includes('const nativeExpected')) callback = node.initializer.getText(ast);
  ts.forEachChild(node, find);
} find(ast); assert.ok(callback);
const presentation = load(require.resolve('../utils/giftPresentation.ts'));
function fixture() {
  const played = [], pending = [], floaters = [];
  const scope = {
    user: { uid: 1 }, activeChannelId: 'live', engineRef: { current: {} }, mediaChannelRef: { current: 'live' },
    isLiveRef: { current: true }, pausedRef: { current: false }, playedGiftSounds: { current: new Set() },
    giftPresentation: { current: presentation.createGiftPresentation() }, expectsNativeCrown: presentation.expectsNativeCrown,
    setFloatingGifts: fn => { const next = fn(floaters); floaters.splice(0, floaters.length, ...next); },
    mergeGiftFloater: presentation.mergeGiftFloater,
    playLiveGiftSound: (_engine, name) => played.push(name),
    recordGiftMoment: (_engine, _channel, _gift, _token, options) => { pending.push(options); return true; },
    stopMomentProof() {}, proofVideoSizeRef: { current: null }, getToken() {}, momentsRequest: async () => {},
    appNumber: String, GIFTS: [{ name: 'Rose', emoji: '🌹', size: 36 }, { name: 'Crown', emoji: '👑', size: 36 }],
    queryClient: { invalidateQueries() {} }, serverEndedShutdownRef: { current() {} }, console,
  };
  const code = ts.transpileModule(`const receive = ${callback};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const receive = new Function(...Object.keys(scope), code + '\nreturn receive;')(...Object.values(scope));
  return { scope, played, pending, floaters, send: body => receive({ data: JSON.stringify({ type: 'gift', giftName: 'Rose', recipientUid: 1, amount: 1, ...body }) }) };
}
const f = fixture(); f.send({ giftId: 'a' }); f.send({ giftId: 'a' }); assert.deepEqual(f.played, ['Rose']);
f.send({ giftId: 'b' }); assert.deepEqual(f.played, ['Rose', 'Rose'], 'Separate combo transactions each play a sound');
f.send({ giftId: 'party-peer', recipientUid: 2 }); assert.equal(f.played.length, 2, 'Only the recipient host publishes a party gift sound');
f.send({ giftId: 'crown', giftName: 'Crown', amount: 500 }); assert.equal(f.played.length, 2, 'Native recording owns the Crown sound');
f.pending[0].onGiftVisible(); f.pending[0].onFallback(); assert.equal(f.played.length, 2, 'Visible native Crown fallback cannot replay sound');
f.send({ giftId: 'fallback-crown', giftName: 'Crown', amount: 500 }); f.pending[1].onFallback(); f.pending[1].onFallback(); assert.equal(f.played.at(-1), 'Crown'); assert.equal(f.played.length, 3);
f.scope.pausedRef.current = true; f.send({ giftId: 'paused-rose' }); f.send({ giftId: 'paused-crown', giftName: 'Crown', amount: 500 });
assert.equal(f.played.length, 3); assert.equal(f.pending.length, 2, 'Paused live cannot restart recording or gift audio');
console.log('PASS: custom/default sounds, cache/failure fallback, host publication, bounded voices, transaction deduplication, party recipient, Crown recording/fallback and paused silence. Native audio mocked.');
