import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
const { code } = transformSync(readFileSync(new URL('../../mobile/hooks/useBeautySlider.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' });
function setup() {
  const frames = new Map(), changes = [];
  let cleanup, id = 0;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'requestAnimationFrame', 'cancelAnimationFrame', code)(
    () => ({ useRef: current => ({ current }), useEffect: fn => { cleanup = fn(); } }), module, module.exports,
    fn => { frames.set(++id, fn); return id; }, key => frames.delete(key),
  );
  const update = module.exports.useBeautySlider(0.3, value => changes.push(value));
  return { update, frames, changes, cleanup: () => cleanup(), tick: () => { const queued = [...frames.values()]; frames.clear(); queued.forEach(fn => fn()); } };
}
test('drag events never synchronously update React and use the latest value once per frame', () => {
  const f = setup();
  for (let i = 0; i <= 100; i++) f.update(i / 100);
  assert.deepEqual(f.changes, []);
  assert.equal(f.frames.size, 1);
  f.tick(); assert.deepEqual(f.changes, [1]);
  for (let i = 0; i < 100; i++) f.update(1);
  assert.equal(f.frames.size, 0);
});
test('returning to the original value skips the update; invalid inputs are ignored', () => {
  const f = setup(); f.update(0.8); f.update(0.3); f.tick();
  f.update(NaN); f.update(Infinity);
  assert.deepEqual(f.changes, []); assert.equal(f.frames.size, 0);
});
test('closing the sheet cancels queued updates', () => {
  const f = setup(); f.update(0.9); f.cleanup(); f.tick();
  assert.deepEqual(f.changes, []);
});
