import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkGiftMediaTools } from '../scripts/check-gift-media-tools.mjs';

const calls = [];
checkGiftMediaTools((tool, args, options) => { calls.push(tool); assert.deepEqual(args, [calls.length <= 2 ? '-version' : '--version']); assert.equal(options.timeout, 10000); });
assert.deepEqual(calls.slice(0, 2), ['ffprobe', 'ffmpeg']);
assert.equal(calls.length, 3);
for (const missing of ['ffprobe', 'ffmpeg']) assert.throws(() => checkGiftMediaTools(tool => { if (tool === missing) throw Error('missing'); }), new RegExp(`require ${missing}`));
assert.throws(() => checkGiftMediaTools(tool => { if (!['ffprobe', 'ffmpeg'].includes(tool)) throw Error('missing'); }), /require Chromium/);
checkGiftMediaTools();
const config = await readFile(new URL('../../../.replit', import.meta.url), 'utf8');
assert.match(config, /\[nix\][\s\S]*?packages\s*=\s*\[[^\]]*"ffmpeg-full"/);
assert.match(config, /\[nix\][\s\S]*?packages\s*=\s*\[[^\]]*"chromium"/);
console.log('PASS: media tools/browser available locally, declared production packages, and clear build failures for missing dependencies. Production deployment still required.');
