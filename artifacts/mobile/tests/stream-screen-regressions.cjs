const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const root = resolve(__dirname, '../../..');
const tests = [
  'artifacts/mobile/tests/live-preview-pip.test.cjs',
  'artifacts/mobile/tests/live-picture-in-picture.test.cjs',
  'artifacts/mobile/tests/live-picture-in-picture-ui.test.cjs',
  'artifacts/mobile/tests/reaction-favorites.test.cjs',
  'artifacts/mobile/tests/reaction-chooser.test.cjs',
  'artifacts/mobile/tests/reaction-emoji.test.cjs',
  'artifacts/mobile/tests/live-reactions.test.cjs',
  'artifacts/api-server/tests/live-reactions.test.cjs',
  'artifacts/mobile/tests/stream-awake-lease.test.cjs',
  'artifacts/mobile/tests/idle-auto-close.test.cjs',
  'artifacts/mobile/tests/live-viewer-list.test.cjs',
  'artifacts/mobile/tests/live-viewers-sheet.test.cjs',
  'artifacts/mobile/tests/go-live-request-timeout.test.cjs',
  'artifacts/mobile/tests/go-live-startup.test.cjs',
  'artifacts/mobile/tests/confirm-video-before-live.test.cjs',
  'artifacts/api-server/tests/viewer-premium-reconnect.test.mjs',
];
for (const test of tests) {
  const result = spawnSync(process.execPath, [test], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('PASS: stream code regressions. Android/iPhone sleep, layout and gesture checks still require devices.');
