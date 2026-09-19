const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../utils/creatorVideos.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const CHUNK = 5 * 1024 * 1024;
const contents = Uint8Array.from({ length: 6 * 1024 * 1024 }, (_, i) => i % 251);
function harness({ interrupted = false, partial = false, badLocation = false, readFailure = false, cancelAfterChunk } = {}) {
  const requests = [], progress = [], reads = [];
  let offset = 0, failed = false, opened = 0, closed = 0;
  class File {
    size = contents.length;
    slice() { throw Error("Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported"); }
    open(mode) {
      assert.equal(mode, 'r', 'source is opened read-only');
      opened++;
      let isClosed = false;
      return {
        offset: 0,
        readBytes(length) {
          assert.ok(!isClosed);
          assert.ok(length > 0 && length <= CHUNK, 'only a bounded chunk is read');
          reads.push({ offset: this.offset, length });
          if (readFailure) throw Error('file unavailable');
          const bytes = contents.slice(this.offset, this.offset + length);
          this.offset += bytes.length;
          return bytes;
        },
        close() { assert.ok(!isClosed); isClosed = true; closed++; },
      };
    }
  }
  const mod = { exports: {} };
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports, process: { env: {} }, AbortController, URL,
    setTimeout, clearTimeout, btoa, Uint8Array,
    Blob: class { constructor() { throw Error('Native Blob construction is unsupported'); } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith('/uploads')) return Response.json({ id: 'id', endpoint: 'https://video.bunnycdn.com/tusupload', headers: { AuthorizationSignature: 'scoped', VideoId: 'id' } });
      return Response.json({ status: 'processing' });
    },
    require: id => {
      if (id === 'expo-file-system') return { File, FileMode: { ReadOnly: 'r' } };
      if (id === 'expo/fetch') return { fetch: async (url, options) => {
        if (options.signal.aborted) throw Error('aborted');
        requests.push({ url, options });
        if (options.method === 'POST') return new Response(null, { status: 201, headers: { location: badLocation ? 'https://other.example/upload' : 'https://video.bunnycdn.com/tusupload/session' } });
        if (options.method === 'HEAD') return new Response(null, { headers: { 'upload-offset': String(offset) } });
        assert.ok(options.body instanceof Uint8Array, 'upload binary bytes directly without Blob');
        assert.equal(Number(options.headers['Upload-Offset']), offset);
        assert.deepEqual(options.body, contents.slice(offset, offset + options.body.byteLength), 'bytes match the acknowledged file offset');
        offset += interrupted && !failed && partial ? 1024 * 1024 : options.body.byteLength;
        cancelAfterChunk?.abort();
        if (options.signal.aborted) throw Error('aborted');
        if (interrupted && !failed) { failed = true; throw Error('connection lost after chunk accepted'); }
        return new Response(null, { status: 204, headers: { 'upload-offset': String(offset) } });
      } };
      throw Error(id);
    },
  });
  return {
    run: signal => mod.exports.uploadCreatorVideo({ uri: 'file:///test.mp4', fileName: 'test.mp4' }, async () => 'token', signal, n => progress.push(n)),
    requests, progress, reads, offset: () => offset,
    checkClosed: () => assert.equal(opened, closed, 'every opened file handle is closed'),
  };
}
(async () => {
  for (const options of [{}, { interrupted: true }, { interrupted: true, partial: true }]) {
    const h = harness(options);
    await h.run(new AbortController().signal);
    assert.equal(h.offset(), contents.length);
    assert.equal(h.progress.at(-1), 100);
    h.checkClosed();
    assert.ok(h.reads.length >= 2);
    assert.equal(h.requests.filter(r => r.options.method === 'PATCH').length, 2);
    if (options.interrupted) assert.ok(h.requests.some(r => r.options.method === 'HEAD'));
    assert.ok(h.requests.filter(r => r.url.startsWith('https://video.')).every(r => !r.options.headers.Authorization), 'account bearer token never sent to provider');
  }
  let h = harness({ badLocation: true });
  await assert.rejects(h.run(new AbortController().signal), /destination/);
  assert.ok(!h.requests.some(r => r.url.startsWith('https://other')));
  h.checkClosed();
  h = harness();
  let controller = new AbortController(); controller.abort();
  await assert.rejects(h.run(controller.signal));
  assert.equal(h.requests.length, 0, 'cancelled upload creates no provider records');
  h.checkClosed();
  controller = new AbortController();
  h = harness({ cancelAfterChunk: controller });
  await assert.rejects(h.run(controller.signal), /aborted|cancelled/);
  assert.ok(!h.requests.some(r => r.url.endsWith('/refresh')));
  h.checkClosed();
  h = harness({ readFailure: true });
  await assert.rejects(h.run(new AbortController().signal), /file unavailable/);
  assert.ok(!h.requests.some(r => r.options.method === 'PATCH'));
  h.checkClosed();
  console.log('PASS: binary chunks without Blob, bounded reads, exact bytes after full/partial offset recovery, handle cleanup, cancellation and destination/token checks. Native filesystem/transport mocked.');
})().catch(e => { console.error(e); process.exitCode = 1; });
