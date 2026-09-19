const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require.resolve('../utils/creatorVideos.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
async function check(path, method, responses, signal) {
  let calls = 0;
  const warnings = [], mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, process: { env: {} }, AbortController, setTimeout, clearTimeout,
    console: { warn: (...args) => warnings.push(args) },
    fetch: async () => responses[calls++](),
    require: id => id === 'expo-file-system' ? {} : { fetch() { throw Error('Unexpected provider request'); } },
  });
  const result = mod.exports.videoRequest(path, async () => 'private-token', method, undefined, signal);
  return { result, calls: () => calls, warnings };
}
(async () => {
  for (const [path, method] of [['/library', 'GET'], ['/id/refresh', 'POST']]) {
    for (const body of ['', '{"status":', '<html>Unavailable</html>']) {
      const h = await check(path, method, [() => new Response(body, { status: 200 }), () => Response.json({ status: 'processing' })]);
      assert.equal((await h.result).status, 'processing');
      assert.equal(h.calls(), 2);
      assert.ok(!JSON.stringify(h.warnings).includes('private-token'));
    }
  }
  for (const [path, method] of [['/uploads', 'POST'], ['/id/gifts', 'POST'], ['/id', 'DELETE']]) {
    const h = await check(path, method, [() => new Response('')]);
    await assert.rejects(h.result, /Video service unavailable/);
    assert.equal(h.calls(), 1, 'mutations are not blindly retried');
  }
  let h = await check('/library', 'GET', [() => new Response(''), () => new Response('')]);
  await assert.rejects(h.result, /Video service unavailable/);
  assert.equal(h.calls(), 2, 'malformed responses have a bounded retry');
  h = await check('/library', 'GET', [() => Response.json({ error: 'Sign in required.' }, { status: 401 })]);
  await assert.rejects(h.result, /Sign in required/); assert.equal(h.calls(), 1);
  const controller = new AbortController();
  h = await check('/id/refresh', 'POST', [() => { controller.abort(); return new Response(''); }], controller.signal);
  await assert.rejects(h.result, /cancelled/); assert.equal(h.calls(), 1);
  console.log('PASS: empty/truncated processing responses recover once, persistent failures use a readable error, cancellation/auth failures and mutations are not retried. Transport mocked.');
})().catch(e => { console.error(e); process.exitCode = 1; });
