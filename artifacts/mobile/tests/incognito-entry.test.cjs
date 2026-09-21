const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const screen = fs.readFileSync(require.resolve('../app/stream/[channelId].tsx'), 'utf8');
const playback = fs.readFileSync(require.resolve('../context/LivePlaybackContext.tsx'), 'utf8');
function evaluate(source, name, scope) {
  const expression = source.match(new RegExp(`const ${name} = ([^;]+);`))[1];
  const js = ts.transpileModule(`return (${expression});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(scope), js)(...Object.values(scope));
}
for (const chosen of [false, true]) {
  const stream = { requiredGift: {}, viewerAdmitted: true, viewerIncognitoChosen: chosen };
  const scope = { channelId: 'premium', admitted: false, stream, playback: { channelId: 'premium', session: { admitted: false } } };
  assert.equal(evaluate(screen, 'hasAdmission', scope), chosen, 'Free-entry viewers must choose identity before joining');
  assert.equal(evaluate(playback, 'canEnterStream', { channelId: 'premium', ended: false, accessRestricted: false, isDemo: false, stream, session: { admitted: false } }), chosen, 'Playback and screen must agree');
}
assert.equal(evaluate(screen, 'hasAdmission', { channelId: 'premium', admitted: false, stream: { viewerAdmitted: true, viewerIncognitoChosen: false }, playback: { channelId: 'premium', session: { admitted: true } } }), true, 'Confirmed entry must survive stale polling and PiP transitions');
assert.equal(evaluate(playback, 'canEnterStream', { channelId: 'public', ended: false, accessRestricted: false, isDemo: false, stream: {}, session: {} }), true, 'Public streams keep their existing entry behavior');
console.log('PASS: Premium free-entry identity gate, shared playback gate, admitted PiP continuity and public entry.');
