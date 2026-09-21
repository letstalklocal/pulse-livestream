const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync(require.resolve('../components/DirectVideoThumbnail.tsx'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const tick = () => new Promise(setImmediate);
function fixture(delayed = false, failure = false) {
 let state = null, mounted = false, cleanup, listener, resolveFrame;
 const calls = { generated: 0, playerReleased: 0, imageReleased: 0, stateWrites: 0, listenerRemoved: 0 };
 const image = { release: () => calls.imageReleased++ };
 const player = { status: 'idle', muted: false, release: () => calls.playerReleased++, addListener: (_, fn) => { listener = fn; return { remove: () => calls.listenerRemoved++ }; }, replaceAsync: async () => { if (failure) throw Error('offline'); player.status = 'readyToPlay'; listener({ status: 'readyToPlay' }); }, generateThumbnailsAsync: async (time, options) => { calls.generated++; assert.equal(time, 0); assert.equal(options.maxWidth, 440); return delayed ? new Promise(resolve => { resolveFrame = resolve; }) : [image]; } };
 const react = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }), useState: () => [state, v => { state = v; calls.stateWrites++; }], useEffect: fn => { if (!mounted) { mounted = true; cleanup = fn(); } } };
 const mocks = { react, 'react-native': { Platform: { OS: 'ios' }, View: 'View', StyleSheet: { absoluteFill: {} } }, 'expo-image': { Image: 'Image' }, 'expo-video': { createVideoPlayer: () => player } };
 const mod = { exports: {} }; new Function('require', 'module', 'exports', code)(id => mocks[id], mod, mod.exports);
 const render = () => mod.exports.DirectVideoThumbnail({ uri: 'private-url' });
 render();
 return { calls, render, close: () => cleanup(), resolve: () => resolveFrame([image]), player };
}
(async () => {
 const ready = fixture(); await tick();
 assert.equal(ready.calls.generated, 1, 'Ready event and source resolution do not generate twice');
 assert.equal(ready.calls.playerReleased, 1, 'Decoder releases after extracting the preview');
 assert.equal(ready.player.muted, true);
 assert.equal(ready.render().children[0].type, 'Image');
 ready.close(); assert.equal(ready.calls.imageReleased, 1);
 const late = fixture(true); await tick(); late.close(); late.resolve(); await tick();
 assert.equal(late.calls.stateWrites, 0, 'Unmounted messages ignore late frames');
 assert.equal(late.calls.imageReleased, 1, 'Late native images are released');
 assert.equal(late.calls.playerReleased, 1);
 const failed = fixture(false, true); await tick(); failed.close();
 assert.equal(failed.calls.stateWrites, 0); assert.equal(failed.calls.playerReleased, 1, 'Failed extraction frees its player');
 console.log('PASS: real video thumbnail rendering, one extraction, bounded decoder lifecycle, failed/late-frame cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
