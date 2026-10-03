const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
const source = fs.readFileSync(require.resolve('../app/dm/[peerId].tsx'), 'utf8');
const ast = ts.createSourceFile('dm.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function walk(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'showMessageOptions') handler = node.initializer.getText(ast); ts.forEachChild(node, walk); }
walk(ast);
const alerts = [], deleted = [], edited = [];
const scope = { messageActionPending: false, myUidStr: '1', t: text => text,
  Alert: { alert: (title, message, buttons) => alerts.push({ title, buttons }) },
  removeMessage: (message, mode) => deleted.push([message.messageId, mode]),
  setEditText: text => edited.push(text), setEditingMessage: message => edited.push(message.messageId) };
const code = ts.transpileModule(`const show = ${handler}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const show = new Function(...Object.keys(scope), code + ';return show;')(...Object.values(scope));
const own = { messageId: '42', senderId: '1', kind: 'text', text: 'Original' };
show(own);
assert.deepEqual(alerts.at(-1).buttons.map(button => button.text), ['Edit', 'Delete', 'Cancel']);
alerts.at(-1).buttons[0].onPress(); assert.deepEqual(edited, ['Original', '42']);
alerts.at(-1).buttons[1].onPress();
assert.deepEqual(alerts.at(-1).buttons.map(button => button.text), ['Delete for everyone', 'Delete for me', 'Cancel']);
alerts.at(-1).buttons[0].onPress(); alerts.at(-1).buttons[1].onPress();
assert.deepEqual(deleted, [['42', 'everyone'], ['42', 'me']]);
let translated = false;
show({ ...own, senderId: '2' }, () => translated = true);
assert.deepEqual(alerts.at(-1).buttons.map(button => button.text), ['Delete', 'Translate', 'Cancel']);
alerts.at(-1).buttons[1].onPress(); assert.ok(translated);
alerts.at(-1).buttons[0].onPress(); assert.deepEqual(alerts.at(-1).buttons.map(button => button.text), ['Delete for me', 'Cancel']);
show({ ...own, kind: 'media', text: '', price: 0 });
assert.deepEqual(alerts.at(-1).buttons.map(button => button.text), ['Delete', 'Cancel']);
const count = alerts.length;
for (const message of [{ ...own, kind: 'media', price: 5 }, { ...own, kind: 'media_pack' }, { ...own, text: '🎁 🌹 Rose gift • 1 coins' }]) show(message);
assert.equal(alerts.length, count, 'paid media, packs and gift receipts have no mutation menu');
assert.match(source, /item\.editedAt \? <>\{t\("Edited"\)\} <\/> : null\}\{new Date\(item\.ts\)\.toLocaleTimeString/);
const mediaSource = fs.readFileSync(require.resolve('../components/DirectMediaMessage.tsx'), 'utf8');
assert.match(mediaSource, /onLongPress=\{isFree \? onLongPress : undefined\}/);
console.log('PASS: own text edit/delete, default remove-for-everyone plus only-me option, incoming translation preserved, free media only and Edited before time and checks.');

// Exercise the actual message cache updater: edits must bypass the old read-only
// equality check and an older poll must not undo a completed mutation.
const contextSource = fs.readFileSync(require.resolve('../context/RtmContext.tsx'), 'utf8');
const contextAst = ts.createSourceFile('rtm.tsx', contextSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let storeInitializer, getInitializer, markReadInitializer;
function contextWalk(node) {
  if (ts.isVariableDeclaration(node)) {
    if (node.name.getText(contextAst) === 'storePersistedMessage') storeInitializer = node.initializer.getText(contextAst);
    if (node.name.getText(contextAst) === 'getMessages') getInitializer = node.initializer.getText(contextAst);
    if (node.name.getText(contextAst) === 'markRead') markReadInitializer = node.initializer.getText(contextAst);
  }
  ts.forEachChild(node, contextWalk);
}
contextWalk(contextAst);
const messageStore = {}, syncScope = { uidStr: '1', messageStore, syncedMessageIdsRef: { current: new Set() },
  EMPTY_DM_MESSAGES: [], visibleMessagesRef: { current: new Map() },
  upsertConversation: () => {}, setConversations: () => {}, setTick: () => {}, useCallback: callback => callback };
const syncCode = ts.transpileModule(`const store = ${storeInitializer}; const get = ${getInitializer};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const { store, get } = new Function(...Object.keys(syncScope), syncCode + ';return {store,get};')(...Object.values(syncScope));
const persisted = { id: '42', senderId: '2', recipientId: '1', senderName: 'Peer', recipientName: 'Me', text: 'Original', kind: 'text', ts: 1, readAt: null, editedAt: null, deletedAt: null };
store(persisted, true); assert.equal(get('2')[0].text, 'Original');
const initialMessages = get('2');
assert.equal(get('2'), initialMessages, 'repeated reads must return the same array to avoid messages/read-status render loops');
assert.equal(get('empty'), get('empty'), 'empty conversations also keep stable array identity');
store({ ...persisted, text: 'Updated', editedAt: 10 }, false);
assert.equal(get('2')[0].text, 'Updated'); assert.equal(get('2')[0].editedAt, 10);
assert.notEqual(get('2'), initialMessages, 'actual edits still publish a new message array');
store(persisted, false); assert.equal(get('2')[0].text, 'Updated', 'stale poll cannot undo an edit');
store({ ...persisted, text: '', editedAt: 10, deletedAt: 20 }, false); assert.equal(get('2').length, 0);
assert.equal(get('2'), get('2'), 'hidden-message filtering must also preserve array identity');
store({ ...persisted, text: 'Updated', editedAt: 10 }, false); assert.equal(get('2').length, 0, 'stale poll cannot resurrect a deleted message');
console.log('PASS: recipient cache receives edited text/tag, scoped tombstones hide messages and stale polls cannot revert edits or resurrect deletions.');
const readAst = ts.createSourceFile('read.ts', markReadInitializer, ts.ScriptTarget.Latest, true);
let readUpdater;
function readWalk(node) {
  if (ts.isCallExpression(node) && node.expression.getText(readAst) === 'setConversations') readUpdater = node.arguments[0].getText(readAst);
  ts.forEachChild(node, readWalk);
}
readWalk(readAst);
const readCode = ts.transpileModule(`const update = ${readUpdater}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const markReadState = new Function('peerId', readCode + ';return update;')('2');
const alreadyRead = [{ peerId: '2', unread: 0 }];
assert.equal(markReadState(alreadyRead), alreadyRead, 'read effects must not publish a new conversation array when nothing changes');
const unreadConversations = [{ peerId: '2', unread: 1 }], cleared = markReadState(unreadConversations);
assert.equal(cleared[0].unread, 0); assert.notEqual(cleared, unreadConversations); assert.equal(markReadState(cleared), cleared);
console.log('PASS: message arrays remain stable between real changes and already-read conversations produce no state update, breaking the feedback loop.');

const translatedCode = ts.transpileModule(fs.readFileSync(require.resolve('../components/TranslatedMessage.tsx'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const renderer = { exports: {} };
const react = { createElement: (type, props, ...children) => ({ type, props, children }), useState: initial => [initial, () => {}], useCallback: callback => callback };
new Function('require', 'module', 'exports', translatedCode)(id => {
  if (id === 'react') return react;
  if (id === 'react-native') return { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', useWindowDimensions: () => ({ width: 360 }) };
  if (id === '@/utils/dmBubbleLayout') {
    const layoutCode = ts.transpileModule(fs.readFileSync(require.resolve('../utils/dmBubbleLayout.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const layoutModule = { exports: {} }; new Function('module', 'exports', layoutCode)(layoutModule, layoutModule.exports); return layoutModule.exports;
  }
  if (id === '@/i18n') return { useAppLanguage: () => ({ t: value => value }) };
  if (id === 'expo-router') return { useFocusEffect: () => {} };
  if (id === '@/context/AuthContext') return { useAuth: () => ({ user: { uid: 1 } }) };
  if (id === '@/hooks/useTranslationPreferences') return { useTranslationPreferences: () => ({ language: 'en', ready: true, preferences: { consent: true, live: false, conversations: {} } }) };
  if (id === '@tanstack/react-query') return { useQuery: () => ({}) };
  return {};
}, renderer, renderer.exports);
const trailing = { type: 'Metadata', props: { text: 'Edited 12:34' } };
let longPressed = false;
const dmElement = renderer.exports.TranslatedMessage({ kind: 'dm', text: 'Hola como estas', messageId: '42', incoming: false, trailing, onLongPress: () => longPressed = true });
const layoutStates = []; let layoutCursor = 0;
react.useState = initial => {
  const index = layoutCursor++;
  if (!(index in layoutStates)) layoutStates[index] = initial;
  return [layoutStates[index], next => { layoutStates[index] = typeof next === 'function' ? next(layoutStates[index]) : next; }];
};
function renderDm() { layoutCursor = 0; return dmElement.type(dmElement.props); }
let dm = renderDm();
const measure = (lines, metadataWidth) => {
  dm.children[2].children[0].props.onTextLayout({ nativeEvent: { lines: lines.map(width => ({ width })) } });
  dm.children[2].children[1].props.onLayout({ nativeEvent: { layout: { width: metadataWidth } } });
  dm = renderDm();
};
measure([104], 120);
assert.equal(dm.props.style.width, 120, 'a wrapped short message fits its wider row instead of retaining the failed combined width');
assert.equal(dm.props.style.flexDirection, 'column');
assert.equal(dm.children[1].props.style.alignSelf, 'flex-end', 'wrapped metadata remains right aligned');
const bodyState = layoutStates[0], metadataState = layoutStates[1];
measure([104], 120);
assert.equal(layoutStates[0], bodyState); assert.equal(layoutStates[1], metadataState, 'duplicate layout events do not update state');
measure([50], 70);
assert.equal(dm.props.style.flexDirection, 'row'); assert.equal(dm.props.style.width, 125, 'short text and metadata stay inline at their combined measured width');
measure([180, 110], 70);
assert.equal(dm.props.style.flexDirection, 'column'); assert.equal(dm.props.style.width, 181, 'multiline text sizes the bubble by the widest measured line');
assert.equal(dm.type, 'Button', 'the complete DM text/metadata area owns long-press interaction');
assert.equal(dm.children[0].props.onLongPress, undefined, 'nested text cannot compete with the full message touch target');
dm.props.onLongPress(); assert.ok(longPressed, 'long-press anywhere in the message opens its options');
const live = renderer.exports.TranslatedMessage({ kind: 'live', text: 'Hello', messageId: '42', incoming: false });
assert.equal(live.props.style.flexWrap, undefined, 'live text retains its prior layout');
console.log('PASS: compact wrapped/inline/multiline DM widths, no-op measurement updates, right alignment, long-press options and unchanged live rendering. Native font measurement remains device-pending.');
