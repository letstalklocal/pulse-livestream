const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const compile = path => ts.transpileModule(fs.readFileSync(require.resolve(path), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;

const routes = [], writes = [], state = [];
let cursor = 0;
const react = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: value => { const i = cursor++; if (!(i in state)) state[i] = value; return [state[i], next => { state[i] = next; }]; },
  useRef: value => { const i = cursor++; return state[i] ??= { current: value }; },
};
const mod = { exports: {} };
vm.runInNewContext(compile('../components/VideoStickerOverlay.tsx'), {
  module: mod, exports: mod.exports,
  require: id => {
    if (id === 'react') return react;
    if (id === 'react-native') return { View: 'View', Alert: { alert: () => assert.fail('Owned View pack must navigate without an alert') }, StyleSheet: { create: x => x } };
    if (id === '@clerk/expo') return { useAuth: () => ({ getToken: async () => 'test-token' }) };
    if (id === 'expo-router') return { useRouter: () => ({ push: route => routes.push(route) }) };
    if (id === '@/context/AuthContext') return { useAuth: () => ({ user: { uid: 1 } }) };
    if (id === '@/i18n') return { useAppLanguage: () => ({ t: x => x }) };
    if (id === '@react-native-async-storage/async-storage') return { getItem: async () => null, setItem: async (...args) => writes.push(args) };
    if (id === 'expo-crypto') return { randomUUID: () => 'request' };
    if (id === '@/utils/creatorVideos') return { videoRequest: () => assert.fail('Owned View pack must not fetch media or purchase again') };
    if (id === '@tanstack/react-query') return {
      useQueryClient: () => ({ invalidateQueries: async () => {} }),
      useQuery: ({ queryKey }) => queryKey[0] === 'video-stickers'
        ? { data: { stickers: [{ id: 'offer', kind: 'pack', packId: 7, owned: true }] } }
        : { data: [], isSuccess: true },
    };
    if (id === './LiveStickerCard') return { LiveStickerCard: 'Card' };
    if (id === './GiftPicker') return { GIFTS: [] };
    if (id === '@workspace/api-client-react') return {};
    throw Error(id);
  },
});
const walk = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.children)];
const render = () => { cursor = 0; return walk(mod.exports.VideoStickerOverlay({ videoId: 'video', ownerUid: 2, ownerName: 'Creator', visible: true, top: 0, isHost: false, onGift() {} })); };
(async () => {
  render().find(n => n.type === 'Card').props.onPress();
  await new Promise(setImmediate);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].pathname, '/dm/[peerId]');
  assert.equal(routes[0].params.peerId, '2');
  assert.equal(routes[0].params.peerName, 'Creator');
  assert.equal(writes.length, 1, 'View pack retains the existing per-video dismissal');
  assert.ok(!render().some(n => n.type === 'Gallery'), 'View pack never opens a gallery over the video');
  console.log('PASS: video View pack opens its receipt DM without repurchasing or loading protected media.');
})().catch(e => { console.error(e); process.exitCode = 1; });
