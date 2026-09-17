const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
for (const path of ['../utils/reactionEmoji.ts', '../../api-server/src/lib/reactionEmoji.ts']) {
  const api = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve(path), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: api });
  for (const value of ['❤️', '🔥', '🥳', '👍🏽', '👩🏿‍💻', '👨‍👩‍👧‍👦', '🇨🇴', '1️⃣', '#️⃣', '🏳️‍🌈', '🫶', '🐦‍🔥', '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}']) assert.equal(api.isReactionEmoji(value), true, `${path}: accepts ${value}`);
  for (const value of ['', 'hello', 'hello❤️', '❤️🔥', '🔥\n', ' 🔥', '123', '1', '🏽', '\u200D', '🇨', null, 123, '🔥'.repeat(40)]) assert.equal(api.isReactionEmoji(value), false, `${path}: rejects ${value}`);
}
console.log('PASS: client/server accept single emoji, skin tones, ZWJ families, flags, keycaps and tag flags; reject text/multiple emoji/oversized payloads.');
