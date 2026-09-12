const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
runInNewContext(ts.transpileModule(readFileSync(`${__dirname}/../utils/backgroundCrop.ts`, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsObject });
const { backgroundCropRect: crop } = exportsObject;

test('a square photo produces the full-height centered portrait crop', () => {
  assert.deepEqual({ ...crop({ width: 1600, height: 1600 }, 225, { x: 87.5, y: 0, zoomScale: 1 }) },
    { originX: 350, originY: 0, width: 900, height: 1600 });
});

test('an existing 9:16 photo retains its entire frame', () => {
  assert.deepEqual({ ...crop({ width: 1080, height: 1920 }, 270, { x: 0, y: 0, zoomScale: 1 }) },
    { originX: 0, originY: 0, width: 1080, height: 1920 });
});

test('pinching and dragging select the visible source pixels', () => {
  assert.deepEqual({ ...crop({ width: 1600, height: 1600 }, 225, { x: 200, y: 100, zoomScale: 2 }) },
    { originX: 400, originY: 200, width: 450, height: 800 });
});

test('portrait, landscape, odd-sized and small images stay 9:16 and within bounds at all zoom levels', () => {
  for (const [width, height] of [[4032, 3024], [3024, 4032], [1000, 4000], [1537, 2049], [90, 160]]) {
    for (const zoomScale of [1, 1.3, 2, 4]) {
      for (const offset of [-500, 0, 173.4, 100000]) {
        const rect = crop({ width, height }, 281.5, { x: offset, y: offset, zoomScale });
        assert.equal(rect.width * 16, rect.height * 9);
        assert.ok(rect.width > 0 && rect.height > 0);
        assert.ok(rect.originX >= 0 && rect.originY >= 0);
        assert.ok(rect.originX + rect.width <= width && rect.originY + rect.height <= height);
        assert.ok(Object.values(rect).every(Number.isInteger));
      }
    }
  }
});

test('invalid or unusably small images cannot be cropped and uploaded', () => {
  for (const width of [0, NaN, Infinity, -1, 1]) {
    assert.throws(() => crop({ width, height: 100 }, 225, { x: 0, y: 0, zoomScale: 1 }));
  }
});
