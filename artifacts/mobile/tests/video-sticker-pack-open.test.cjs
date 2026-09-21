const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const compile = path => ts.transpileModule(fs.readFileSync(require.resolve(path), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
async function scenario(allowed) {
  const urls = [], writes = [], alerts = [], state = [];
  let cursor = 0, paused = 0, resumed = 0;
  const api = { exports: {} };
  vm.runInNewContext(compile('../utils/liveStickers.ts'), {
    module: api, exports: api.exports, AbortController, setTimeout, clearTimeout,
    process: { env: { EXPO_PUBLIC_DOMAIN: 'api.test' } },
    fetch: async (url, init) => {
      urls.push(url);
      assert.equal(init.headers.Authorization, 'Bearer test-token');
      return { ok: true, json: async () => ({ pack: { unlocked: allowed, isOwner: false, items: [{ id: 'image', mediaType: 'image', mediaUrl: 'authorized-media' }] } }) };
    },
  });
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: value => { const i = cursor++; if (!(i in state)) state[i] = value; return [state[i], next => { state[i] = next; }]; },
    useRef: value => { const i = cursor++; return state[i] ??= { current: value }; }, useEffect: () => {},
  };
  const mod = { exports: {} };
  vm.runInNewContext(compile('../components/VideoStickerOverlay.tsx'), {
    module: mod, exports: mod.exports,
    require: id => {
      if (id === 'react') return react;
      if (id === 'react-native') return { View: 'View', Alert: { alert: (...args) => alerts.push(args) }, StyleSheet: { create: x => x } };
      if (id === '@clerk/expo') return { useAuth: () => ({ getToken: async () => 'test-token' }) };
      if (id === '@/context/AuthContext') return { useAuth: () => ({ user: { uid: 1 } }) };
      if (id === '@/i18n') return { useAppLanguage: () => ({ t: x => x }) };
      if (id === '@react-native-async-storage/async-storage') return { getItem: async () => null, setItem: async (...args) => writes.push(args) };
      if (id === 'expo-crypto') return { randomUUID: () => 'request' };
      if (id === '@/utils/liveStickers') return api.exports;
      if (id === '@/utils/creatorVideos') return { videoRequest: () => assert.fail('Owned packs must use the shared pack endpoint, without purchasing') };
      if (id === '@tanstack/react-query') return {
        useQueryClient: () => ({ invalidateQueries: async () => {} }),
        useQuery: ({ queryKey }) => queryKey[0] === 'video-stickers'
          ? { data: { stickers: [{ id: 'offer', kind: 'pack', packId: 7, owned: true }] } }
          : { data: [], isSuccess: true },
      };
      if (id === './LiveStickerCard') return { LiveStickerCard: 'Card' };
      if (id === './MediaPackGallery') return { MediaPackGallery: 'Gallery' };
      if (id === './GiftPicker') return { GIFTS: [] };
      if (id === '@workspace/api-client-react') return {};
      throw Error(id);
    },
  });
  const walk = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.children)];
  const render = () => { cursor = 0; return walk(mod.exports.VideoStickerOverlay({ videoId: 'video', visible: true, top: 0, isHost: false, onGift() {}, onPause: () => paused++, onResume: () => resumed++ })); };
  render().find(n => n.type === 'Card').props.onPress();
  await new Promise(setImmediate);
  assert.deepEqual(urls, ['https://api.test/api/media-packs/7']);
  const gallery = render().find(n => n.type === 'Gallery');
  if (allowed) {
    assert.ok(gallery); assert.equal(paused, 1); assert.equal(writes.length, 1);
    gallery.props.onClose(); assert.equal(resumed, 1); assert.equal(alerts.length, 0);
  } else { assert.equal(gallery, undefined); assert.equal(paused, 0); assert.equal(writes.length, 0); assert.equal(alerts.length, 1); }
}
(async () => { await scenario(true); await scenario(false); console.log('PASS: video View pack uses the real shared API path/auth, opens without repurchasing, pauses/resumes and preserves sticker on denied access.'); })().catch(e => { console.error(e); process.exitCode = 1; });
