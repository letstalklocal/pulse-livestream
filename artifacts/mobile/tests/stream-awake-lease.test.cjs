const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {}, timers = new Map();
let nextTimer = 0;
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../utils/streamAwakeLease.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: exportsObject, setInterval: (fn, delay) => { assert.equal(delay, 10000); timers.set(++nextTimer, fn); return nextTimer; }, clearInterval: id => timers.delete(id),
});
const start = exportsObject.startStreamAwakeLease;
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
(async () => {
  let foreground = true, onActive, attempts = 0, unsubscribed = false;
  const activated = [], released = [], errors = [];
  const stop = start({ tag: 'host-a', activate: async tag => { attempts++; if (attempts === 1) throw new Error('Activity not ready'); activated.push(tag); }, deactivate: async tag => released.push(tag), isForeground: () => foreground, subscribe: fn => { onActive = fn; return () => { unsubscribed = true; }; }, reportError: e => errors.push(e) });
  await flush(); assert.equal(errors.length, 1);
  [...timers.values()].forEach(fn => fn()); await flush(); assert.deepEqual(activated, ['host-a'], 'Failed first activation must retry');
  [...timers.values()].forEach(fn => fn()); await flush(); assert.equal(activated.length, 2, 'Foreground renewal reasserts the native flag');
  foreground = false; [...timers.values()].forEach(fn => fn()); await flush(); assert.equal(activated.length, 2);
  foreground = true; onActive(); await flush(); assert.equal(activated.length, 3, 'Foreground return renews immediately');
  stop(); await flush(); assert.deepEqual(released, ['host-a']); assert.equal(timers.size, 0); assert.equal(unsubscribed, true);
  onActive(); await flush(); assert.equal(activated.length, 3);
  let finish;
  const calls = [];
  const stopLate = start({ tag: 'old-viewer', activate: tag => { calls.push('start:'+tag); return new Promise(resolve => { finish = () => { calls.push('active:'+tag); resolve(); }; }); }, deactivate: async tag => calls.push('release:'+tag), isForeground: () => true, subscribe: () => () => {}, reportError: e => { throw e; } });
  await flush(); stopLate(); await flush(); assert.deepEqual(calls, ['start:old-viewer']);
  finish(); await flush(); assert.deepEqual(calls, ['start:old-viewer','active:old-viewer','release:old-viewer']);
  const stopNew = start({ tag: 'new-viewer', activate: async tag => activated.push(tag), deactivate: async tag => released.push(tag), isForeground: () => true, subscribe: () => () => {}, reportError: e => { throw e; } });
  await flush(); assert.equal(activated.at(-1), 'new-viewer'); stopNew(); await flush(); assert.equal(released.at(-1), 'new-viewer'); assert.equal(timers.size, 0);
  console.log('PASS: awake activation retry, foreground repair, background suppression, per-screen release and late-activation cleanup.');
})().catch(e => { console.error(e); process.exitCode = 1; });
