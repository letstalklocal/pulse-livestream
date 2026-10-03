const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
runInNewContext(ts.transpileModule(readFileSync(require.resolve('../utils/dmGiftReceipt.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject });
const { parseDmGiftReceipt } = exportsObject;
const rose = { id: 'rose', name: 'Rose', emoji: '🌹', coins: 9 };
const crown = { id: 'crown', name: 'Crown', emoji: '👑', coins: 500 };
const gifts = [rose, crown];
assert.equal(parseDmGiftReceipt('🎁 🌹 Rose gift • 1 coin', gifts).coins, 1, 'activation receipt keeps historical price despite a catalog price change');
assert.equal(parseDmGiftReceipt('🎁 👑 Crown gift • 500 coins', gifts).gift, crown);
assert.equal(parseDmGiftReceipt('🎁 🌹 Rose gift • 5 coins ×5', gifts).count, 5);
assert.equal(parseDmGiftReceipt('🎁 🌹 Rose gift • 5 coins ×5', gifts).coins, 1);
assert.equal(parseDmGiftReceipt('🎁 👑 Crown gift • 2500 coins ×5', gifts).coins, 500, 'combos display the individual historical gift price');
assert.equal(parseDmGiftReceipt('🎁 🌹 Rose gift • 1 coin', gifts).count, 1);
for (const text of ['🎁 🌹 Rose gift • 5 coins ×0', '🎁 🌹 Rose gift • 5 coins ×9007199254740992']) assert.equal(parseDmGiftReceipt(text, gifts), null);
for (const text of ['🎁 hello', '🎁 🦄 Unknown gift • 5 coins', '🎁 🌹 Rose gift • -1 coins', '🎁 🌹 Rose gift • 0 coins', '🎁 🌹 Rose gift • 9007199254740992 coins', 'Quoted: 🎁 🌹 Rose gift • 1 coin', '🎁 🌹 Rose gift • 1 coin extra']) {
  assert.equal(parseDmGiftReceipt(text, gifts), null, 'unknown/malformed text remains an ordinary message');
}
console.log('PASS: existing gift receipts and Rose activation resolve artwork, preserve historical prices and leave unknown/malformed messages readable.');
