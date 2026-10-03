const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
function load(file) {
  const module = { exports: {} };
  new Function('module','exports',ts.transpileModule(fs.readFileSync(require.resolve(file),'utf8'),{ compilerOptions:{module:ts.ModuleKind.CommonJS} }).outputText)(module,module.exports);
  return module.exports;
}
const { mergeGiftFloater } = load('../utils/giftPresentation.ts');
let floats = mergeGiftFloater([], { id:'one', comboId:'combo',comboCount:1 });
floats = mergeGiftFloater(floats,{id:'two',comboId:'combo',comboCount:2});
assert.equal(floats.length,1);assert.equal(floats[0].comboCount,2);
assert.equal(mergeGiftFloater(floats,{id:'one',comboId:'combo',comboCount:1}),floats,'late response cannot decrease counter');
assert.equal(mergeGiftFloater(floats,{id:'two',comboId:'combo',comboCount:2}),floats,'socket/payment duplicate does not replay');
floats=mergeGiftFloater(floats,{id:'other',comboId:'other-combo',comboCount:1});assert.equal(floats.length,2);
const { mergeLiveChat } = load('../utils/mergeLiveChat.ts');
const original=[{id:'gift:combo',text:'Rose'},{id:'text',text:'Hello'}];
const updated=mergeLiveChat(original,[{id:'gift:combo',text:'Rose ×5'}]);
assert.equal(updated.length,2);assert.equal(updated.at(-1).text,'Rose ×5');
assert.equal(mergeLiveChat(updated,[{id:'gift:combo',text:'Rose ×5'}]),updated,'unchanged polling does not rerender');
assert.equal(mergeLiveChat(updated,[{id:'gift:combo',text:'Rose ×6'}],['gift:combo']).length,1,'deleted rows cannot be resurrected');
console.log('PASS: combo floater replacement, stale/duplicate counter protection, separate combos, same-row chat updates, stable polling and moderation removal. Native rendering remains device-pending.');
