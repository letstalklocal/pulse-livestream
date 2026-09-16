const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require.resolve('../hooks/useIdleAutoClose.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture() {
  const slots = [], timers = new Map(); let cursor = 0, now = 0, nextId = 0, effects = [];
  const same = (a, b) => a && a.length === b.length && a.every((v,i) => Object.is(v,b[i]));
  const react = {
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useCallback(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps,deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps,deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const api = {};
  vm.runInNewContext(code, { exports: api, require: () => react, setTimeout: (fn, delay) => { timers.set(++nextId, { fn, due: now + delay }); return nextId; }, clearTimeout: id => timers.delete(id) });
  return {
    render(close, paused = false) { cursor = 0; const reset = api.useIdleAutoClose(close, paused); effects.forEach(fn => fn()); effects = []; return reset; },
    tick(ms) { now += ms; for (const [id,timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.fn(); } },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
let closes = 0;
const a = fixture(); a.render(() => closes++); a.tick(9999); assert.equal(closes,0); a.tick(1); assert.equal(closes,1); a.unmount();
const b = fixture(); const reset = b.render(() => closes++); b.tick(6000); reset(); b.tick(4000); assert.equal(closes,1); b.render(() => closes += 10); b.tick(6000); assert.equal(closes,11,'Interaction resets deadline; ordinary renders do not; latest callback is used'); b.unmount();
const c = fixture(); c.render(() => closes++); c.tick(8000); c.render(() => closes++, true); c.tick(20000); assert.equal(closes,11,'Moderation pauses auto-close'); c.render(() => closes++); c.tick(9999); assert.equal(closes,11); c.tick(1); assert.equal(closes,12); c.unmount();
const d = fixture(); d.render(() => closes++); d.unmount(); d.tick(20000); assert.equal(closes,12,'No timeout after unmount');
console.log('PASS: 10-second idle close, touch/search/scroll reset, render stability, moderation pause/resume and cleanup.');
