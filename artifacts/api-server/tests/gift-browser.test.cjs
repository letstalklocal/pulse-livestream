const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/giftBrowser.ts'), 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true},
}).outputText;
async function resolve(env, installed) {
  const module = {exports: {}};
  vm.runInNewContext(source, {module, exports: module.exports, process: {env}, require(id) {
    if (id === 'node:fs/promises') return {access: async file => {if (!installed.includes(file)) throw Error('missing: ' + file);}};
    return require(id);
  }});
  return module.exports.giftBrowserExecutable();
}
(async () => {
  const env = {NODE_ENV: 'production', PATH: '/deploy/bin:/system/bin'};
  assert.equal(await resolve(env, ['/system/bin/chromium']), '/system/bin/chromium');
  assert.equal(await resolve({...env, PULSE_CHROMIUM_EXECUTABLE: '/custom/browser'}, ['/custom/browser']), '/custom/browser');
  await assert.rejects(resolve({...env, PULSE_CHROMIUM_EXECUTABLE: '/missing'}, ['/system/bin/chromium']), /missing/);
  await assert.rejects(resolve(env, ['/repl/tools/bin/chromium']), /Live gifts require Chromium/);
  assert.equal(await resolve({...env, NODE_ENV: 'development'}, ['/repl/tools/bin/chromium']), '/repl/tools/bin/chromium');
  console.log('PASS: production PATH lookup, explicit overrides, missing-browser errors and development-only fallback');
})().catch(error => {console.error(error); process.exitCode = 1;});
