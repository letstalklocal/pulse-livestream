const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const test = require('node:test');
function moduleFrom(file, deps, extra = {}) {
  const code = ts.transpileModule(fs.readFileSync(require.resolve(file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => { if (!(name in deps)) throw new Error(name); return deps[name]; }, process, setTimeout, clearTimeout, ...extra });
  return module.exports;
}
const storage = new Map();
const catalog = moduleFrom('../utils/giftCatalog.ts', {
  '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async key => storage.get(key), setItem: async (key, value) => storage.set(key, value) } },
  'react-native': { Platform: { OS: 'android' } },
});
function snapshot(id = 'rose') { return { id, revisionId: `${id}_r1`, name: 'Rose', emoji: '🌹', coinCost: 1, thumbnail: null, animation: null, sound: null, legacy: false, framing: { preset: 'contained', scale: 1, x: 0, y: 0 } }; }
test('catalog rejects corrupt publication and keeps immutable snapshot price/artwork separate from aliases', () => {
  const raw = { version: '1', collections: [{ id: 'new', name: 'New', sortOrder: 1, locked: false, gifts: [snapshot('new')] }, { id: 'popular', name: 'Popular', sortOrder: 0, locked: true, gifts: [snapshot()] }] };
  const parsed = catalog.parseGiftCatalog(raw);
  assert.equal(parsed.collections[0].id, 'popular');
  assert.equal(parsed.collections[0].gifts[0].coins, 1);
  assert.equal(parsed.collections[0].gifts[0].snapshot.revisionId, 'rose_r1');
  const invalid = JSON.parse(JSON.stringify(raw)); invalid.collections[1].gifts[0].coinCost = 0;
  assert.throws(() => catalog.parseGiftCatalog(invalid));
  invalid.collections[1].gifts[0] = snapshot(); invalid.collections[1].gifts[0].thumbnail = { id: 'evil', url: 'https://untrusted.test/art.png', sha256: '0'.repeat(64), byteSize: 1, format: 'png' };
  assert.throws(() => catalog.parseGiftCatalog(invalid));
  assert.equal(catalog.validateGiftSnapshot({ ...snapshot(), framing: { preset: 'fullscreen', scale: Infinity, x: 0, y: 0 } }), false);
});
test('every collection sorts gifts by coin price automatically with stable equal-price order', () => {
  const parsed = catalog.parseGiftCatalog({ version: 'price-order', collections: [{ id: 'popular', name: 'Popular', sortOrder: 0, locked: true,
    gifts: [{ ...snapshot('z'), coinCost: 50, type: 'animation' }, { ...snapshot('b'), coinCost: 1, type: 'image' }, { ...snapshot('a'), coinCost: 1 }] }] });
  assert.deepEqual(Array.from(parsed.collections[0].gifts, gift => gift.id), ['a', 'b', 'z']);
  assert.equal(catalog.validateGiftSnapshot({ ...snapshot(), type: 'video' }), false);
});
test('catalog refresh coalesces requests, preserves last valid publication on failure and uses server ETag', async () => {
  const saved = new Map(); let requests = 0, mode = 'valid', sentHeaders;
  const raw = { version: '7', collections: [{ id: 'popular', name: 'Popular', sortOrder: 0, locked: true, gifts: [snapshot()] }] };
  const service = moduleFrom('../utils/giftCatalog.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async key => saved.get(key), setItem: async (key, value) => saved.set(key, value) } },
    'react-native': { Platform: { OS: 'android' } },
  }, { AbortController, fetch: async (_, options) => {
    requests++; sentHeaders = options.headers;
    await new Promise(resolve => setTimeout(resolve, 5));
    if (mode === 'offline') throw new Error('offline');
    return { ok: true, status: mode === 'unchanged' ? 304 : 200, headers: { get: () => '"server-platform-etag"' }, json: async () => mode === 'invalid' ? {} : raw };
  } });
  await Promise.all([service.refreshGiftCatalog(), service.refreshGiftCatalog()]);
  assert.equal(requests, 1); assert.equal(service.getGiftCatalog().version, '7');
  assert.ok([...saved.values()][0].includes('server-platform-etag'));
  mode = 'unchanged'; await service.refreshGiftCatalog(); assert.equal(sentHeaders['If-None-Match'], '"server-platform-etag"');
  mode = 'invalid'; await assert.rejects(service.refreshGiftCatalog(), /Invalid gift catalog/); assert.equal(service.getGiftCatalog().version, '7');
  mode = 'offline'; await assert.rejects(service.refreshGiftCatalog(), /offline/); assert.equal(service.getGiftCatalog().version, '7');
});
test('a mounted closed drawer refreshes the catalog and warms Popular artwork before opening', () => {
  const artwork = { id: 'uploaded-art' }; let refreshes = 0; const warmed = [], effects = [], cleanups = [];
  const current = { version: '1', collections: [{ id: 'popular', gifts: [{ snapshot: { thumbnail: artwork } }] }] };
  const hook = moduleFrom('../hooks/useGiftCatalog.ts', {
    react: { useState: init => [init(), () => {}], useEffect: fn => effects.push(fn) },
    'react-native': { AppState: { addEventListener: () => { throw Error('closed drawer must not start polling'); } } },
    '@/utils/giftCatalog': { getGiftCatalog: () => current, subscribeGiftCatalog: () => () => {}, refreshGiftCatalog: async () => { refreshes++; } },
    '@/components/GiftPicker': { POPULAR_GIFTS: [], LUXURY_GIFTS: [] },
    '@/utils/giftAssetCache': { prefetchGiftThumbnails: async assets => { warmed.push(...assets); } },
  });
  hook.useGiftCatalog(false);
  effects.forEach(effect => cleanups.push(effect()));
  assert.equal(refreshes, 1);
  assert.deepEqual(warmed, [artwork]);
  cleanups.forEach(cleanup => cleanup?.());
});
function cacheHarness() {
  const files = new Map(), modified = new Map(), fixtures = new Map(); let downloads = 0, reads = 0, active = 0, peak = 0;
  let downloaded = Buffer.from('verified artwork');
  class File {
    constructor(root, name) { this.name = name; this.uri = name ? `file:///${name}` : root; }
    get exists() { return files.has(this.uri); }
    get size() { return files.get(this.uri)?.length ?? 0; }
    get modificationTime() { return modified.get(this.uri) ?? 0; }
    async bytes() { reads++; return files.get(this.uri); }
    delete() { files.delete(this.uri); }
    static async downloadFileAsync(url, file) {
      downloads++; active++; peak = Math.max(peak, active);
      const fixture = fixtures.get(url);
      await (fixture?.wait ?? new Promise(resolve => setTimeout(resolve, 5)));
      files.set(file.uri, fixture?.bytes ?? downloaded); active--; return file;
    }
  }
  class Directory { create() {} list() { return []; } }
  const service = moduleFrom('../utils/giftAssetCache.native.ts', {
    'expo-file-system': { Directory, File, Paths: { cache: 'cache' } },
    'expo-crypto': { CryptoDigestAlgorithm: { SHA256: 'sha256' }, digest: async (_, bytes) => Uint8Array.from(crypto.createHash('sha256').update(bytes).digest()).buffer },
    './giftCatalog': { giftAssetUrl: url => url },
  });
  return { service, files, modified, get reads() { return reads; }, get peak() { return peak; },
    addAsset(id, format = 'png', wait) { const bytes = Buffer.from(id); const url = `/api/gift-catalog/assets/${id}`; fixtures.set(url, { bytes, wait }); return { id, url, format, byteSize: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }; },
    get downloads() { return downloads; }, setDownloaded(value) { downloaded = value; }, asset: { id: 'asset', url: '/api/gift-catalog/assets/asset', sha256: crypto.createHash('sha256').update(downloaded).digest('hex'), byteSize: downloaded.length, format: 'png' } };
}
test('verified cache hits skip hashing; changed or missing files are not exposed as warm artwork', async () => {
  const h = cacheHarness();
  assert.equal(h.service.getCachedGiftAssetUri(h.asset), null);
  const first = await h.service.acquireGiftAsset(h.asset); first.release();
  assert.equal(h.service.getCachedGiftAssetUri(h.asset), first.uri);
  (await h.service.acquireGiftAsset(h.asset)).release();
  assert.equal(h.reads, 1);
  h.modified.set(first.uri, 1);
  assert.equal(h.service.getCachedGiftAssetUri(h.asset), null);
  (await h.service.acquireGiftAsset(h.asset)).release();
  assert.equal(h.reads, 2);
  h.files.delete(first.uri);
  assert.equal(h.service.getCachedGiftAssetUri(h.asset), null);
  (await h.service.acquireGiftAsset(h.asset)).release();
  assert.equal(h.downloads, 2);
});
test('thumbnail warming is bounded to eight cells and proceeds while a movie download is blocked', async () => {
  const h = cacheHarness(); let unblock;
  const wait = new Promise(resolve => { unblock = resolve; });
  const movie = h.service.acquireGiftAsset(h.addAsset('movie', 'mp4', wait));
  try {
    const thumbs = Array.from({ length: 12 }, (_, i) => h.addAsset(`thumb-${i}`));
    await Promise.race([h.service.prefetchGiftThumbnails(thumbs), new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('artwork blocked by movie')), 1000); timer.unref(); })]);
    assert.equal(h.downloads, 9);
    assert.equal(h.peak, 4);
    thumbs.slice(0, 8).forEach(asset => assert.ok(h.service.getCachedGiftAssetUri(asset)));
    assert.equal(h.service.getCachedGiftAssetUri(thumbs[8]), null);
  } finally { unblock(); (await movie).release(); }
});
test('concurrent asset callers share one verified download and independent protected leases', async () => {
  const harness = cacheHarness();
  const leases = await Promise.all(Array.from({ length: 8 }, () => harness.service.acquireGiftAsset(harness.asset)));
  assert.equal(harness.downloads, 1);
  assert.equal(new Set(leases.map(lease => lease.uri)).size, 1);
  leases.forEach(lease => { lease.release(); lease.release(); });
  const reopened = await harness.service.acquireGiftAsset(harness.asset); reopened.release();
  assert.equal(harness.downloads, 1);
});
test('size/checksum failure deletes corrupt bytes, permits retry and never supplies unverified art', async () => {
  const harness = cacheHarness(); harness.setDownloaded(Buffer.from('corrupt'));
  await assert.rejects(harness.service.acquireGiftAsset(harness.asset), /size mismatch/);
  assert.equal(harness.files.size, 0);
  harness.setDownloaded(Buffer.from('x'.repeat(harness.asset.byteSize)));
  await assert.rejects(harness.service.acquireGiftAsset(harness.asset), /checksum mismatch/);
  assert.equal(harness.files.size, 0);
  harness.setDownloaded(Buffer.from('verified artwork'));
  const lease = await harness.service.acquireGiftAsset(harness.asset); lease.release();
  assert.equal(harness.downloads, 3);
});
