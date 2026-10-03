const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync(require.resolve('../app/dm/[peerId].tsx'), 'utf8');
const tree = ts.createSourceFile('dm.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const callbacks = {};
function walk(node) {
  if (ts.isVariableDeclaration(node) && ['finishOpening', 'positionOnOpen', 'handleInitialPositionFailed'].includes(node.name.getText(tree))) {
    callbacks[node.name.getText(tree)] = node.initializer.arguments[0].getText(tree);
  }
  ts.forEachChild(node, walk);
}
walk(tree);
function bind(expression, scope) {
  const code = ts.transpileModule(`const fn = ${expression}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(scope), code + ';return fn;')(...Object.values(scope));
}
function setup(fail) {
  let nextId = 0, visible = false, reads = 0, following, attempts = 0;
  const timers = new Map(), frames = new Map(), offsets = [];
  const scope = {
    focusedRef: { current: true }, positionedRef: { current: false },
    scrollFrameRef: { current: null }, positionTimerRef: { current: null }, positionDeadlineRef: { current: null },
    positionFailedRef: { current: false }, positionAttemptsRef: { current: 0 },
    reversedMessagesRef: { current: [{ messageId: 'new' }, { messageId: 'unread' }] }, initialTargetRef: { current: 'unread' },
    peerIdStr: '2', updateFollowingBottom: value => following = value,
    setListPositioned: value => visible = value, markRead: () => reads++,
    setTimeout: (fn, ms) => { const id = ++nextId; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => { const id = ++nextId; frames.set(id, fn); return id; },
    listRef: { current: {
      scrollToIndex: ({ index }) => { attempts++; if (fail) scope.handleInitialPositionFailed({ index, averageItemLength: 50 }); },
      scrollToOffset: value => offsets.push(value.offset),
    } },
  };
  scope.finishOpening = bind(callbacks.finishOpening, scope);
  // Bind the circular retry callback after defining forwarding functions.
  scope.positionOnOpen = () => position();
  scope.handleInitialPositionFailed = (...args) => failure(...args);
  const position = bind(callbacks.positionOnOpen, scope);
  const failure = bind(callbacks.handleInitialPositionFailed, scope);
  const flushFrames = () => {
    while (frames.size) { const [id, fn] = frames.entries().next().value; frames.delete(id); fn(); }
  };
  const fireTimer = ms => {
    const entry = [...timers].find(([, timer]) => timer.ms === ms);
    assert.ok(entry, `expected ${ms} ms timer`);
    timers.delete(entry[0]); entry[1].fn();
  };
  return { scope, position, flushFrames, fireTimer, timers, frames, offsets,
    state: () => ({ visible, reads, following, attempts }) };
}
const success = setup(false);
success.position();
const frameId = success.scope.scrollFrameRef.current;
for (let i = 0; i < 20; i++) success.position();
assert.equal(success.scope.scrollFrameRef.current, frameId, 'layout changes cannot cancel the reveal');
success.flushFrames();
assert.deepEqual(success.state(), { visible: true, reads: 1, following: false, attempts: 1 });
assert.equal(success.timers.size, 0);

const retry = setup(true);
retry.position(); retry.fireTimer(100); retry.fireTimer(100); retry.flushFrames();
assert.deepEqual(retry.state(), { visible: true, reads: 1, following: false, attempts: 3 });
assert.deepEqual(retry.offsets, [50, 50, 50], 'fallback retains approximate unread position');
assert.equal(retry.timers.size, 0);
retry.position(); assert.equal(retry.state().attempts, 3);

const deadline = setup(true);
deadline.position(); deadline.fireTimer(500); deadline.flushFrames();
assert.equal(deadline.state().visible, true); assert.equal(deadline.timers.size, 0);

const closed = setup(false);
closed.position(); closed.scope.focusedRef.current = false; closed.flushFrames();
assert.equal(closed.state().visible, false); assert.equal(closed.state().reads, 0);

const empty = setup(false);
empty.scope.reversedMessagesRef.current = [];
empty.position(); assert.equal(empty.timers.size, 0); assert.equal(empty.state().reads, 0);
empty.scope.reversedMessagesRef.current = [{ messageId: 'new' }];
empty.position(); empty.flushFrames();
assert.equal(empty.state().visible, true); assert.equal(empty.state().following, true);
console.log('PASS: unread positioning, bounded retries/deadline, reveal survives layout churn, approximate unread fallback, empty-to-loaded and blur safety. Native layout remains device-pending.');
