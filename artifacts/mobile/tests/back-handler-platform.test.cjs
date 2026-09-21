const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
for (const file of ['app/stream/[channelId].tsx', 'app/go-live.tsx', 'app/(auth)/sign-up-email.tsx']) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  function visit(node) {
    if (ts.isArrowFunction(node) && ts.isBlock(node.body) && node.body.statements.some(s => ts.isVariableStatement(s) && s.getText(ast).includes('BackHandler.addEventListener'))) effect = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(effect, `Locate listener effect in ${file}`);
  const code = ts.transpileModule(`const effect = ${effect};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const platform of ['web', 'ios', 'android']) {
    let registered = 0, removed = 0, handled = 0, handler;
    const scope = {
      Platform: { OS: platform }, isLive: true, step: 2, needsEmailVerification: false, fetchStatus: 'idle',
      BackHandler: { addEventListener: (event, callback) => { assert.equal(event, 'hardwareBackPress'); registered++; handler = callback; return { remove() { removed++; } }; } },
      leaveViewer: () => handled++, navigation: { isFocused: () => true }, showLiveMenu: false,
      setShowLiveMenu() {}, confirmStopLive: () => handled++, Keyboard: { dismiss() {} }, setStep: () => handled++,
    };
    const callback = new Function(...Object.keys(scope), code + '\nreturn effect;')(...Object.values(scope));
    const cleanup = callback();
    assert.equal(registered, platform === 'android' ? 1 : 0, `${file}: registration on ${platform}`);
    if (platform === 'android') {
      assert.equal(handler(), true);
      assert.equal(handled, 1);
      cleanup();
      assert.equal(removed, 1);
    } else assert.equal(cleanup, undefined);
  }
}
console.log('PASS: viewer, broadcaster and signup avoid BackHandler on web/iOS; Android actions and cleanup remain active.');
