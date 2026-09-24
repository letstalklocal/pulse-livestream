const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(require.resolve('../utils/viewerAwake.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleExports = {};
vm.runInNewContext(code, { exports: moduleExports });
const keepAwake = moduleExports.shouldKeepViewerAwake;
const watching = {
  pathname: '/stream/room', channelId: 'room',
  canEnterStream: true, playbackChannelId: 'room', playbackCanEnterStream: true, requiresAdmission: false,
  accessRestricted: false, streamEnded: false, playbackEnded: false,
};

assert.equal(keepAwake(watching), true, 'Focused admitted viewer keeps the display awake');
assert.equal(keepAwake({ ...watching, canEnterStream: false }), true, 'Admitted playback survives a detail refetch');
assert.equal(keepAwake({ ...watching, canEnterStream: false, playbackCanEnterStream: false }), true, 'Current regular viewer stays awake while loading or reconnecting');
assert.equal(keepAwake({ ...watching, canEnterStream: false, playbackChannelId: 'other' }), false, 'Another stream cannot keep this viewer awake');
assert.equal(keepAwake({ ...watching, pathname: '/profile/9' }), false, 'Covered viewer route releases its lock');
assert.equal(keepAwake({ ...watching, canEnterStream: false, playbackCanEnterStream: false, requiresAdmission: true }), false, 'Premium admission page does not hold a lock');
assert.equal(keepAwake({ ...watching, accessRestricted: true }), false, 'Removed viewer releases its lock');
assert.equal(keepAwake({ ...watching, streamEnded: true }), false, 'Ended viewer screen releases its lock');
assert.equal(keepAwake({ ...watching, playbackEnded: true }), false, 'Ended playback releases its lock');
console.log('PASS: viewer awake gating retains an active route/admitted playback and releases covered, blocked, admission and ended views.');
