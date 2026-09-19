const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const root = path.resolve(__dirname, '../i18n');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'validate.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, { module: mod, exports: mod.exports, require: id => require(path.join(root, id)) });
const en = require(path.join(root, 'locales/en.json'));
for (const name of fs.readdirSync(path.join(root, 'locales'))) {
  const errors = mod.exports.validateCatalog(en, require(path.join(root, 'locales', name)));
  assert.equal(errors.length, 0, name + ': ' + errors.join(', '));
}
assert.deepEqual(require(path.join(root, 'source-strings.json')), Object.keys(en));
const screen = fs.readFileSync(path.resolve(__dirname, '../app/video-prototype.tsx'), 'utf8');
const section = fs.readFileSync(path.resolve(__dirname, '../components/DiscoveryVideosSection.tsx'), 'utf8');
for (const match of (screen + section).matchAll(/(?:\bt|setStatus|button)\('([^']+)'/g)) assert.ok(en[match[1]], match[1]);
console.log('PASS: ten complete catalogs, placeholders/protected terms, source-key parity and prototype copy coverage.');
