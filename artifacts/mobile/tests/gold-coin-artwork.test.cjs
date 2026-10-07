const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (/\.(tsx?|json)$/.test(entry.name)) assert.ok(!fs.readFileSync(file, 'utf8').includes('\u{1FA99}'), `System coin emoji reintroduced: ${file}`);
  }
}
for (const directory of ['app', 'components', 'i18n']) scan(path.join(root, directory));
const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) };
function load(file, modules) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => { assert.ok(modules[id], id); return modules[id]; }, mod, mod.exports);
  return mod.exports;
}
const gold = load('components/GoldCoinIcon.tsx', { react: React,
  'react-native': { Platform: { OS: 'ios' } }, 'react-native-svg': { default: 'Svg', __esModule: true, Circle: 'Circle', Path: 'Path' },
}).GoldCoinIcon({ size: 14 });
assert.equal(gold.type, 'Svg');
assert.equal(gold.props.accessible, false);
assert.equal(gold.children[0].props.fill, '#E5A400');
assert.equal(gold.children[1].props.fill, '#FFD54A');
const Notice = load('components/GiftCoinNotice.tsx', { react: React,
  'react-native': { Text: 'Text', View: 'View', StyleSheet: { flatten: style => style } }, './GoldCoinIcon': { GoldCoinIcon: 'GoldCoinIcon' },
}).GiftCoinNotice;
for (const text of ['sent \u{1FA99} 1 coins · Rose ×5', '\u{1FA99} 4,999 coins · Blast Off']) {
  const notice = Notice({ text, style: { fontSize: 14 } });
  assert.equal(notice.type, 'View');
  assert.ok(notice.children.some(n => n?.type === 'GoldCoinIcon' && n.props.size === 14));
  assert.ok(!JSON.stringify(notice).includes('\u{1FA99}'));
  assert.ok(JSON.stringify(notice).includes(text.includes('Blast Off') ? '4,999 coins · Blast Off' : '1 coins · Rose ×5'), 'Historical unit price and count remain unchanged');
}
const userText = 'My favourite emoji is \u{1FA99}';
assert.equal(Notice({ text: userText }).children[0], userText, 'Ordinary user-authored messages remain unchanged');
console.log('PASS: no app-owned coin emoji, explicit iOS gold SVG and historical system notices rendered with gold artwork; user text preserved. Device appearance pending.');
