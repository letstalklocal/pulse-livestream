const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');

const source = fs.readFileSync(require.resolve('../components/DiscoveryVideosSection.tsx'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const moduleRef = { exports: {} };
const video = { id: 'clip', ownerUid: 12, ownerName: 'Creator', thumbnailUrl: 'https://example.com/poster.jpg', playbackUrl: 'https://example.com/video.mp4' };
const requireMock = (id) => {
  if (id === 'react') return React;
  if (id === 'react-native') return native;
  if (id === '@expo/vector-icons') return { Ionicons: () => null };
  if (id === 'expo-linear-gradient') return { LinearGradient: native.View };
  if (id === 'expo-router') return { useIsFocused: () => true, useRouter: () => ({ push() {} }) };
  if (id === '@/hooks/useColors') return { useColors: () => ({ foreground: '#fff', card: '#111', border: '#222' }) };
  if (id === '@/i18n') return { useAppLanguage: () => ({ t: (key, values) => key.replace('{v0}', values?.v0 ?? '') }) };
  if (id === '@/utils/videoPrototype') return { VIDEO_PROTOTYPE_ENABLED: true, VIDEO_PROTOTYPE_SAMPLE: '' };
  if (id === '@/assets/video-prototype/portrait-poster.jpg') return { uri: 'https://example.com/sample.jpg' };
  if (id === '@/components/LivePreviewThumbnail') return { stopAllLivePreviews() {} };
  if (id === '@tanstack/react-query') return { useQuery: () => ({ data: { videos: [video] } }) };
  if (id === '@clerk/expo') return { useAuth: () => ({ userId: 'owner', getToken: async () => '' }) };
  if (id === '@/utils/creatorVideos') return { videoRequest: async () => ({ videos: [video] }) };
  if (id === './Avatar') return { Avatar: native.View };
  if (id === './VideoCardPreview') return { VideoCardPreview: native.View };
  if (id === '@workspace/api-client-react') return { getGetUserQueryKey: () => [], useGetUser: (uid) => ({ data: uid > 0 ? { user: { name: 'Creator' } } : undefined }) };
  throw new Error(`Unexpected import: ${id}`);
};
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports, require: requireMock, console });

const html = renderToStaticMarkup(React.createElement(moduleRef.exports.DiscoveryVideosSection, { viewportRef: { current: null } }));
const buttons = [...html.matchAll(/<button\b[^>]*>|<\/button>/g)].map(match => match[0]);
let depth = 0;
for (const button of buttons) {
  depth += button.startsWith('</') ? -1 : 1;
  assert.ok(depth <= 1, 'a video card button must not contain the profile button');
}
assert.equal(depth, 0);
assert.equal(buttons.length, 8, 'real and prototype cards have separate video and profile buttons');
assert.match(html, /aria-label="View Creator&#x27;s profile"/);
assert.match(html, /aria-label="View Video prototype&#x27;s profile"/);
console.log('PASS: real and prototype Discovery video/profile actions render as sibling web buttons.');
