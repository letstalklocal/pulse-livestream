const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...(n.children ?? []).flatMap(nodes)];
const react = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) };
const base = { React: react, View: 'View', Text: 'Text', TouchableOpacity: 'Button', Ionicons: 'Icon', StyleSheet: { absoluteFill: {} }, styles: {}, localizedTextStyle() {}, t: (x, v) => v ? x.replace('{v0}', v.v0) : x };
function find(file, match) {
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function walk(node) { if (!found && match(node, ast)) found = node; ts.forEachChild(node, walk); }
  walk(ast); assert.ok(found); return found.getText(ast);
}
function render(expression, scope) {
  const all = { ...base, ...scope };
  const code = ts.transpileModule(`function render() { return (${expression}); }`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(all), code + '\nreturn render();')(...Object.values(all));
}
const hostFile = require.resolve('../app/go-live.tsx'), viewerFile = require.resolve('../app/stream/[channelId].tsx');
const controls = find(hostFile, (n, ast) => ts.isConditionalExpression(n) && n.condition.getText(ast) === 'isPaused && !showChat');
let resumed = 0, ended = 0;
const controlScope = { isPaused: true, showChat: false, pauseBusy: false, premiumConnecting: false, togglePause: () => resumed++, confirmStopLive: () => ended++ };
let tree = render(controls, controlScope);
const resume = nodes(tree).find(n => n.props.testID === 'paused-live-resume');
const end = nodes(tree).find(n => n.props.testID === 'paused-live-end');
assert.ok(resume && end, 'Paused host has central resume/end controls');
resume.props.onPress(); end.props.onPress(); assert.equal(resumed, 1); assert.equal(ended, 1, 'End uses the existing confirmation handler');
assert.equal(render(controls, { ...controlScope, isPaused: false }), null);
assert.equal(nodes(render(controls, { ...controlScope, pauseBusy: true })).find(n => n.props.testID === 'paused-live-resume').props.disabled, true);
const hostLabel = find(hostFile, (n, ast) => ts.isJsxElement(n) && n.openingElement.tagName.getText(ast) === 'Text' && n.openingElement.attributes.getText(ast).includes('styles.liveBadgeText'));
for (const [privateLive, premium, expected] of [[true, false, '1:1 Private'], [true, true, '1:1 Private'], [false, true, 'PREMIUM'], [false, false, 'LIVE']]) {
  const badge = render(hostLabel, { isPrivateInvite: privateLive, isPremium: premium, liveStreamData: { stream: {} } });
  assert.ok(nodes(badge).some(n => n.children.includes(expected)));
}
const viewerHeader = find(viewerFile, (n, ast) => ts.isJsxElement(n) && n.openingElement.attributes.getText(ast) === 'style={styles.streamMeta}');
const headerScope = { isPrivateStream: true, requiresAdmission: false, streamEnded: false, displayHostName: 'Creator' };
tree = render(viewerHeader, headerScope);
assert.ok(nodes(tree).some(n => n.props.testID === 'viewer-private-badge'));
assert.ok(nodes(tree).some(n => n.children.includes('1:1 Private')));
assert.ok(!nodes(tree).some(n => n.children.includes('Creator')), 'Private tag replaces the streamer name');
tree = render(viewerHeader, { ...headerScope, isPrivateStream: false, requiresAdmission: true });
assert.ok(nodes(tree).some(n => n.props.testID === 'viewer-premium-badge'));
tree = render(viewerHeader, { ...headerScope, isPrivateStream: false });
assert.ok(nodes(tree).some(n => n.children.includes('Creator')), 'Regular host name remains');
const endedScreen = find(viewerFile, (n, ast) => ts.isReturnStatement(n) && n.expression?.getText(ast).includes('testID="ended-stream-discover"'));
// The return node is found before children; evaluate its JSX expression only.
const jsx = endedScreen.replace(/^return\s*/, '').replace(/;$/, '');
const actions = [];
tree = render(jsx, { countdown: 10, isPrivateStream: false, playback: { close: () => actions.push('close') }, router: { back: () => actions.push('back'), dismissTo: path => actions.push(path) } });
nodes(tree).find(n => n.props.testID === 'ended-stream-discover').props.onPress();
assert.deepEqual(actions, ['close', '/(tabs)'], 'Discover exits immediately while ten seconds remain');
actions.length = 0; nodes(tree).find(n => n.props.testID === 'ended-stream-close').props.onPress();
assert.deepEqual(actions, ['close', 'back'], 'Close returns immediately to the preceding page');
const labels = {};
new Function('exports', ts.transpileModule(fs.readFileSync(require.resolve('../utils/privateLiveLabels.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(labels);
assert.equal(labels.formatPrivateLiveTitle('Private live with Alice', base.t), '1:1 Private with Alice');
assert.equal(labels.formatPrivateLiveTitle('Private live', base.t), '1:1 Private');
assert.equal(labels.formatPrivateLiveTitle('Custom concert title', base.t), 'Custom concert title');
console.log('PASS: central paused-host controls/disabled resume, confirmed end action, private/Premium/regular header labels, immediate countdown exits and historic/custom invitation titles. Mocked elements, not device layout.');
