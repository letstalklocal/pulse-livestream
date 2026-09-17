const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require.resolve('../components/LivePreviewThumbnail.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
let blocked = true, creates = 0, joins = 0, releases = 0, cleanup, tokenResolve;
const api = {};
vm.runInNewContext(code, { exports: api, console, process: { env: { EXPO_PUBLIC_AGORA_APP_ID: 'test' } }, setTimeout, clearTimeout,
  require(name) {
    if (name === 'react') return { createElement: () => null, useEffect: fn => { cleanup = fn(); }, useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }) };
    if (name === 'react-native') return { Platform: { OS: 'android' }, StyleSheet: { create: value => value }, View: 'View' };
    if (name === '@/context/LivePlaybackContext') return { useLivePlayback: () => ({ previewsBlocked: blocked }) };
    if (name === '@/utils/agoraState') return { isBroadcasting: () => false };
    if (name === '@workspace/api-client-react') return { useGenerateAgoraToken: () => ({ mutateAsync: () => new Promise(resolve => { tokenResolve = resolve; }) }) };
    if (name === '@/utils/agora') return { RtcTextureViewComponent: 'Video', ChannelProfileType: { ChannelProfileLiveBroadcasting: 1 }, ClientRoleType: { ClientRoleAudience: 2 }, createEngine: () => {
      creates++;
      return { initialize: () => 0, enableVideo: () => 0, registerEventHandler() {}, unregisterEventHandler() {}, leaveChannel() {}, release: () => releases++, joinChannel: () => { joins++; return 0; } };
    } };
    throw Error(name);
  },
});
(async () => {
  const render = () => api.LivePreviewThumbnail({ channelId: 'room', hostUid: 9, isVisible: true });
  render(); assert.equal(creates, 0, 'A visible feed card must not initialize Agora while PiP owns it');
  blocked = false; render(); assert.equal(creates, 1);
  cleanup(); blocked = true; render(); assert.equal(releases, 1);
  tokenResolve({ token: 'old', channelName: 'room', uid: 0 });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(joins, 0, 'A stopped preview token cannot join over the full/floating viewer');
  api.stopAllLivePreviews(); assert.equal(releases, 1, 'A stale preview cleanup cannot release the new viewer');
  console.log('PASS: PiP blocks feed engines; stopped preview tokens and stale cleanup cannot take over/release viewer media.');
})().catch(error => { console.error(error); process.exitCode = 1; });
