import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const root = new URL("..", import.meta.url).pathname,
  output = `${root}/tests/.catalog-db-${randomUUID()}.cjs`;
await build({
  stdin: {
    contents:
      "export {pool} from '@workspace/db';export * from './src/lib/managedGiftCatalog'",
    resolveDir: root,
  },
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["pg-native"],
  logLevel: "silent",
});
const m = createRequire(import.meta.url)(output),
  db = await m.pool.connect(),
  actor = `catalog-test-${randomUUID()}`,
  collection = `test_${randomUUID().replaceAll("-", "")}`,
  gift = `gift_${randomUUID().replaceAll("-", "")}`,
  thumb = randomUUID();
try {
  await db.query("BEGIN");
  await assert.rejects(
    m.mutateGiftCollection(db, actor, "popular", {
      name: "Moved",
      status: "archived",
    }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    m.mutateGiftCollection(
      db,
      actor,
      "test",
      { name: "Reserved preview collection" },
      true,
    ),
    /reserved/,
  );
  await m.mutateGiftCollection(
    db,
    actor,
    collection,
    { name: "Test collection" },
    true,
  );
  await db.query(
    "INSERT INTO gift_assets(id,owner_clerk_id,kind,format,object_path,sha256,byte_size,width,height) VALUES($1,$2,'thumbnail','png',$3,$4,12,20,20)",
    [thumb, actor, `/objects/gifts/${thumb}`, "a".repeat(64)],
  );
  const movedRose = await m.draftManagedGift(db, actor, "rose", {
    collectionId: "luxury",
    sortOrder: 77,
  });
  await m.publishManagedGift(db, actor, "rose", movedRose.revisionId);
  await m.publishManagedGift(db, actor, "rose", "rose_legacy_v1");
  const restoredRose = (
    await db.query(
      "SELECT collection_id,sort_order FROM catalog_gifts WHERE id='rose'",
    )
  ).rows[0];
  assert.deepEqual(restoredRose, { collection_id: "popular", sort_order: 0 });
  let draft = await m.draftManagedGift(
    db,
    actor,
    gift,
    {
      collectionId: collection,
      name: "Original",
      coinCost: 7,
      thumbnailAssetId: thumb,
    },
    true,
  );
  await assert.rejects(
    m.resolvePublishedGift(db, gift, draft.revisionId, 7),
    (e) => e.status === 400,
  );
  await m.publishManagedGift(db, actor, gift, draft.revisionId);
  await m.mutateGiftCollection(db, actor, collection, { status: "published" });
  const receipt = await m.resolvePublishedGift(db, gift, draft.revisionId, 7);
  assert.equal(receipt.name, "Original");
  assert.equal(receipt.thumbnail.id, thumb);
  await assert.rejects(
    m.resolvePublishedGift(db, gift),
    (e) => e.status === 409,
  );
  const catalog = await m.readPublishedGiftCatalog(db, "ios", []);
  assert.equal(catalog.collections[0].id, "popular");
  assert.equal(
    catalog.collections.find((c) => c.id === collection).gifts[0].coinCost,
    7,
  );
  const beforeDraft = await m.readPublishedGiftCatalog(db, "ios", []);
  const typedId = `typed_${randomUUID().replaceAll("-", "")}`;
  const animationId = randomUUID();
  await db.query("INSERT INTO gift_assets(id,owner_clerk_id,kind,format,object_path,sha256,byte_size,width,height,duration_ms) VALUES($1,$2,'animation','svga',$3,$4,12,20,20,1000)",
    [animationId, actor, `/objects/gifts/${animationId}`, "b".repeat(64)]);
  const typedDraft = await m.draftManagedGift(db, actor, typedId, { type: "animation", collectionId: collection, name: "Animated", coinCost: 3, thumbnailAssetId: thumb, androidAssetId: animationId }, true);
  await m.publishManagedGift(db, actor, typedId, typedDraft.revisionId);
  const animatedReceipt = await m.readGiftRevision(db, typedDraft.revisionId);
  assert.equal(animatedReceipt.type, "animation");
  assert.equal(animatedReceipt.androidAnimation.id, animationId);
  const imageDraft = await m.draftManagedGift(db, actor, typedId, { type: "image", androidAssetId: animationId });
  await m.publishManagedGift(db, actor, typedId, imageDraft.revisionId);
  const imageReceipt = await m.readGiftRevision(db, imageDraft.revisionId);
  assert.equal(imageReceipt.type, "image");
  assert.equal(imageReceipt.androidAnimation, null);
  assert.equal(imageReceipt.iosAnimation, null);
  assert.equal((await m.readGiftRevision(db, typedDraft.revisionId)).androidAnimation.id, animationId, "Image conversion leaves immutable animation history intact");
  const sorted = await m.readPublishedGiftCatalog(db, "android", ["svga"]);
  assert.deepEqual(sorted.collections.find(c => c.id === collection).gifts.map(g => g.coinCost), [3, 7]);
  const emptyAnimation = await m.draftManagedGift(db, actor, typedId, { type: "animation" });
  await assert.rejects(m.publishManagedGift(db, actor, typedId, emptyAnimation.revisionId), /Upload an Android or iPhone animation/);
  const typedBaseline = await m.readPublishedGiftCatalog(db, "ios", []);
  const edited = await m.draftManagedGift(db, actor, gift, {
    name: "Changed",
    coinCost: 9,
    collectionId: "luxury",
    sortOrder: 42,
  });
  assert.equal(
    (await m.resolvePublishedGift(db, gift, draft.revisionId, 7)).name,
    "Original",
  );
  const staged = await db.query(
    "SELECT collection_id,sort_order FROM catalog_gifts WHERE id=$1",
    [gift],
  );
  assert.equal(staged.rows[0].collection_id, collection);
  assert.equal(staged.rows[0].sort_order, 0);
  assert.deepEqual(
    await m.readPublishedGiftCatalog(db, "ios", []),
    typedBaseline,
  );
  await m.publishManagedGift(db, actor, gift, edited.revisionId);
  const published = await db.query(
    "SELECT collection_id,sort_order FROM catalog_gifts WHERE id=$1",
    [gift],
  );
  assert.equal(published.rows[0].collection_id, "luxury");
  assert.equal(published.rows[0].sort_order, 42);
  await assert.rejects(
    m.resolvePublishedGift(db, gift, draft.revisionId, 7),
    (e) => e.status === 409,
  );
  await assert.rejects(
    m.resolvePublishedGift(db, gift, edited.revisionId, 7),
    (e) => e.status === 409,
  );
  assert.equal(
    (await m.readGiftRevision(db, draft.revisionId)).name,
    "Original",
  );
  assert.equal(receipt.coinCost, 7);
  await db.query("SAVEPOINT immutable");
  await assert.rejects(
    db.query("UPDATE gift_revisions SET name=$2 WHERE id=$1", [
      draft.revisionId,
      "tampered",
    ]),
    /immutable/,
  );
  await db.query("ROLLBACK TO SAVEPOINT immutable");
  await m.archiveManagedGift(db, actor, gift);
  await assert.rejects(
    m.resolvePublishedGift(db, gift, edited.revisionId, 9),
    (e) => e.status === 400,
  );
  assert.equal((await m.readGiftRevision(db, draft.revisionId)).coinCost, 7);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM gift_revision_publications WHERE revision_id=ANY($1::text[])",
        [[draft.revisionId, edited.revisionId]],
      )
    ).rows[0].n,
    2,
  );
  await m.publishManagedGift(db, actor, gift, draft.revisionId);
  assert.equal(
    (await m.resolvePublishedGift(db, gift, draft.revisionId, 7)).coinCost,
    7,
  );
  assert.equal(
    (
      await db.query("SELECT collection_id FROM catalog_gifts WHERE id=$1", [
        gift,
      ])
    ).rows[0].collection_id,
    collection,
  );
  await assert.rejects(
    m.draftManagedGift(db, actor, gift, { thumbnailAssetId: randomUUID() }),
    /owned/,
  );
  await assert.rejects(
    m.draftManagedGift(db, actor, gift, { coinCost: 0 }),
    /integer/,
  );
  assert.ok(
    (
      await db.query(
        "SELECT count(*)::int n FROM admin_audit_events WHERE actor_clerk_id=$1",
        [actor],
      )
    ).rows[0].n >= 8,
  );
  await db.query('SAVEPOINT status_workflow');
  const statusId=`status_${randomUUID().replaceAll('-','')}`;
  await assert.rejects(m.draftManagedGift(db,actor,statusId,{status:'archived'},true),/Draft or Published/);
  const statusPublished=await m.draftManagedGift(db,actor,statusId,{type:'image',collectionId:collection,name:'Status gift',coinCost:11,thumbnailAssetId:thumb,status:'published'},true);
  assert.equal(statusPublished.status,'published');
  assert.equal((await m.resolvePublishedGift(db,statusId,statusPublished.revisionId,11)).coinCost,11);
  const statusDraft=await m.draftManagedGift(db,actor,statusId,{name:'Hidden gift',coinCost:12,status:'draft'});
  assert.equal(statusDraft.status,'draft');
  await assert.rejects(m.resolvePublishedGift(db,statusId,statusPublished.revisionId,11),e=>e.status===400);
  assert.equal((await m.readGiftRevision(db,statusPublished.revisionId)).coinCost,11,'Status changes preserve historical prices');
  const republished=await m.draftManagedGift(db,actor,statusId,{status:'published'});
  assert.equal((await m.resolvePublishedGift(db,statusId,republished.revisionId,12)).name,'Hidden gift');
  const beforeFailure=(await db.query('SELECT current_revision_id,draft_revision_id,status FROM catalog_gifts WHERE id=$1',[statusId])).rows[0];
  const revisionsBefore=(await db.query('SELECT count(*)::int n FROM gift_revisions WHERE gift_id=$1',[statusId])).rows[0].n;
  await db.query('SAVEPOINT status_failure');
  await assert.rejects(m.draftManagedGift(db,actor,statusId,{status:'published',thumbnailAssetId:null}),/thumbnail/);
  await db.query('ROLLBACK TO SAVEPOINT status_failure');
  assert.deepEqual((await db.query('SELECT current_revision_id,draft_revision_id,status FROM catalog_gifts WHERE id=$1',[statusId])).rows[0],beforeFailure);
  assert.equal((await db.query('SELECT count(*)::int n FROM gift_revisions WHERE gift_id=$1',[statusId])).rows[0].n,revisionsBefore,'Failed save/publish leaves no attempted revision');
  await db.query('ROLLBACK TO SAVEPOINT status_workflow');
  console.log(
    "Gift catalog real database: locked Popular, draft/publish/archive/rollback, immutable history, owned assets, audited mutations and stale-price checks passed. Fixtures rolled back.",
  );
} finally {
  await db.query("ROLLBACK");
  db.release();
  await m.pool.end();
  await unlink(output);
}
