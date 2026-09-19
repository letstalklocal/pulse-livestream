const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require.resolve('../app/video-prototype.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const state = [], refs = [];
let slot = 0, refSlot = 0, keyboard = false, focused = 0, dismissed = 0;
const react = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState: initial => { const index = slot++; if (!(index in state)) state[index] = initial;
    return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
  useRef: initial => { const index = refSlot++; return refs[index] ??= { current: initial }; },
  useEffect: () => {}, useCallback: fn => fn,
};
const rn = Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'Modal', 'ScrollView', 'StatusBar', 'Text', 'TextInput', 'TouchableOpacity', 'View'].map(x => [x, x]));
Object.assign(rn, { AppState: { currentState: 'active' }, Keyboard: { dismiss: () => dismissed++ }, Platform: { OS: 'android' }, useWindowDimensions: () => ({ width: 390, height: 844 }), StyleSheet: { create: x => x, absoluteFill: {} } });
const mod = { exports: {} };
vm.runInNewContext(code, { __DEV__: true, module: mod, exports: mod.exports, require: id => {
  if (id === 'react') return react;
  if (id === 'react-native') return rn;
  if (id === 'react-native-keyboard-controller') return { KeyboardAvoidingView: 'StreamKeyboardAvoidingView', useKeyboardState: fn => fn({ isVisible: keyboard }) };
  if (id === 'expo') return { requireOptionalNativeModule: () => null };
  if (id === 'expo-router') return { useIsFocused: () => true, useRouter: () => ({ back() {} }) };
  if (id === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 40, bottom: 34 }) };
  if (id === '@/hooks/useColors') return { useColors: () => ({}) };
  if (id === '@/i18n') return { useAppLanguage: () => ({ t: x => x, appLocale: () => 'en' }) };
  if (id === '@/context/LivePlaybackContext') return { useLivePlayback: () => ({ previewsBlocked: false }) };
  if (id === '@/utils/videoPrototype') return { VIDEO_PROTOTYPE_ENABLED: true, VIDEO_PROTOTYPE_SAMPLE: 'https://example.com/portrait.mp4' };
  if (id === '@/utils/videoCache') return { videoCache: {} };
  if (id === '@/utils/videoCache/core') return { VIDEO_CACHE_TTL_MS: 86400000 };
  return new Proxy({}, { get: (_, key) => key });
}});
function render() {
  slot = refSlot = 0;
  const tree = mod.exports.default(), nodes = [];
  function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node || typeof node !== 'object') return; nodes.push(node); walk(node.props?.children); }
  walk(tree);
  const input = nodes.find(n => n.type === 'TextInput' && n.props.placeholder === 'Type...');
  input.props.ref.current = { focus: () => focused++ };
  return { nodes, input, button: label => nodes.find(n => n.type === 'TouchableOpacity' && n.props.accessibilityLabel === label), messages: nodes.filter(n => n.props?.style?.fontSize === 13) };
}
let view = render();
assert.equal(view.button('Send').props.disabled, true);
view.input.props.onChangeText('   '); view.input.props.onSubmitEditing();
assert.equal(render().messages.length, 0);
view.input.props.onChangeText('  hello  ');
view = render(); const send = view.button('Send').props.onPress;
send(); send(); // Same closure/native event burst must not duplicate a message.
view = render(); assert.equal(view.messages.length, 1); assert.equal(view.messages[0].props.children[0], 'hello');
assert.equal(view.input.props.value, ''); assert.equal(focused, 1); assert.equal(dismissed, 0);
view.button('Follow').props.onPress(); view = render(); assert.equal(view.button('Following').props.accessibilityState.selected, true);
view.input.props.onChangeText('unsent'); keyboard = true; view = render();
assert.equal(view.input.props.value, 'unsent'); assert.equal(view.button('Following'), undefined);
assert.ok(view.nodes.some(n => n.props?.style?.paddingBottom === 0), 'no safe area gap above keyboard');
keyboard = false; view = render(); assert.equal(view.input.props.value, 'unsent'); assert.ok(view.button('Following'));
for (let i = 0; i < 110; i++) { view.input.props.onChangeText(String(i)); view.input.props.onSubmitEditing(); }
assert.equal(render().messages.length, 100, 'looping sample chat has bounded memory');
console.log('PASS: local chat trims/rejects blank, guards duplicate events, preserves focus/draft, bounds history; follow state survives keyboard changes. Device layout is not exercised.');

view = render();
const total = () => render().nodes.find(n => n.props?.testID === 'video-gift-total').props.children[0];
assert.equal(total(), '0');
const picker = view.nodes.find(n => n.type === 'GiftPicker');
picker.props.onSend({ id: 'rose', emoji: '🌹', name: 'Rose', coins: 1, size: 36 });
picker.props.onSend({ id: 'crown', emoji: '👑', name: 'Crown', coins: 500, size: 44 });
assert.equal(total(), '501', 'total sums coin values, not gift count, including consecutive sends');
assert.equal(render().nodes.find(n => n.props?.testID === 'video-viewer-count').props.children[0], '0', 'unavailable native player is not counted as a viewer');
console.log('PASS: local gift coin totals accumulate across rapid preview sends; unavailable playback is not a viewer.');
