const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../utils/videoCache/core.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: mod, exports: mod.exports, Date, Map, Promise, Error });
const { createVideoCache, VIDEO_CACHE_TTL_MS: ttl } = mod.exports;
function fixture(limit = 20) {
  let clock = 100, index = [], downloads = 0, failed = false;
  const files = new Set();
  const storage = {
    read: async () => structuredClone(index), write: async value => { if (failed) throw Error('disk full'); index = structuredClone(value); },
    exists: async file => files.has(file), remove: async file => files.delete(file), uri: file => `file://${file}`,
    download: async (url, signal, progress) => { signal.throwIfAborted(); downloads++; const file = `v${downloads}.mp4`; files.add(file); progress(10); return { file, bytes: 10 }; },
  };
  return { cache: createVideoCache(storage, () => clock, limit), storage, files,
    advance: ms => { clock += ms; }, downloads: () => downloads, failWrites: value => { failed = value; },
    reload: () => createVideoCache(storage, () => clock, limit) };
}
const signal = () => new AbortController().signal;
(async () => {
  const f = fixture();
  let a = await f.cache.acquire('a:v1', 'https://a', signal());
  assert.equal(a.source, 'download'); await a.release();
  f.advance(1);
  let b = await f.cache.acquire('b:v1', 'https://b', signal()); await b.release();
  f.advance(1);
  const reread = await f.cache.acquire('a:v1', 'https://a', signal());
  assert.equal(reread.source, 'cache'); assert.equal(reread.createdAt, a.createdAt); await reread.release();
  const c = await f.cache.acquire('c:v1', 'https://c', signal()); await c.release();
  assert.equal((await f.cache.snapshot()).map(row => row.key).join(','), 'b:v1,c:v1', 'FIFO, not LRU: reading a does not protect it');
  const fromDisk = await f.reload().acquire('b:v1', 'https://b', signal());
  assert.equal(fromDisk.source, 'cache'); await fromDisk.release();
  f.advance(ttl);
  assert.equal((await f.cache.snapshot()).length, 0, 'expiry occurs without needing capacity pressure');
  assert.equal(f.downloads(), 3, 'expiry does not automatically redownload');
  const expired = await f.cache.acquire('b:v1', 'https://b', signal());
  assert.equal(expired.source, 'download'); await expired.release();

  const g = fixture(10);
  a = await g.cache.acquire('a', 'https://a', signal());
  await assert.rejects(g.cache.acquire('b', 'https://b', signal()), /cache-busy/);
  assert.equal(g.files.size, 1, 'active file is pinned and failed replacement removed');
  g.advance(ttl);
  assert.equal((await g.cache.snapshot()).length, 1, 'physical deletion waits for the active reader');
  await a.release(); await a.release();
  assert.equal(g.files.size, 0, 'expired active file removed on release; release is idempotent');

  const h = fixture();
  const both = await Promise.all([h.cache.acquire('same', 'https://same', signal()), h.cache.acquire('same', 'https://same', signal())]);
  assert.equal(h.downloads(), 1, 'concurrent acquisitions share one completed file');
  await both[0].release(); await both[1].release();
  h.files.clear();
  a = await h.cache.acquire('same', 'https://same', signal());
  assert.equal(a.source, 'download', 'OS cache deletion triggers a new download'); await a.release();
  await h.cache.expireForTest(); assert.equal(h.files.size, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(h.cache.acquire('cancelled', 'https://x', controller.signal));
  assert.equal(h.downloads(), 2);
  h.failWrites(true);
  await assert.rejects(h.cache.acquire('fail', 'https://x', signal()));
  h.failWrites(false);
  a = await h.cache.acquire('recovered', 'https://x', signal()); await a.release();
  assert.equal((await h.cache.snapshot()).length, 1, 'queue recovers after errors');
  await h.cache.clear(); assert.equal(h.files.size, 0);
  const small = fixture(5);
  await assert.rejects(small.cache.acquire('large', 'https://x', signal()), /cache-size/);
  assert.equal(small.files.size, 0);
  console.log('PASS: persistent full-file cache, concurrent reuse, fixed 24h expiry, FIFO, pinned readers, OS removal, cancellation, size bounds and error recovery.');
})().catch(error => { console.error(error); process.exitCode = 1; });
