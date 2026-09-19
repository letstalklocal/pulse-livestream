const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require.resolve('../utils/confirmVideoBeforeLive.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(request) {
  const mod = { exports: {} }, alerts = [], requests = [];
  vm.runInNewContext(code, { module: mod, exports: mod.exports, AbortController, setTimeout, clearTimeout,
    require: id => id === 'react-native' ? { Alert: { alert: (...args) => alerts.push(args) } } : {
      videoRequest: (...args) => { requests.push(args); return request(...args); },
    } });
  return { alerts, requests, confirm: mod.exports.confirmVideoBeforeLive };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const active = { enabled: true, selectedId: 'clip' };
(async () => {
  for (const library of [{ enabled: false, selectedId: 'clip' }, { enabled: true, selectedId: null }]) {
    const h = harness(async () => library);
    assert.equal(await h.confirm(async () => 'token', x => x, new AbortController().signal), true);
    assert.equal(h.alerts.length, 0, 'no notice without an active video');
  }
  for (const action of ['Continue', 'Cancel', 'dismiss', 'abort']) {
    const h = harness(async () => active), controller = new AbortController();
    let settled = false;
    const pending = h.confirm(async () => 'token', x => x, controller.signal).then(value => { settled = true; return value; });
    await flush(); assert.equal(settled, false, 'startup waits for the notice');
    assert.equal(h.alerts.length, 1);
    const [, text, buttons, options] = h.alerts[0];
    assert.equal(text, 'Your active video will be turned off when you start broadcasting.');
    if (action === 'dismiss') options.onDismiss();
    else if (action === 'abort') { controller.abort(); buttons.find(b => b.text === 'Continue').onPress(); }
    else buttons.find(b => b.text === action).onPress();
    assert.equal(await pending, action === 'Continue');
    assert.equal(h.requests.length, 1); assert.equal(h.requests[0][0], '/library'); assert.equal(h.requests[0][2], 'GET', 'notice never changes visibility or creates a live');
  }
  let resolve;
  const h = harness(() => new Promise(yes => { resolve = yes; })), controller = new AbortController();
  const waiting = h.confirm(async () => 'token', x => x, controller.signal); controller.abort();
  assert.equal(await waiting, false); assert.equal(h.requests[0][4].aborted, true);
  resolve(active); await flush(); assert.equal(h.alerts.length, 0, 'late status never prompts after leaving');
  const timed = harness(() => new Promise(() => {}));
  await assert.rejects(timed.confirm(async () => 'token', x => x, new AbortController().signal, 10), /Video service unavailable/);
  assert.equal(timed.requests[0][4].aborted, true, 'deadline cancels a stalled read/token operation');
  const failed = harness(async () => { throw Error('offline'); });
  await assert.rejects(failed.confirm(async () => 'token', x => x, new AbortController().signal), /offline/);
  console.log('PASS: active-video-only startup notice, Continue/Cancel/dismiss, read-only checks, timeout, abort and late-response protection. Native alert mocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
