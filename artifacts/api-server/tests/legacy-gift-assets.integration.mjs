import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";

const root = new URL("..", import.meta.url).pathname;
const output = `${root}/tests/.legacy-assets-${randomUUID()}.cjs`;
await build({ stdin: { contents: "export {pool} from '@workspace/db';export * from './src/lib/managedGiftCatalog'", resolveDir: root }, outfile: output, bundle: true, platform: "node", format: "cjs", external: ["pg-native"], logLevel: "silent" });
const m = createRequire(import.meta.url)(output);
const db = await m.pool.connect();
const actor = `legacy-assets-test-${randomUUID()}`;
try {
  await db.query("BEGIN");
  const before = (await db.query("SELECT * FROM gift_revisions ORDER BY id")).rows;
  const beforeCatalog = await m.readPublishedGiftCatalog(db, "android", ["svga"]);
  let uploads = 0;
  const upload = async (db, actor, bytes, kind, format, fileName) => {
    uploads++;
    const meta = await m.validateGiftAsset(bytes, kind, format);
    const id = randomUUID();
    await db.query("INSERT INTO gift_assets(id,owner_clerk_id,kind,format,object_path,sha256,byte_size,duration_ms,width,height,original_filename) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [id, actor, kind, format, `/objects/gifts/${id}`, createHash("sha256").update(bytes).digest("hex"), bytes.length, meta.durationMs, meta.width, meta.height,fileName]);
    return { id };
  };
  assert.deepEqual(await m.importExistingGiftAssets(db, actor, upload), { imported: 12 });
  assert.deepEqual(await m.importExistingGiftAssets(db, actor, upload), { imported: 0 });
  assert.equal(uploads, 12);
  const admin = await m.readAdminGiftCatalog(db, actor);
  assert.equal(admin.assets.find(a=>a.isDefaultSound).fileName,"default-gift.mp3");
  for (const id of ["rose", "heart", "strawberry", "lips", "crown", "kisses", "luxury_rocket", "dragon"]) {
    const r = admin.revisions.find(r => r.id === `${id}_legacy_v1`);
    assert.ok(r.thumbnailAssetId, `${id} existing artwork selected`);
    assert.ok(admin.assets.find(a => a.id === r.thumbnailAssetId)?.label);
    assert.match(admin.assets.find(a => a.id === r.thumbnailAssetId).fileName,/\.png$/);
    if (["kisses", "luxury_rocket", "dragon"].includes(id)) {
      assert.ok(r.androidAssetId);
      assert.equal(r.iosAssetId, r.androidAssetId);
      assert.equal(admin.assets.find(a => a.id === r.androidAssetId).format, "svga");
    } else assert.equal(r.androidAssetId, null);
  }
  for (const id of ["party", "diamond", "rocket"]) assert.equal(admin.revisions.find(r => r.id === `${id}_legacy_v1`).thumbnailAssetId, null);
  assert.deepEqual((await db.query("SELECT * FROM gift_revisions ORDER BY id")).rows, before);
  assert.deepEqual(await m.readPublishedGiftCatalog(db, "android", ["svga"]), beforeCatalog);
  const rose = admin.revisions.find(r => r.id === "rose_legacy_v1");
  const defaultSound = admin.assets.find(asset=>asset.isDefaultSound);
  const draft = await m.draftManagedGift(db, actor, "rose", { thumbnailAssetId: rose.thumbnailAssetId, soundAssetId:defaultSound.id, type: "image" });
  assert.equal((await m.readGiftRevision(db, draft.revisionId)).thumbnail.id, rose.thumbnailAssetId);
  const publishedShape = await m.readGiftRevision(db,draft.revisionId);
  assert.equal(publishedShape.sound.id,defaultSound.id);
  assert.equal(publishedShape.thumbnail.fileName,undefined,"owner-only filenames stay outside public gift assets");
  assert.deepEqual(await m.readPublishedGiftCatalog(db, "android", ["svga"]), beforeCatalog);
  console.log("Existing gift assets: 8 PNGs, 3 SVGAs and standard MP3 chime validated; idempotent import, private filename metadata, selected artwork/default sound, saved draft references and unchanged history passed. Fixtures rolled back; no objects uploaded.");
} finally {
  await db.query("ROLLBACK");
  db.release();
  await m.pool.end();
  await unlink(output);
}
