// One-time data + object-storage migration, also invoked by production API startup.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const migrationId = '20261007_development_gift_catalog';
export const snapshotUrl = new URL('./20261007_development_gift_catalog.json', import.meta.url);
export const schemaFiles = ['20261007_gift_catalog.sql', '20261007_gift_purchase_snapshots.sql', '20261007_gift_types.sql', '20261007_gift_asset_filenames.sql'];
export const isProductionDeployment = env => env.NODE_ENV === 'production' || env.REPLIT_DEPLOYMENT === '1';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const assetId = id => {
  const hex = hash(`${migrationId}:asset:${id}`).slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const revisionId = id => id == null ? null : id.endsWith('_legacy_v1') ? id : `${migrationId}:${id}`;
const remapAsset = id => id == null ? null : assetId(id);

export function prepareSnapshot(source) {
  if (source.id !== migrationId || !source.productionOwner || source.gift_collections.find(c => c.id === 'popular')?.locked !== true)
    throw Error('Invalid migration snapshot');
  const assets = source.gift_assets.map(a => ({ ...a, id: assetId(a.id), owner_clerk_id: source.productionOwner,
    object_path: `/objects/gifts/${assetId(a.id)}`, audio_asset_id: remapAsset(a.audio_asset_id) }));
  const revisions = source.gift_revisions.map(r => ({ ...r, id: revisionId(r.id), created_by: source.productionOwner,
    thumbnail_asset_id: remapAsset(r.thumbnail_asset_id), android_asset_id: remapAsset(r.android_asset_id),
    ios_asset_id: remapAsset(r.ios_asset_id), sound_asset_id: remapAsset(r.sound_asset_id) }));
  const gifts = source.catalog_gifts.map(g => ({ ...g, current_revision_id: revisionId(g.current_revision_id), draft_revision_id: revisionId(g.draft_revision_id) }));
  const publications = source.gift_revision_publications.map(p => ({ ...p, revision_id: revisionId(p.revision_id) }));
  const ordered = [], visited = new Set(), visiting = new Set();
  function visit(asset) {
    if (visited.has(asset.id)) return;
    if (visiting.has(asset.id)) throw Error('Cyclic embedded audio reference');
    visiting.add(asset.id);
    if (asset.audio_asset_id) {
      const audio = assets.find(a => a.id === asset.audio_asset_id);
      if (!audio) throw Error('Missing embedded audio asset');
      visit(audio);
    }
    visited.add(asset.id); visiting.delete(asset.id); ordered.push(asset);
  }
  assets.forEach(visit);
  return { collections: source.gift_collections, assets: ordered, revisions, gifts, publications };
}

async function insert(db, table, row, conflict = '') {
  const keys = Object.keys(row);
  // Table/column names come exclusively from the checked-in migration snapshot.
  if (![table, ...keys].every(key => /^[a-z_][a-z0-9_]*$/.test(key))) throw Error('Invalid migration identifier');
  return db.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) ${conflict}`, Object.values(row));
}
async function immutableInsert(db, table, row) {
  const current = (await db.query(`SELECT * FROM ${table} WHERE id=$1`, [row.id])).rows[0];
  if (!current) return insert(db, table, row);
  for (const key of Object.keys(row).filter(key => !['created_at', 'created_by'].includes(key))) {
    if (!isDeepStrictEqual(current[key], row[key])) throw Error(`Immutable ${table} collision: ${row.id} (${key})`);
  }
}

/** Database writes are staged atomically; --check rolls them all back. No receipt/payment tables are touched. */
export async function migrateCatalog(db, source, { apply = false, ensureAssets, schemaSql = [] }) {
  const prepared = prepareSnapshot(source), checksum = hash(JSON.stringify(source));
  await db.query('BEGIN');
  try {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('20261007_development_gift_catalog'))");
    await db.query(`CREATE TABLE IF NOT EXISTS gift_catalog_data_migrations (
      id text PRIMARY KEY, snapshot_sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(), previous_catalog jsonb NOT NULL)`);
    const done = (await db.query('SELECT snapshot_sha256 FROM gift_catalog_data_migrations WHERE id=$1', [migrationId])).rows[0];
    if (done) {
      if (done.snapshot_sha256 !== checksum) throw Error('Applied migration snapshot changed; create a new migration instead');
      await db.query('ROLLBACK'); return { alreadyApplied: true };
    }
    if (!(await db.query("SELECT 1 FROM admin_staff WHERE clerk_user_id=$1 AND role='owner' AND enabled=true", [source.productionOwner])).rowCount)
      throw Error('Approved production owner is not enabled in this database; refusing wrong-environment import');
    // Same advisory lock as managedGiftCatalog.ts: wait for in-flight purchases/admin edits.
    await db.query('SELECT pg_advisory_xact_lock(731007)');
    // Execute additive prerequisites inside this transaction, not separate commits.
    for (const sql of schemaSql) await db.query(sql.replace(/^\s*(BEGIN|COMMIT);\s*$/gm, ''));
    await db.query('SELECT version FROM gift_catalog_state WHERE id=1 FOR UPDATE');
    await db.query('LOCK TABLE gift_collections, catalog_gifts, gift_assets, gift_revisions, gift_revision_publications IN SHARE ROW EXCLUSIVE MODE');
    const previous = {
      collections: (await db.query('SELECT * FROM gift_collections ORDER BY id')).rows,
      gifts: (await db.query('SELECT * FROM catalog_gifts ORDER BY id')).rows,
    };
    // Production-only entries are hidden, never deleted: old receipt references remain valid.
    await db.query("UPDATE catalog_gifts SET status='archived' WHERE NOT(id=ANY($1::text[]))", [prepared.gifts.map(g => g.id)]);
    await db.query("UPDATE gift_collections SET status='archived' WHERE NOT(id=ANY($1::text[]))", [prepared.collections.map(c => c.id)]);
    for (const c of prepared.collections) await insert(db, 'gift_collections', c,
      'ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,sort_order=EXCLUDED.sort_order,locked=EXCLUDED.locked,status=EXCLUDED.status');
    for (const g of prepared.gifts) await insert(db, 'catalog_gifts', { ...g, current_revision_id: null, draft_revision_id: null }, 'ON CONFLICT(id) DO NOTHING');
    for (const a of prepared.assets) await immutableInsert(db, 'gift_assets', a);
    for (const r of prepared.revisions) await immutableInsert(db, 'gift_revisions', r);
    for (const p of prepared.publications) await insert(db, 'gift_revision_publications', p, 'ON CONFLICT(revision_id) DO NOTHING');
    for (const g of prepared.gifts) await insert(db, 'catalog_gifts', g,
      'ON CONFLICT(id) DO UPDATE SET collection_id=EXCLUDED.collection_id,sort_order=EXCLUDED.sort_order,status=EXCLUDED.status,current_revision_id=EXCLUDED.current_revision_id,draft_revision_id=EXCLUDED.draft_revision_id,legacy=EXCLUDED.legacy');
    // Validate every byte before exposing this catalog. Copy failures roll back all database changes.
    const storage = await ensureAssets(source, prepared, apply);
    await db.query('UPDATE gift_catalog_state SET version=version+1 WHERE id=1');
    await db.query('INSERT INTO gift_catalog_data_migrations(id,snapshot_sha256,previous_catalog) VALUES($1,$2,$3)', [migrationId, checksum, previous]);
    await db.query("INSERT INTO admin_audit_events(actor_clerk_id,action,target,outcome) VALUES($1,'gift.catalog.migrate',$2,'allowed')", [source.productionOwner, migrationId]);
    await db.query(apply ? 'COMMIT' : 'ROLLBACK');
    return { applied: apply, collections: prepared.collections.length, gifts: prepared.gifts.length, assets: prepared.assets.length, ...storage };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

/** Startup owns the connection; development returns before touching the database/storage. */
export async function runProductionGiftMigration({ env, pool, storage, source, readSchema }) {
  if (!isProductionDeployment(env)) return { skipped: 'development' };
  if (!env.PRIVATE_OBJECT_DIR) throw Error('Production gift migration requires PRIVATE_OBJECT_DIR');
  const db = await pool.connect();
  try {
    return await migrateCatalog(db, source, { apply: true, ensureAssets: assetTransfer(storage, env.PRIVATE_OBJECT_DIR),
      schemaSql: await Promise.all(schemaFiles.map(readSchema)) });
  } finally { db.release(); }
}

function objectFile(storage, root, path) {
  if (!root || !path.startsWith('/objects/gifts/')) throw Error('Invalid gift storage location');
  const parts = root.replace(/^\//, '').replace(/\/$/, '').split('/');
  return storage.bucket(parts.shift()).file(`${parts.join('/')}/${path.slice('/objects/'.length)}`);
}
function verify(bytes, asset) {
  if (bytes.length !== asset.byte_size || hash(bytes) !== asset.sha256) throw Error(`Gift file integrity failure: ${asset.id}`);
}
async function download(file) {
  try { return (await file.download())[0]; } catch (error) { if (Number(error.code) === 404) return null; throw error; }
}
export async function verifySource(storage, source) {
  for (const asset of source.gift_assets) {
    const bytes = await download(objectFile(storage, source.sourceObjectDir, asset.object_path));
    if (!bytes) throw Error(`Missing source gift file: ${asset.id}`);
    verify(bytes, asset);
  }
  return { verifiedSourceAssets: source.gift_assets.length };
}
export function assetTransfer(storage, targetRoot) {
  return async (source, prepared, apply) => {
    let copied = 0, reusable = 0, wouldCopy = 0;
    for (const original of source.gift_assets) {
      const target = prepared.assets.find(a => a.id === assetId(original.id));
      const destination = objectFile(storage, targetRoot, target.object_path);
      const existing = await download(destination);
      if (existing) { verify(existing, target); reusable++; continue; }
      const bytes = await download(objectFile(storage, source.sourceObjectDir, original.object_path));
      if (!bytes) throw Error(`Missing source gift file: ${original.id}`);
      verify(bytes, original);
      if (!apply) { wouldCopy++; continue; }
      // Create-only: never overwrite a file used by production history.
      try { await destination.save(bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType: 'application/octet-stream', cacheControl: 'private, max-age=31536000, immutable' } });
      } catch (error) { if (Number(error.code) !== 412) throw error; }
      verify(await download(destination) ?? Buffer.alloc(0), target); copied++;
    }
    return { copied, reusable, wouldCopy };
  };
}

async function main() {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || !['--check', '--apply', '--verify-source'].includes(mode))
    throw Error('Usage: node lib/db/migrations/20261007_development_gift_catalog.mjs --check|--apply|--verify-source');
  const source = JSON.parse(await readFile(snapshotUrl, 'utf8'));
  const apiRequire = createRequire(new URL('../../../artifacts/api-server/package.json', import.meta.url));
  const { Storage } = apiRequire('@google-cloud/storage');
  const endpoint = 'http://127.0.0.1:1106';
  const storage = new Storage({ credentials: { audience: 'replit', subject_token_type: 'access_token', token_url: `${endpoint}/token`, type: 'external_account',
    credential_source: { url: `${endpoint}/credential`, format: { type: 'json', subject_token_field_name: 'access_token' } } }, universe_domain: 'googleapis.com', projectId: '' });
  if (mode === '--verify-source') { console.log(await verifySource(storage, source)); return; }
  if (!process.env.DATABASE_URL || !process.env.PRIVATE_OBJECT_DIR) throw Error('Run with the target API database and object-storage environment');
  const { Pool } = createRequire(new URL('../package.json', import.meta.url))('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = await pool.connect();
  try { console.log(await migrateCatalog(db, source, { apply: mode === '--apply', ensureAssets: assetTransfer(storage, process.env.PRIVATE_OBJECT_DIR) })); }
  finally { db.release(); await pool.end(); }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().catch(error => { console.error(error.message); process.exitCode = 1; });
