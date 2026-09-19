const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const componentPath = require.resolve('../components/CachedVideoPlayer.tsx');
const videoPath = path.dirname(require.resolve('expo-video/package.json'));
const corePath = path.dirname(require.resolve('expo-modules-core/package.json', { paths: [videoPath] }));
function harness() {
  let current, root, props, dirty = false, mounted = true, tree;
  const players = [], modules = new Map(), events = [];
  class NativePlayer {
    constructor(source) { this.source = source; this.released = false; this.listeners = {}; this.loads = []; this.calls = []; players.push(this); }
    assertLive() { assert.equal(this.released, false, 'cannot use a shared object that was already released'); }
    addListener(name, callback) { this.assertLive(); this.listeners[name] = callback; return { remove: () => { delete this.listeners[name]; } }; }
    replace() { this.assertLive(); }
    replaceAsync(source) { this.assertLive(); this.calls.push('load'); return new Promise((resolve, reject) => this.loads.push({ source, resolve, reject })); }
    play() { this.assertLive(); this.calls.push('play'); }
    pause() { this.assertLive(); this.calls.push('pause'); }
    release() { this.assertLive(); this.calls.push('release'); this.released = true; }
    emit(name, value) { this.listeners[name]?.(value); }
  }
  const equal = (a, b) => a && b && a.length === b.length && b.every((x, i) => Object.is(x, a[i]));
  function effect(phase, setup, deps) {
    const i = current.index++, old = current.hooks[i];
    if (!old) current.hooks[i] = { kind: phase, setup, deps, pending: true };
    else if (!equal(old.deps, deps)) Object.assign(old, { setup, deps, pending: true });
  }
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef: value => { const i = current.index++; return current.hooks[i] ??= { current: value }; },
    useState: value => { const i = current.index++, scope = current; if (!(i in scope.hooks)) scope.hooks[i] = { value: typeof value === 'function' ? value() : value };
      return [scope.hooks[i].value, next => { const before = scope.hooks[i].value; scope.hooks[i].value = typeof next === 'function' ? next(before) : next; dirty ||= !Object.is(before, scope.hooks[i].value); }]; },
    useMemo: (fn, deps) => { const i = current.index++, old = current.hooks[i]; if (!old || !equal(old.deps, deps)) current.hooks[i] = { value: fn(), deps }; return current.hooks[i].value; },
    useEffect: (fn, deps) => effect('passive', fn, deps),
    useLayoutEffect: (fn, deps) => effect('layout', fn, deps),
  };
  function load(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const mod = { exports: {} }; modules.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { module: mod, exports: mod.exports, console, Promise, require: id => {
      if (id === 'react') return react;
      if (id === 'react-native') return { StyleSheet: { create: x => x }, View: 'View' };
      if (id === 'expo-video') return { ...load(path.join(videoPath, 'src/VideoPlayer.tsx')), VideoView: 'VideoView' };
      if (id === 'expo-modules-core') return load(path.join(corePath, 'src/hooks/useReleasingSharedObject.ts'));
      if (id === './NativeVideoModule') return { VideoPlayer: NativePlayer };
      if (id === './resolveAssetSource') return () => { throw Error('Unexpected bundled asset'); };
      if (id.startsWith('./useReleasing')) return load(path.resolve(path.dirname(file), id + '.ts'));
      if (id.includes('useStreamKeepAwake')) return { useStreamKeepAwake() {} };
      throw Error(id);
    } });
    return mod.exports;
  }
  const Component = load(componentPath).default;
  function destroy(scope, phase) {
    for (const hook of scope.hooks) if (hook?.kind === phase) { hook.cleanup?.(); hook.cleanup = undefined; }
    if (scope.child) destroy(scope.child, phase);
  }
  function commit(scope, phase) {
    for (const hook of scope.hooks) if (hook?.kind === phase && hook.pending) {
      hook.cleanup?.(); hook.pending = false; hook.cleanup = hook.setup();
    }
    if (scope.child) commit(scope.child, phase);
  }
  function renderScope(scope, component, input) {
    scope.index = 0; current = scope; const result = component(input);
    // The player owns a keyed session. A new URI removes the old native view first.
    if (typeof result?.type === 'function') {
      if (scope.child && scope.child.key !== result.props.key) {
        destroy(scope.child, 'layout'); destroy(scope.child, 'passive'); scope.child = undefined;
      }
      scope.child ??= { hooks: [], key: result.props.key };
      return renderScope(scope.child, result.type, result.props);
    }
    return result;
  }
  function walk(n, visit) { if (Array.isArray(n)) return n.forEach(x => walk(x, visit)); if (!n || typeof n !== 'object') return; visit(n); walk(n.props?.children, visit); }
  function render(next = props) {
    props = next; root ??= { hooks: [] };
    for (let count = 0; ; count++) {
      assert.ok(count < 20, 'no render loop'); dirty = false;
      tree = renderScope(root, Component, props);
      walk(tree, n => { if (n.type === 'VideoView') n.props.player.assertLive(); });
      commit(root, 'layout'); commit(root, 'passive');
      if (!dirty) break;
    }
    return tree;
  }
  function unmount() { mounted = false; destroy(root, 'layout'); destroy(root, 'passive'); }
  return { render, players, events, unmount, flush: async () => { await Promise.resolve(); await Promise.resolve(); if (mounted && dirty) render(); },
    nodes: () => { const nodes = []; walk(tree, n => nodes.push(n)); return nodes; } };
}
(async () => {
  const h = harness(); let errors = 0, playing = [];
  const props = { uri: 'file:///cache/clip.mp4', onError: () => errors++, onPlayingChange: value => playing.push(value) };
  h.render(props); const first = h.players[0];
  assert.equal(first.loop, true); assert.equal(first.staysActiveInBackground, false); assert.equal(first.keepScreenOnWhilePlaying, false);
  assert.equal(first.loads[0].source.uri, props.uri); assert.equal(first.loads[0].source.useCaching, false);
  first.loads[0].resolve(); await h.flush(); assert.ok(first.calls.includes('play'));
  first.emit('playingChange', { isPlaying: true }); await h.flush(); assert.deepEqual(playing, [true]);
  // Opening/closing chat and refreshing details can provide fresh callbacks. They must not retire playback.
  for (let i = 0; i < 8; i++) h.render({ ...props, onError: () => errors += 10, onPlayingChange: value => playing.push(`latest:${value}`) });
  assert.equal(h.players.length, 1, 'ordinary UI/callback updates must keep the attached player alive');
  assert.equal(first.released, false);
  first.emit('statusChange', { status: 'error' }); assert.equal(errors, 10, 'listeners use the current callback');
  first.emit('playingChange', { isPlaying: false }); await h.flush(); assert.equal(playing.at(-1), 'latest:false');
  h.render({ ...props, muted: true }); assert.equal(h.players.length, 1); assert.equal(first.muted, true, 'mute changes do not recreate the player');
  h.render({ ...props, uri: 'file:///cache/second.mp4' });
  const second = h.players[1]; assert.ok(second && second !== first); assert.equal(first.released, true);
  assert.deepEqual(first.calls.slice(-2), ['pause', 'release'], 'pause precedes native release');
  assert.equal(h.nodes().find(n => n.type === 'VideoView').props.player, second, 'new URI never renders the retired player');
  h.unmount(); second.loads[0].resolve(); await h.flush();
  assert.ok(!second.calls.includes('play'), 'late completion cannot play a released/unmounted player');
  assert.deepEqual(second.calls.slice(-2), ['pause', 'release']);
  assert.equal(Object.keys(second.listeners).length, 0);
  const failed = harness(); let failures = 0;
  failed.render({ ...props, onError: () => failures++ }); failed.players[0].loads[0].reject(Error('decode')); await failed.flush(); assert.equal(failures, 1); failed.unmount();
  const late = harness(); late.render({ ...props, onError: () => failures++ }); late.unmount(); late.players[0].loads[0].reject(Error('cancelled')); await late.flush(); assert.equal(failures, 1);
  const paused = harness(); paused.render({ ...props, paused: true });
  const pausedPlayer = paused.players[0]; pausedPlayer.loads[0].resolve(); await paused.flush();
  assert.ok(!pausedPlayer.calls.includes('play'), 'loading a paused player cannot autoplay');
  paused.render({ ...props, paused: false }); assert.equal(pausedPlayer.calls.at(-1), 'play');
  paused.render({ ...props, paused: true }); assert.equal(pausedPlayer.calls.at(-1), 'pause');
  paused.render({ ...props, paused: false }); assert.equal(pausedPlayer.calls.at(-1), 'play');
  assert.equal(paused.players.length, 1); assert.equal(pausedPlayer.loads.length, 1, 'pause/resume retains position without reloading');
  paused.unmount();
  console.log('PASS: installed Expo lifecycle keeps playback across callback/UI/mute updates, changes URI safely, pauses before release, removes listeners and ignores late completion/errors. Native views mocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
