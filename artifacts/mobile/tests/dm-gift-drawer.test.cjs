const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync(require.resolve('../app/dm/[peerId].tsx'), 'utf8');
const ast = ts.createSourceFile('dm.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects = [], variables = new Map();
function walk(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') effects.push(node.arguments[0].getText(ast));
  if (ts.isVariableDeclaration(node) && node.initializer) variables.set(node.name.getText(ast), node.initializer.getText(ast));
  ts.forEachChild(node, walk);
}
walk(ast);
function bind(expression, scope) {
  const code = ts.transpileModule(`const callback = ${expression}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(scope), code + '; return callback;')(...Object.values(scope));
}
// Run the actual layout-animation effect for opening, closing and reduced motion.
const animationEffect = effects.find(effect => effect.includes('Animated.timing(giftMessageClearance'));
for (const [visible, reduceMotion, composerHeight, blocked, target, duration] of [[true, false, 60, false, 200, 220], [false, false, 60, false, 0, 220], [true, true, 60, false, 200, 0], [true, false, 300, false, 0, 220], [true, false, 60, true, 0, 220]]) {
  let options, started = false, stopped = false;
  const cleanup = bind(animationEffect, {
    showGiftPicker: visible, contactBlocked: blocked, composerHeight, reduceMotion, giftDrawerHeight: 260, giftMessageClearance: {},
    Easing: { cubic: 'cubic', out: x => x },
    Animated: { timing: (_, config) => { options = config; return { start: () => started = true, stop: () => stopped = true }; } },
  })();
  assert.equal(options.toValue, target); assert.equal(options.duration, duration);
  assert.equal(options.useNativeDriver, false, 'drawer animation must resize the message viewport');
  assert.ok(started); cleanup(); assert.ok(stopped);
}
// Gift receipts should follow the bottom only if the user is already there.
const messageEffect = effects.find(effect => effect.includes('const hasNewMessage'));
for (const [text, nearBottom, shouldFollow] of [['🎁 🌹 Rose gift • 1 coins', false, false], ['🎁 🌹 Rose gift • 1 coins', true, true], ['hello', false, true]]) {
  let followed = false, scrolled = false;
  bind(messageEffect, { focusedRef: { current: true }, positionedRef: { current: true }, latestMessageRef: { current: 'old' },
    messages: [{ messageId: 'new', senderId: '1', text }], myUidStr: '1', peerIdStr: '2', isNearBottomRef: { current: nearBottom },
    parseDmGiftReceipt: text => text.startsWith('🎁') ? {} : null, GIFTS: [],
    updateFollowingBottom: () => followed = true, keepAtBottom: () => scrolled = true, markRead: () => {} })();
  assert.equal(followed, shouldFollow); assert.equal(scrolled, shouldFollow);
}
// User explicitly required the keyboard/composer behavior to remain unchanged.
const baseline = require('node:child_process').execFileSync('git', ['show', 'HEAD:artifacts/mobile/app/dm/[peerId].tsx'], { encoding: 'utf8' });
function keyboardSignature(text) {
  const tree = ts.createSourceFile('dm.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), result = [];
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'Modal' && node.openingElement.attributes.properties.some(prop => prop.name?.getText(tree) === 'testID' && prop.initializer?.text === 'dm-edit-message')) return;
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'TextInput') result.push(node.getText(tree));
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(tree) === 'KeyboardAvoidingView') result.push(node.getText(tree));
    if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'onReply') result.push(node.getText(tree));
    if (ts.isVariableDeclaration(node) && ['keyboardVisible', 'composerBottomInset'].some(name => node.name.getText(tree).includes(name))) result.push(node.getText(tree));
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect' && node.arguments[0].getText(tree).includes('Keyboard.addListener')) result.push(node.getText(tree));
    ts.forEachChild(node, visit);
  }
  visit(tree); return result;
}
assert.deepEqual(keyboardSignature(source), keyboardSignature(baseline), 'keyboard listeners, avoidance, input and reply focus remain exactly as before');
console.log('PASS: messages-only measured clearance, close/blocked restoration, reduced motion, reading-position preservation and unchanged keyboard/composer behavior. Native layout remains device-pending.');
