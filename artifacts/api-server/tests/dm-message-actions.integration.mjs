import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
const dir = fileURLToPath(new URL('..', import.meta.url)), output = `${dir}/tests/.dm-actions-${randomUUID()}.cjs`;
await build({ stdin: { contents: "export {default as router} from './src/routes/direct-messages'; export {pool} from '@workspace/db';", resolveDir: dir }, outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['pg-native'], logLevel: 'silent' });
const { router, pool } = createRequire(import.meta.url)(output);
const sender = 1860000000 + Math.floor(Math.random() * 10000) * 3, recipient = sender + 1, outsider = sender + 2;
const ids = [sender, recipient, outsider], prefix = `dm-actions-${randomUUID()}`;
const auth = id => `${prefix}-${id}`;
async function call(method, path, messageId, body = {}, user = sender) {
  const handler = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack[0].handle;
  const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  await handler({ auth: () => ({ userId: user == null ? null : auth(user) }), params: { messageId: String(messageId), uid: String(user) }, body }, res);
  return res;
}
const insert = async (kind = 'text', text = 'Original', price = null) => (await pool.query('insert into direct_messages(from_user_id,to_user_id,text,kind,media_price,media_content_type) values($1,$2,$3,$4,$5,$6) returning id,created_at', [sender, recipient, text, kind, price, kind === 'media' ? 'image/jpeg' : null])).rows[0];
const history = async user => (await call('get', '/dms/:uid', null, {}, user)).body.messages;
try {
  for (const id of ids) await pool.query('insert into users(uid,clerk_id,name) values($1,$2,$3)', [id, auth(id), 'DM action fixture']);
  const message = await insert();
  assert.equal((await call('patch', '/dms/:messageId', message.id, { text: 'Updated' }, null)).statusCode, 401);
  assert.equal((await call('patch', '/dms/:messageId', message.id, { text: 'Hacked' }, recipient)).statusCode, 404);
  assert.equal((await call('patch', '/dms/:messageId', message.id, { text: 'Hacked' }, outsider)).statusCode, 404);
  for (const text of ['', ' ', 'x'.repeat(2001), '🎁 fake receipt']) assert.equal((await call('patch', '/dms/:messageId', message.id, { text })).statusCode, 400);
  const edited = await call('patch', '/dms/:messageId', message.id, { text: ' Updated ' });
  assert.equal(edited.statusCode, 200); assert.equal(edited.body.message.text, 'Updated'); assert.ok(edited.body.message.editedAt);
  assert.equal(edited.body.message.ts, message.created_at.getTime(), 'edit preserves sent time');
  const receiverCopy = (await history(recipient)).find(item => item.id === String(message.id));
  assert.equal(receiverCopy.text, 'Updated'); assert.equal(receiverCopy.editedAt, edited.body.message.editedAt);
  assert.equal((await call('delete', '/dms/:messageId', message.id, {}, recipient)).statusCode, 403, 'receiver cannot remove sender message for everyone');
  assert.equal((await call('delete', '/dms/:messageId', message.id, { scope: 'me' }, outsider)).statusCode, 404);
  assert.equal((await call('delete', '/dms/:messageId', message.id, { scope: 'me' }, recipient)).statusCode, 200);
  assert.ok((await history(recipient)).find(item => item.id === String(message.id)).deletedAt);
  assert.equal((await history(sender)).find(item => item.id === String(message.id)).deletedAt, null, 'delete for me preserves other copy');
  const removed = await call('delete', '/dms/:messageId', message.id);
  assert.equal(removed.statusCode, 200); assert.ok(removed.body.message.deletedAt);
  assert.ok((await history(sender)).find(item => item.id === String(message.id)).deletedAt);
  assert.equal((await call('patch', '/dms/:messageId', message.id, { text: 'Resurrect' })).statusCode, 404);
  assert.equal((await call('delete', '/dms/:messageId', message.id)).statusCode, 200, 'deletion is idempotent');
  for (const price of [0, 10]) {
    const media = await insert('media', '', price);
    assert.equal((await call('patch', '/dms/:messageId', media.id, { text: 'Bad edit' })).statusCode, 403);
    for (const scope of ['me', 'everyone']) assert.equal((await call('delete', '/dms/:messageId', media.id, { scope })).statusCode, price ? 403 : 200);
    if (!price) assert.equal((await call('post', '/dms/:messageId/unlock', media.id, { idempotencyKey: randomUUID() }, recipient)).statusCode, 404, 'deleted free media cannot be reopened through unlock');
  }
  for (const [kind, text] of [['text', '🎁 🌹 Rose gift • 1 coins'], ['media_pack', 'Pack'], ['private_stream_invitation', 'Live']]) {
    const protectedMessage = await insert(kind, text);
    assert.equal((await call('delete', '/dms/:messageId', protectedMessage.id)).statusCode, 403);
    assert.equal((await call('patch', '/dms/:messageId', protectedMessage.id, { text: 'Bad' })).statusCode, 403);
  }
  const senderHide = await insert();
  await call('delete', '/dms/:messageId', senderHide.id, { scope: 'me' });
  assert.equal((await history(recipient)).find(item => item.id === String(senderHide.id)).deletedAt, null);
  console.log('PASS: recipient sees edited text/time/tag, sender-only editing, default deletion for both, isolated delete-for-me, repeat deletion, protected paid media/gifts/packs/invites, auth and deleted-edit denial. Real development database.');
} finally {
  await pool.query('delete from users where uid=any($1::int[])', [ids]);
  await pool.end(); unlinkSync(output);
}
process.exit(0);
