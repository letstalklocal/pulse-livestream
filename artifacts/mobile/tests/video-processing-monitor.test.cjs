const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../utils/videoProcessingMonitor.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: mod, exports: mod.exports });
(async () => {
  let videos = [{ id: 'old', status: 'ready' }, { id: 'new', status: 'processing' }];
  let status = 'processing', refreshes = 0, fail = false;
  const completed = [];
  const check = mod.exports.createVideoProcessingMonitor(async path => {
    if (path === '/library') return { videos };
    refreshes++;
    if (fail) throw Error('temporary network error');
    return { id: 'new', status };
  }, video => completed.push(video));
  const signal = new AbortController().signal;
  await check(signal);
  assert.equal(completed.length, 0, 'finished history is not replayed');
  fail = true; await check(signal); fail = false;
  status = 'ready'; await check(signal); await check(signal);
  assert.equal(completed.length, 1, 'completion survives network failures and is deduplicated');
  videos = [{ id: 'old', status: 'ready' }, { id: 'new', status: 'ready' }, { id: 'fast', status: 'ready' }];
  await check(signal);
  assert.equal(completed.at(-1).id, 'fast', 'new upload completed by the sheet also notifies');
  const controller = new AbortController();
  const late = mod.exports.createVideoProcessingMonitor(async path => {
    if (path === '/library') return { videos: [{ id: 'late', status: 'processing' }] };
    controller.abort(); return { id: 'late', status: 'ready' };
  }, () => assert.fail('aborted/account-switched response must not notify'));
  await late(controller.signal);
  const failed = [];
  await mod.exports.createVideoProcessingMonitor(async path => path === '/library'
    ? { videos: [{ id: 'failure', status: 'processing' }] } : { id: 'failure', status: 'failed' }, v => failed.push(v))(signal);
  assert.equal(failed[0].status, 'failed');
  assert.ok(refreshes > 0);
  console.log('PASS: processing monitor handles history, progress, completion, retry, deduplication, fast completion, failure and late abort. No device notification proof.');
})().catch(e => { console.error(e); process.exitCode = 1; });
