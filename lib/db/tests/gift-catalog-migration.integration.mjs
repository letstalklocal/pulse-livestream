import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { migrateCatalog, prepareSnapshot, assetTransfer, snapshotUrl, migrationId, runProductionGiftMigration } from '../migrations/20261007_development_gift_catalog.mjs';

const { Pool } = createRequire(new URL('../package.json', import.meta.url))('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = await pool.connect();
const schema = `gift_migration_test_${randomUUID().replaceAll('-', '')}`;
const source = JSON.parse(await readFile(snapshotUrl, 'utf8'));
const bytes = Buffer.from('test gift bytes');
source.gift_assets.forEach(a => { a.byte_size = bytes.length; a.sha256 = createHash('sha256').update(bytes).digest('hex'); });
const objects = new Map(source.gift_assets.map(a => [`${source.sourceObjectDir.replace(/^\//, '')}/${a.object_path.slice(9)}`, bytes]));
let saves = 0;
const storage = { bucket: bucket => ({ file: name => ({
  async download() { const value = objects.get(`${bucket}/${name}`); if (!value) throw Object.assign(Error('missing'), { code: 404 }); return [value]; },
  async save(value, options) { assert.equal(options.preconditionOpts.ifGenerationMatch, 0); const key = `${bucket}/${name}`;
    if (objects.has(key)) throw Object.assign(Error('exists'), { code: 412 }); saves++; objects.set(key, value); },
}) }) };
const transfer = assetTransfer(storage, '/test-target/private');
const run = (apply = false, ensureAssets = transfer, snapshot = source) => migrateCatalog(db, snapshot, { apply, ensureAssets });
const catalog = async () => ({ collections: (await db.query('SELECT * FROM gift_collections ORDER BY id')).rows,
  gifts: (await db.query('SELECT * FROM catalog_gifts ORDER BY id')).rows, version: (await db.query('SELECT * FROM gift_catalog_state')).rows });
try {
  await db.query(`CREATE SCHEMA ${schema}`);
  await db.query(`SET search_path TO ${schema}`);
  for (const name of ['20260913_admin_access.sql', '20261007_gift_catalog.sql', '20261007_gift_types.sql', '20261007_gift_asset_filenames.sql'])
    await db.query(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  await assert.rejects(run(), /owner is not enabled/);
  await db.query("INSERT INTO admin_staff(clerk_user_id,role) VALUES($1,'owner')", [source.productionOwner]);
  await db.query("INSERT INTO gift_collections(id,name,status) VALUES('prod_only','Old production','published')");
  await db.query("INSERT INTO catalog_gifts(id,collection_id,status) VALUES('prod_only','prod_only','published')");
  await db.query("INSERT INTO gift_revisions(id,gift_id,name,coin_cost,created_by) VALUES('prod_party_revision','party','Production edit',777,'prod'),('prod_only_revision','prod_only','Old',23,'prod')");
  await db.query("INSERT INTO gift_revision_publications(revision_id) VALUES('prod_party_revision'),('prod_only_revision')");
  await db.query("UPDATE catalog_gifts SET current_revision_id='prod_party_revision',draft_revision_id='party_legacy_v1' WHERE id='party'");
  await db.query("UPDATE catalog_gifts SET current_revision_id='prod_only_revision' WHERE id='prod_only'");
  await db.query('CREATE TABLE saved_receipt(id integer PRIMARY KEY, revision_id text REFERENCES gift_revisions(id), snapshot jsonb)');
  await db.query(`INSERT INTO saved_receipt VALUES(1,'prod_party_revision','{"name":"Production edit","coinCost":777,"count":2}')`);
  const before = await catalog();
  const history = (await db.query('SELECT * FROM saved_receipt')).rows;
  const oldRevisions = (await db.query('SELECT * FROM gift_revisions ORDER BY id')).rows;
  const check = await run();
  assert.equal(check.wouldCopy, source.gift_assets.length); assert.equal(saves, 0);
  assert.deepEqual(await catalog(), before, 'dry run never changes the catalog');
  assert.equal((await db.query("SELECT to_regclass('gift_catalog_data_migrations') AS name")).rows[0].name, null);
  await assert.rejects(run(true, async () => { throw Error('storage unavailable'); }), /storage unavailable/);
  assert.deepEqual(await catalog(), before, 'storage failure rolls back staged database replacement');
  const corruptKey = `${source.sourceObjectDir.replace(/^\//, '')}/${source.gift_assets[0].object_path.slice(9)}`;
  objects.set(corruptKey, Buffer.from('corrupt'));
  await assert.rejects(run(), /integrity failure/); objects.set(corruptKey, bytes);
  const result = await run(true);
  assert.equal(result.applied, true); assert.equal(result.copied, source.gift_assets.length);
  const prepared = prepareSnapshot(source);
  const imported = (await db.query('SELECT * FROM catalog_gifts WHERE id=ANY($1::text[]) ORDER BY id', [prepared.gifts.map(g => g.id)])).rows;
  assert.deepEqual(imported, prepared.gifts.toSorted((a, b) => a.id.localeCompare(b.id)));
  assert.equal((await db.query("SELECT status FROM catalog_gifts WHERE id='prod_only'")).rows[0].status, 'archived');
  assert.equal((await db.query("SELECT status FROM gift_collections WHERE id='prod_only'")).rows[0].status, 'archived');
  assert.deepEqual((await db.query('SELECT * FROM saved_receipt')).rows, history);
  assert.deepEqual((await db.query('SELECT * FROM gift_revisions WHERE id=ANY($1::text[]) ORDER BY id', [oldRevisions.map(r => r.id)])).rows, oldRevisions);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM gift_assets WHERE owner_clerk_id=$1', [source.productionOwner])).rows[0].n, source.gift_assets.length);
  assert.deepEqual((await db.query('SELECT previous_catalog FROM gift_catalog_data_migrations WHERE id=$1', [migrationId])).rows[0].previous_catalog.gifts, before.gifts);
  // Later production admin edits must survive accidental reruns.
  await db.query("UPDATE catalog_gifts SET status='draft' WHERE id='party'");
  const postEdit = await catalog(); const count = saves;
  assert.deepEqual(await run(true), { alreadyApplied: true });
  assert.equal(saves, count); assert.deepEqual(await catalog(), postEdit);
  await assert.rejects(run(true, transfer, { ...source, capturedAt: 'changed' }), /snapshot changed/);
  // Existing destination bytes can be reused on recovery; corrupt ones are never overwritten.
  assert.equal((await transfer(source, prepared, true)).reusable, source.gift_assets.length);
  objects.set(`test-target/private/${prepared.assets[0].object_path.slice(9)}`, Buffer.from('corrupt'));
  await assert.rejects(transfer(source, prepared, true), /integrity failure/);
  assert.deepEqual(await runProductionGiftMigration({ env: { NODE_ENV: 'development' }, pool: { connect() { throw Error('development accessed database'); } } }), { skipped: 'development' });
  // Exercise automatic startup on a schema with NO gift catalog prerequisites applied.
  await db.query(`CREATE SCHEMA ${schema}_startup`);
  await db.query(`SET search_path TO ${schema}_startup`);
  await db.query(await readFile(new URL('../migrations/20260913_admin_access.sql', import.meta.url), 'utf8'));
  await db.query("INSERT INTO admin_staff(clerk_user_id,role) VALUES($1,'owner')", [source.productionOwner]);
  for (const table of ['coin_transactions', 'direct_messages', 'dm_gift_combos', 'media_packs']) await db.query(`CREATE TABLE ${table}(id integer PRIMARY KEY)`);
  const startupPool = { async connect() {
    const client = await pool.connect(); await client.query(`SET search_path TO ${schema}_startup`); return client;
  } };
  const startupOptions = { env: { REPLIT_DEPLOYMENT: '1', PRIVATE_OBJECT_DIR: '/startup-target/private' }, pool: startupPool, storage, source,
    readSchema: name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8') };
  // A file error must roll back the additive schema as well as all imported records.
  await assert.rejects(runProductionGiftMigration({ ...startupOptions, storage: { bucket() { throw Error('startup storage failure'); } } }), /startup storage failure/);
  assert.equal((await db.query("SELECT to_regclass('catalog_gifts') AS name")).rows[0].name, null);
  const starts = await Promise.all([runProductionGiftMigration(startupOptions), runProductionGiftMigration(startupOptions)]);
  assert.equal(starts.filter(result => result.applied).length, 1);
  assert.equal(starts.filter(result => result.alreadyApplied).length, 1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM catalog_gifts')).rows[0].n, 12);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM admin_audit_events')).rows[0].n, 1);
  await db.query("UPDATE catalog_gifts SET status='draft' WHERE id='party'");
  const again = await runProductionGiftMigration({ ...startupOptions, storage: { bucket() { throw Error('completed startup touched storage'); } } });
  assert.equal(again.alreadyApplied, true);
  assert.equal((await db.query("SELECT status FROM catalog_gifts WHERE id='party'")).rows[0].status, 'draft');
  console.log('PASS: automatic production startup applies schema + catalog once, skips development, serializes simultaneous starts, rolls back schema on failure, and preserves later admin edits without accessing storage.');
  console.log('PASS: catalog replacement, production-only archive, owned assets/audio, dry-run, rollback, checksum failure, create-only transfer, immutable history, audit snapshot and one-time replay. Isolated PostgreSQL schema; object storage mocked.');
} finally {
  await db.query('ROLLBACK');
  await db.query('SET search_path TO public');
  await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await db.query(`DROP SCHEMA IF EXISTS ${schema}_startup CASCADE`);
  db.release(); await pool.end();
}
