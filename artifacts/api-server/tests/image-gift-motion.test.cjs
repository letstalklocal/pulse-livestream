const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = ts.createSourceFile('renderer.js', fs.readFileSync('scripts/live-gift-renderer.cjs', 'utf8'), ts.ScriptTarget.Latest, true);
let fn;
function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'imageGiftFrame') fn = node.getText(source); ts.forEachChild(node, visit); }
visit(source); assert.ok(fn);
const frame = new Function(fn + '; return imageGiftFrame;')();
assert.deepEqual(frame(0, 3), { scale: .35, y: 0, opacity: 0 });
assert.equal(frame(.32, 3).scale, 1.25);
assert.equal(frame(1.5, 3).scale, 1);
assert.equal(frame(1.5, 3).opacity, 1);
assert.ok(frame(2.5, 3).y < 0);
assert.equal(frame(3, 3).y, -150);
assert.equal(frame(3, 3).opacity, 0);
assert.deepEqual(frame(2.5, 3, 'fade'), { scale: 1, y: 0, opacity: .5 });
assert.equal(frame(0, 3, undefined, 'slide-up', 'shrink').y, 150);
assert.equal(frame(0, 3, undefined, 'slide-down', 'fade').y, -150);
assert.equal(frame(3, 3, undefined, 'fade', 'float-down').y, 150);
assert.equal(frame(3, 3, undefined, 'pop', 'shrink').scale, .35);
assert.equal(frame(.32, 3, undefined, 'pop', 'fade').scale, 1.25, 'Choosing fade exit preserves the pop entrance');
assert.equal(frame(.32, 3, undefined, 'fade', 'float-up').scale, 1, 'Choosing float exit does not add a pop entrance');
const timing = { imageEnterMs: 2000, imageHoldMs: 4000, imageExitMs: 1000, imageFeel: 'smooth' };
assert.equal(frame(1, 7, undefined, 'fade', 'fade', timing).opacity, .5);
assert.equal(frame(5.9, 7, undefined, 'fade', 'fade', timing).opacity, 1, 'Hold remains fully visible');
assert.equal(frame(6.5, 7, undefined, 'fade', 'fade', timing).opacity, .5);
assert.equal(frame(0, 2, undefined, 'none', 'none', timing).opacity, 1);
assert.equal(frame(1.9, 2, undefined, 'none', 'none', timing).opacity, 1, 'None exit has no fade/movement');
for (const [feel, peak] of [['smooth', 1.25], ['bouncy', 1.4], ['snappy', 1]]) {
  assert.ok(Math.abs(frame(feel === 'snappy' ? .7 : .66, 7, undefined, 'pop', 'fade', { ...timing, imageFeel: feel }).scale - peak) < 1e-8);
  for (let ms = 0; ms <= 7000; ms += 20) {
    const value = frame(ms / 1000, 7, undefined, 'pop', 'shrink', { ...timing, imageFeel: feel });
    assert.ok(value.opacity >= 0 && value.opacity <= 1 && value.scale > 0);
  }
}
assert.ok(frame(.5, 7, undefined, 'fade', 'fade', { ...timing, imageFeel: 'snappy' }).opacity > .99, 'Snappy is already visible while Smooth is still entering');
assert.equal(frame(6.5, 7, undefined, 'fade', 'fade', { ...timing, imageFeel: 'snappy' }).opacity, 1, 'Snappy waits then exits sharply');
for (let ms = 0; ms <= 4000; ms += 10) for (const mode of [undefined, 'pop-float', 'fade']) {
  const value = frame(ms / 1000, 3, mode);
  assert.ok(value.opacity >= 0 && value.opacity <= 1 && value.scale > 0);
}
console.log('PASS: actual server image motion defaults to pop-in/float-up, supports stationary fades and preserves final-second fade.');
