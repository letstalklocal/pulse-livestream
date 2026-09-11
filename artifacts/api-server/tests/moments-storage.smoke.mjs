import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';
const dir = fileURLToPath(new URL('..', import.meta.url)), output = `${dir}/tests/.storage-${randomUUID()}.cjs`;
await build({ entryPoints: [`${dir}/src/lib/objectStorage.ts`], outfile: output, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
const storage = createRequire(import.meta.url)(output);
let objectPath;
try {
  const upload = await storage.createPrivateUploadUrl(); objectPath = upload.objectPath;
  const payload = 'Moments upload smoke test ' + randomUUID();
  const put = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: payload });
  assert.equal(put.ok, true);
  const get = await fetch(await storage.createPrivateGetUrl(objectPath)); assert.equal(await get.text(), payload);
  const metadata = await storage.privateObjectMetadata(objectPath); assert.equal(Number(metadata.size), Buffer.byteLength(payload));
  console.log('PASS: real private object upload, signed playback/download URL, and metadata lookup. Test object deleted afterward; video capture not tested.');
} finally { if (objectPath) await storage.deletePrivateObject(objectPath); unlinkSync(output); }
