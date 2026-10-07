import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkGiftMediaTools } from '../scripts/check-gift-media-tools.mjs';

const calls = [];
checkGiftMediaTools((tool, args, options) => { calls.push(tool); assert.deepEqual(args, ['-version']); assert.equal(options.timeout, 10000); });
assert.deepEqual(calls, ['ffprobe', 'ffmpeg']);
for (const missing of calls) assert.throws(() => checkGiftMediaTools(tool => { if (tool === missing) throw Error('missing'); }), new RegExp(`require ${missing}`));
checkGiftMediaTools();
const config = await readFile(new URL('../../../.replit', import.meta.url), 'utf8');
assert.match(config, /\[nix\][\s\S]*?packages\s*=\s*\["ffmpeg-full"\]/);
console.log('PASS: ffprobe/ffmpeg available locally, explicit production dependency, and build fails clearly if either tool is missing. Production deployment still required.');
