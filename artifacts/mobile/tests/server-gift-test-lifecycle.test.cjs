const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const tick = () => new Promise(setImmediate);
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...(n.children ?? []).flatMap(nodes)];
function fixture() {
  const slots = [], effects = [], timers = new Map(), calls = [], usedTokens = [];
  let cursor = 0, dirty = false, sequence = 0, version = 0, tree, readyCallback, background;
  const f = { ready: false, joins: 0, disposals: 0, closed: 0, noToken: false };
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }]; },
    useCallback(fn, deps) { const i = cursor++; if (!equal(slots[i]?.deps, deps)) slots[i] = { deps, fn }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!equal(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const mocks = {
    react,
    'react-native': { ActivityIndicator: 'Spinner', Modal: 'Modal', Text: 'Text', View: 'View', TouchableOpacity: 'Button', StyleSheet: { create: x => x },
      AppState: { addEventListener: (_e, fn) => { background = fn; return { remove() {} }; } } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/hooks/useStreamKeepAwake': { useStreamKeepAwake() {} },
    '@/utils/agora': { RtcTextureViewComponent: 'Video', VideoSourceType: { VideoSourceRemote: 1 } },
    '@/utils/liveStickers': { stickerApi: async (path, getToken, method = 'GET') => {
      const token = await getToken(); usedTokens.push(token); if (!token) throw Error('Sign in to continue');
      calls.push({ path, method });
      if (path.endsWith('/start')) return { id: 'session' };
      if (path.endsWith('/play')) return { durationMs: 5000 };
      return { ready: f.ready, expiresAt: Date.now() + 180000, durationMs: 5000, token: 'rtc', channelName: 'output', uid: 1, publisherUid: 2 };
    } },
    '@/utils/compositorTestConnection': { openCompositorTest: (_lease, _config, ready) => {
      f.joins++; readyCallback = ready; return { connection: { channelId: 'output', localUid: 1 }, close: () => f.disposals++ };
    } },
  };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('artifacts/mobile/components/ServerGiftTest.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { module: mod, exports: mod.exports, Error, require: name => { if (!(name in mocks)) throw Error(name); return mocks[name]; },
    setTimeout: (fn, ms) => { timers.set(++sequence, { fn, ms }); return sequence; }, clearTimeout: id => timers.delete(id) });
  f.render = () => {
    let count = 0;
    do {
      assert.ok(++count < 20, 'No effect/render loop'); dirty = false; cursor = 0;
      const current = ++version;
      tree = mod.exports.ServerGiftTest({ channelId: 'pulse-talk-demo', hostUid: 0,
        getToken: async () => f.noToken ? null : `token-${current}`, getLease: () => ({ isCurrent: () => true }), onClose: () => f.closed++ });
      while (effects.length) effects.shift()();
    } while (dirty);
    return tree;
  };
  f.poll = async () => { for (const [id, t] of [...timers]) if (t.ms === 2000) { timers.delete(id); t.fn(); } await tick(); f.render(); };
  f.unmount = () => { for (const s of slots) s?.cleanup?.(); };
  f.firstFrame = () => readyCallback();
  f.background = () => background('background');
  f.calls = calls; f.tokens = usedTokens;
  return f;
}
(async () => {
  const f = fixture(); f.render(); await tick(); f.render();
  for (let i = 0; i < 12; i++) { f.render(); await tick(); }
  assert.equal(f.calls.filter(c => c.path.endsWith('/start')).length, 1, 'Refreshed Clerk wrappers must not restart worker');
  assert.equal(f.calls.filter(c => c.method === 'DELETE').length, 0, 'Renders must not delete the active test');
  f.ready = true; await f.poll(); assert.equal(f.joins, 1);
  assert.notEqual(f.tokens.at(-1), f.tokens[0], 'Poll uses the latest token getter, not a stale closure');
  f.firstFrame(); const tree = f.render();
  const play = nodes(tree).find(n => n.type === 'Button' && nodes(n).some(x => x.children?.includes('Play Mummy · free test')));
  assert.equal(play.props.disabled, false); play.props.onPress(); await tick(); f.render();
  assert.equal(f.calls.filter(c => c.path.endsWith('/play')).length, 1);
  f.background(); await tick(); f.unmount();
  assert.equal(f.disposals, 1); assert.equal(f.closed, 1);
  assert.equal(f.calls.filter(c => c.method === 'DELETE').length, 1);
  const unauth = fixture(); unauth.noToken = true; unauth.render(); await tick();
  const failed = unauth.render(); assert.equal(nodes(failed).filter(n => n.type === 'Spinner').length, 0);
  assert.ok(nodes(failed).some(n => n.children?.includes('Sign in to continue')));
  unauth.unmount();
  console.log('PASS: changing token/lease wrappers do not restart or delete a test; latest credentials, first frame/play, background cleanup and no spinner after auth failure. Mocked React/native APIs.');
})().catch(e => { console.error(e); process.exitCode = 1; });
