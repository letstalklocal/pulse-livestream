const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const test = require('node:test');

function harness() {
  let downloads = 0, created = 0, payload = Buffer.from('gift artwork'), ok = true;
  const bytes = Buffer.from(payload);
  const asset = { id: 'art', url: '/api/gift-catalog/assets/art', format: 'png', byteSize: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(require.resolve('../utils/giftAssetCache.web.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Blob, crypto: crypto.webcrypto,
    URL: { createObjectURL: () => `blob:gift-${++created}`, revokeObjectURL: () => {} },
    fetch: async url => { assert.equal(url, `https://app.test${asset.url}`); downloads++; return { ok, blob: async () => new Blob([payload], { type: 'image/png' }) }; },
    require: name => {
      // Importing the native file system would reproduce the web crash.
      assert.equal(name, './giftCatalog', 'Web cache must not import native filesystem');
      return { giftAssetUrl: url => `https://app.test${url}` };
    },
  });
  return { service: module.exports, asset, get downloads() { return downloads; }, get created() { return created; },
    set payload(value) { payload = value; }, set ok(value) { ok = value; } };
}

test('web gift drawer can import the cache and share verified blob artwork without native files', async () => {
  const h = harness();
  assert.equal(h.service.getCachedGiftAssetUri(h.asset), null);
  const leases = await Promise.all(Array.from({ length: 5 }, () => h.service.acquireGiftAsset(h.asset)));
  assert.equal(h.downloads, 1);
  assert.equal(h.created, 1);
  assert.ok(leases.every(lease => lease.uri === 'blob:gift-1'));
  leases.forEach(lease => { lease.release(); lease.release(); });
  assert.equal(h.service.getCachedGiftAssetUri(h.asset), 'blob:gift-1');
  (await h.service.acquireGiftAsset(h.asset)).release();
  assert.equal(h.downloads, 1);
});

test('web cache rejects failed downloads and corrupt bytes, then allows retry', async () => {
  const h = harness();
  h.ok = false;
  await assert.rejects(h.service.acquireGiftAsset(h.asset), /download failed/);
  h.ok = true; h.payload = Buffer.from('short');
  await assert.rejects(h.service.acquireGiftAsset(h.asset), /size mismatch/);
  h.payload = Buffer.alloc(h.asset.byteSize);
  await assert.rejects(h.service.acquireGiftAsset(h.asset), /checksum mismatch/);
  assert.equal(h.created, 0);
  assert.equal(h.service.getCachedGiftAssetUri(h.asset), null);
  h.payload = Buffer.from('gift artwork');
  (await h.service.acquireGiftAsset(h.asset)).release();
  assert.equal(h.created, 1);
});

test('web thumbnail warming stops after the first eight drawer cells', async () => {
  const h = harness();
  const assets = Array.from({ length: 12 }, (_, i) => ({ ...h.asset, format: `png${i}` }));
  await h.service.prefetchGiftThumbnails(assets);
  assert.equal(h.downloads, 8);
  assets.slice(0, 8).forEach(asset => assert.ok(h.service.getCachedGiftAssetUri(asset)));
  assert.equal(h.service.getCachedGiftAssetUri(assets[8]), null);
});

for (const platform of ['web', 'ios', 'android']) {
  test(`original cache import selects ${platform} implementation without executing the other`, () => {
    const service = { getCachedGiftAssetUri() {}, acquireGiftAsset() {}, prefetchGiftThumbnails() {} };
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(require.resolve('../utils/giftAssetCache.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const calls = [];
    vm.runInNewContext(code, { module, exports: module.exports, require: name => {
      if (name === 'react-native') return { Platform: { OS: platform } };
      calls.push(name);
      assert.equal(name, platform === 'web' ? './giftAssetCache.web' : './giftAssetCache.native');
      return service;
    } });
    assert.equal(calls.length, 1);
    assert.equal(module.exports.acquireGiftAsset, service.acquireGiftAsset);
  });
}
