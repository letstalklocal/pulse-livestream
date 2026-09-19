const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../utils/videoCache/index.native.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
function fixture(mode = 'ok') {
  let adapter, cancels = 0, manifest = 'broken json';
  const files = new Set(['file:///cache/discovery-video-v1/orphan.part']);
  const native = { cacheDirectory: 'file:///cache/', makeDirectoryAsync: async () => {},
    readDirectoryAsync: async () => [...files].map(file => file.split('/').at(-1)),
    deleteAsync: async uri => { files.delete(uri); }, moveAsync: async ({from,to}) => { files.delete(from); files.add(to); },
    getInfoAsync: async uri => ({ exists: files.has(uri), size: 100, isDirectory: false }),
    createDownloadResumable: (url, partial, options, progress) => ({
      cancelAsync: async () => { cancels++; },
      downloadAsync: async () => {
        files.add(partial);
        progress({ totalBytesWritten: 100, totalBytesExpectedToWrite: mode === 'large' ? 999999999 : 100 });
        if (mode === 'throw') throw Error('network');
        return { status: mode === '404' ? 404 : 200, headers: { 'Content-Type': mode === 'html' ? 'text/html' : 'video/mp4' } };
      },
    }),
  };
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, setTimeout, clearTimeout, Date, Math, Error,
    require: name => {
      if (name === 'expo-file-system/legacy') return native;
      if (name.includes('async-storage')) return { getItem: async () => manifest, setItem: async (_, value) => { manifest = value; } };
      if (name === './core') return { VIDEO_CACHE_MAX_BYTES: 256 * 1024 * 1024, createVideoCache: value => { adapter = value; return {}; } };
      throw Error(name);
    },
  });
  return { adapter, files, cancels: () => cancels };
}
(async () => {
  let f = fixture();
  assert.equal((await f.adapter.read()).length, 0);
  assert.equal(f.files.size, 0, 'orphaned partial removed after restart/corrupt manifest');
  const result = await f.adapter.download('https://sample/video.mp4', new AbortController().signal, () => {});
  assert.equal(result.bytes, 100); assert.equal(f.files.size, 1);
  assert.ok([...f.files][0].endsWith('.mp4'), 'only complete downloads move to final filenames');
  for (const mode of ['404', 'throw', 'large', 'html']) {
    f = fixture(mode); await f.adapter.read();
    await assert.rejects(f.adapter.download('https://sample/video.mp4', new AbortController().signal, () => {}));
    assert.equal(f.files.size, 0, `${mode} leaves no partial or playable cache file`);
    if (mode === 'large') assert.ok(f.cancels() > 0);
  }
  f = fixture(); await f.adapter.read();
  const controller = new AbortController();
  await assert.rejects(f.adapter.download('https://sample/video.mp4', controller.signal, () => controller.abort()));
  assert.ok(f.cancels() > 0); assert.equal(f.files.size, 0);
  await assert.rejects(f.adapter.download('http://insecure/video.mp4', new AbortController().signal, () => {}));
  console.log('PASS: native adapter atomic completion, corrupt manifest recovery, orphan cleanup, HTTP/type/size failures and cancellation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
