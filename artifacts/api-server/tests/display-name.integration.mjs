import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const { Pool } = createRequire(new URL('../../../lib/db/package.json', import.meta.url))('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const base = process.env.TEST_API_URL || `http://127.0.0.1:${process.env.PORT}`;
const clerkId = `display-name-test-${randomUUID()}`;
const call = async (path, method = 'GET', body) => {
  const response = await fetch(`${base}/api${path}`, {
    method, headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, 200, `${method} ${path}`);
  return (await response.json()).user;
};
try {
  const created = await call('/users/clerk-sync', 'POST', { clerkId, name: 'login_username' });
  assert.equal(created.name, 'login_username');
  const saved = await call(`/users/${created.uid}`, 'PUT', { name: 'My Display Name', bio: 'Saved biography' });
  assert.equal(saved.name, 'My Display Name');
  const before = (await pool.query('select updated_at from users where clerk_id=$1', [clerkId])).rows[0];
  for (const name of ['login_username', 'Changed Clerk Name']) {
    const synced = await call('/users/clerk-sync', 'POST', { clerkId, name });
    assert.equal(synced.uid, created.uid);
    assert.equal(synced.name, 'My Display Name');
    assert.equal(synced.bio, 'Saved biography');
  }
  const fetched = await call(`/users/${created.uid}`);
  assert.equal(fetched.name, 'My Display Name');
  const rows = (await pool.query('select name, bio, updated_at from users where clerk_id=$1', [clerkId])).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'My Display Name');
  assert.equal(rows[0].bio, 'Saved biography');
  assert.equal(rows[0].updated_at.getTime(), before.updated_at.getTime());
  console.log('Display-name integration passed on running API: initial name, profile save, repeated login sync, profile reload, database persistence.');
} finally {
  await pool.query('delete from users where clerk_id=$1', [clerkId]);
  await pool.end();
}
