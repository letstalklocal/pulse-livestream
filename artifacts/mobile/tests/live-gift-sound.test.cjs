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
const catalog = load(require.resolve('../utils/giftCatalog.ts'), {
  'react-native': { Platform: { OS: 'ios' } },
  '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {} },
});
function fixture() {
  const played = [], published = [], pending = [], floaters = [];
  const scope = {
    user: { uid: 1 }, activeChannelId: 'live', engineRef: { current: {} }, mediaChannelRef: { current: 'live' },
    isLiveRef: { current: true }, pausedRef: { current: false }, playedGiftSounds: { current: new Set() },
    giftPresentation: { current: presentation.createGiftPresentation() }, expectsNativeCrown: presentation.expectsNativeCrown,
    setFloatingGifts: fn => { const next = fn(floaters); floaters.splice(0, floaters.length, ...next); },
    mergeGiftFloater: presentation.mergeGiftFloater,
    playLiveGiftSound: (_engine, name) => played.push(name),
    playPublishedCatalogGiftSound: async (_engine, snapshot, isCurrent) => { if (isCurrent()) published.push(snapshot); },
    giftFromSnapshot: catalog.giftFromSnapshot,
    recordGiftMoment: (_engine, _channel, _gift, _token, options) => { pending.push(options); return true; },
    stopMomentProof() {}, proofVideoSizeRef: { current: null }, getToken() {}, momentsRequest: async () => {},
    appNumber: String, GIFTS: [{ name: 'Rose', emoji: '🌹', size: 36 }, { name: 'Crown', emoji: '👑', size: 36 }],
    queryClient: { invalidateQueries() {} }, serverEndedShutdownRef: { current() {} }, console,
  };
  const code = ts.transpileModule(`const receive = ${callback};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const receive = new Function(...Object.keys(scope), code + '\nreturn receive;')(...Object.values(scope));
  return { scope, played, published, pending, floaters, send: body => receive({ data: JSON.stringify({ type: 'gift', giftName: 'Rose', recipientUid: 1, amount: 1, ...body }) }) };
}
const f = fixture(); f.send({ giftId: 'a' }); f.send({ giftId: 'a' }); assert.deepEqual(f.played, ['Rose']);
f.send({ giftId: 'b' }); assert.deepEqual(f.played, ['Rose', 'Rose'], 'Separate combo transactions each play a sound');
f.send({ giftId: 'party-peer', recipientUid: 2 }); assert.equal(f.played.length, 2, 'Only the recipient host publishes a party gift sound');
f.send({ giftId: 'crown', giftName: 'Crown', amount: 500 }); assert.equal(f.played.length, 2, 'Native recording owns the Crown sound');
f.pending[0].onGiftVisible(); f.pending[0].onFallback(); assert.equal(f.played.length, 2, 'Visible native Crown fallback cannot replay sound');
f.send({ giftId: 'fallback-crown', giftName: 'Crown', amount: 500 }); f.pending[1].onFallback(); f.pending[1].onFallback(); assert.equal(f.played.at(-1), 'Crown'); assert.equal(f.played.length, 3);
f.scope.pausedRef.current = true; f.send({ giftId: 'paused-rose' }); f.send({ giftId: 'paused-crown', giftName: 'Crown', amount: 500 });
assert.equal(f.played.length, 3); assert.equal(f.pending.length, 2, 'Paused live cannot restart recording or gift audio');
const luxury = fixture();
luxury.scope.GIFTS.push({ id: 'rocket', name: 'Rocket', coins: 100 }, { id: 'luxury_rocket', name: 'Blast Off', coins: 4999 });
luxury.send({ giftId: 'luxury-rocket', giftName: 'Rocket', amount: 4999, combo: { id: 'luxury-combo', count: 2, totalCoins: 9998 } });
assert.equal(luxury.floaters.at(-1).catalogId, 'luxury_rocket', 'Luxury lookup uses individual price, not cumulative combo price');
luxury.send({ giftId: 'blast-off', giftName: 'Blast Off', amount: 4999 });
assert.equal(luxury.floaters.at(-1).catalogId, 'luxury_rocket', 'renamed Blast Off uses the same catalog ID and animation');
luxury.send({ giftId: 'popular-rocket', giftName: 'Rocket', amount: 100 });
assert.equal(luxury.floaters.at(-1).catalogId, 'rocket', 'Popular Rocket remains distinct');
const managed = fixture();
const snapshot = { id: 'new_static', revisionId: 'new_static_r1', name: 'New static gift', emoji: '✨', coinCost: 25, thumbnail: null,
  androidAnimation: null, iosAnimation: null, sound: { id: 'sound', url: '/api/gift-catalog/assets/sound', sha256: 'a'.repeat(64), byteSize: 100, format: 'mp3' },
  framing: { preset: 'contained', scale: 1, x: 0, y: 0 }, legacy: false };
managed.send({ giftId: 'managed-payment', giftName: snapshot.name, amount: 25, giftSnapshot: snapshot });
managed.send({ giftId: 'managed-payment', giftName: snapshot.name, amount: 25, giftSnapshot: snapshot });
assert.equal(managed.published.length, 1, 'A remote static gift sound publishes once from its recipient host');
assert.equal(managed.played.length, 0, 'Custom sound does not duplicate the existing default chime');
assert.equal(managed.floaters.at(-1).catalogId, snapshot.id);
assert.equal(managed.floaters.at(-1).giftSnapshot.revisionId, snapshot.revisionId, 'Artwork remains bound to purchase-time revision');
assert.equal(managed.floaters.at(-1).playbackAudio, false, 'Broadcaster overlay cannot double the host-published sound');
managed.send({ giftId: 'wrong-host', recipientUid: 2, giftName: snapshot.name, amount: 25, giftSnapshot: snapshot });
assert.equal(managed.published.length, 1, 'A forwarded party gift sound belongs to its recipient host');
managed.scope.pausedRef.current = true;
managed.send({ giftId: 'paused-managed', giftName: snapshot.name, amount: 25, giftSnapshot: snapshot });
assert.equal(managed.published.length, 1, 'Paused hosts suppress remote sound too');
console.log('PASS: custom/default sounds, cache/failure fallback, host publication, bounded voices, transaction deduplication, party recipient, Crown recording/fallback and paused silence. Native audio mocked.');
