const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const refs = [], effects = [], animations = [];
let cursor = 0, cleanup;
const react = {
  createElement: () => null,
  useRef: value => refs[cursor++] ??= { current: value },
  useEffect: effect => effects.push(effect),
};
class Value { constructor(value) { this.value = value; } setValue(value) { this.value = value; } }
const Animated = {
  Value, View: 'View', timing: (value, options) => ({ value, options }),
  parallel: steps => ({ parallel: steps }), delay: ms => ({ delay: ms }),
  sequence: steps => {
    const animation = { steps, start(callback) { this.callback = callback; }, stop() { this.stopped = true; this.callback?.({ finished: false }); } };
    animations.push(animation); return animation;
  },
};
const moduleObject = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(require.resolve('../components/GiftFloater.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
vm.runInNewContext(code, { module: moduleObject, exports: moduleObject.exports, require: name => {
  if (name === 'react') return react;
  if (name === 'react-native') return { Animated, Easing: { out: v => v, in: v => v, inOut: v => v }, StyleSheet: { create: v => v } };
  return { hasGiftImage: () => false };
} });
const done = [];
function render(count, id) {
  cursor = 0;
  moduleObject.exports.GiftFloater({ gift: { id, comboCount: count, name: 'Rose' }, onDone: id => done.push(id) });
  cleanup?.(); cleanup = effects.pop()();
  return animations.at(-1);
}
const initial = render(1, 'first');
const second = render(2, 'second');
assert.equal(initial.stopped, true);
assert.equal(done.length, 0, 'interrupted animation must not remove the combo');
assert.equal(refs[0].current.value, 0);
assert.equal(refs[1].current.value, 1);
assert.equal(refs[2].current.value, 1, 'artwork holds at normal size without a repeated entrance');
assert.equal(second.steps[0].delay, 2000);
const third = render(3, 'third');
assert.equal(second.stopped, true);
assert.equal(third.steps[0].delay, 2000, 'each higher count renews the hold');
third.callback({ finished: true });
assert.deepEqual(done, ['third'], 'completion removes the latest transaction, not the initial gift');
console.log('PASS: combo updates cancel motion, hold steady, renew the two-second delay and complete with the latest gift ID. Native appearance remains device-pending.');
