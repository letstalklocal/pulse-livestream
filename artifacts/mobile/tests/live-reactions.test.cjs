const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require.resolve('../components/LiveReactions.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const slots = [], timers = new Map(), sent = []; let cursor = 0, timerId = 0, socketOptions;
const react = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }), Fragment: 'Fragment',
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
  useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
  useImperativeHandle(ref, create) { if (ref) ref.current = create(); },
  useCallback(fn) { cursor++; return fn; },
  useEffect(fn) { const i = cursor++; if (!(i in slots)) slots[i] = { cleanup: fn() }; },
};
const emojiApi = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../utils/reactionEmoji.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: emojiApi });
const api = {};
vm.runInNewContext(code, { exports: api, setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id), require(name) {
  if (name === '@/utils/reactionEmoji') return emojiApi;
  if (name === 'react') return react;
  if (name === 'react-native') return { AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove() {} }) }, StyleSheet: { create: value => value }, View: 'View', Pressable: 'Pressable', Text: 'Text' };
  if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (name === '@/hooks/useStreamSocket') return { useStreamSocket: options => { socketOptions = options; return payload => { sent.push(payload); return true; }; } };
  if (name === '@/i18n') return { t: (key, values) => key.replace('{v0}', values?.v0 ?? '') };
  throw Error(name);
} });
const reactionRef = { current: null };
let canSend = true;
let selectedEmoji = '❤️';
const render = () => { cursor = 0; return api.LiveReactions({ channelId: 'demo', canSend, selectedEmoji, ref: reactionRef }); };
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...tree.children.flatMap(nodes)]; }
const button = (tree, label) => nodes(tree).find(n => n.type === 'Pressable' && n.props.accessibilityLabel === label);
const floaters = tree => nodes(tree).filter(n => typeof n.type === 'function').length;
const tick = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); };
let tree = render(); assert.equal(button(tree, 'Send reaction ❤️').props.disabled, true);
reactionRef.current.sendReaction(); assert.equal(floaters(render()), 0, 'Screen taps wait for subscription access');
socketOptions.onMessage({ data: JSON.stringify({ type: 'reactions_ready' }) }); tree = render();
assert.equal(button(tree, 'Choose reaction'), undefined, 'Chooser lives in the menu, not the floating control');
selectedEmoji = '🔥'; tree = render(); button(tree, 'Send reaction 🔥').props.onPress(); tree = render();
assert.equal(floaters(tree), 1, 'Immediate local feedback');
for (let i=0; i<3; i++) reactionRef.current.sendReaction();
tick(); assert.equal(sent.length, 1); assert.equal(sent[0].count, 4, 'Rapid taps batch together');
tree = render(); for (let i=0; i<50; i++) button(tree, 'Send reaction 🔥').props.onPress(); tree = render();
assert.equal(floaters(tree), 36, 'Animation population bounded under rapid tapping'); tick(); assert.equal(sent[1].count, 8, 'Network burst bounded');
socketOptions.onMessage({ data: JSON.stringify({ type: 'reaction', emoji: 'invalid', count: 8 }) }); assert.equal(floaters(render()), 36);
button(tree, 'Send reaction 🔥').props.onPress(); socketOptions.onDisconnect(); tick(); assert.equal(sent.length, 2, 'Disconnect clears pending taps'); tree = render(); assert.equal(button(tree, 'Send reaction 🔥').props.disabled, true);
reactionRef.current.sendReaction(); tick(); assert.equal(sent.length, 2, 'Disconnected screen taps do not queue');
socketOptions.onMessage({ data: JSON.stringify({ type: 'reactions_ready' }) });
canSend = false; render(); reactionRef.current.sendReaction(); tick(); assert.equal(sent.length, 2, 'Receive-only hosts cannot send through the handle');
canSend = true; tree = render(); button(tree, 'Send reaction 🔥').props.onPress();
slots.forEach(slot => slot?.cleanup?.()); tick(); assert.equal(sent.length, 2, 'Unmount cancels pending network batch');
console.log('PASS: emoji choice, immediate feedback, fast-tap batching, animation/network bounds, malformed input, disconnect and unmount cleanup.');
