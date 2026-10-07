import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const output = new URL(`./.gift-catalog-${randomUUID()}.cjs`, import.meta.url)
  .pathname;
try {
  await build({
    entryPoints: [
      new URL("../src/lib/managedGiftCatalog.ts", import.meta.url).pathname,
    ],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "storage",
        setup(b) {
          b.onResolve({ filter: /objectStorage$/ }, () => ({
            path: "storage",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents:
              "export const objectStorageClient={};export async function createPrivateGetUrl(path){return path}",
            loader: "js",
          }));
        },
      },
    ],
  });
  const {
    validateGiftFraming,
    validateGiftAsset,
    resolvePublishedGift,
    selectPlatformGift,
    GiftCatalogError,
    uploadManagedGiftAsset,
  } = createRequire(import.meta.url)(output);
  assert.throws(
    () => validateGiftFraming({ preset: "html" }),
    GiftCatalogError,
  );
  assert.throws(() => validateGiftFraming({ scale: 4 }), GiftCatalogError);
  for (const fileName of ["../bad.png", "folder/bad.png", "bad\u0000.png", " ", "a".repeat(256)]) await assert.rejects(uploadManagedGiftAsset({},"owner",Buffer.from("not used"),"thumbnail","png",fileName),/filename/);
  assert.deepEqual(
    validateGiftFraming({ preset: "fullscreen", scale: 1.12, y: -0.1 }),
    { preset: "fullscreen", scale: 1.12, x: 0, y: -0.1 },
  );
  await assert.rejects(
    validateGiftAsset(
      Buffer.from("<script>alert(1)</script>"),
      "thumbnail",
      "png",
    ),
    GiftCatalogError,
  );
  await assert.rejects(
    validateGiftAsset(Buffer.from("not svga"), "animation", "svga"),
    GiftCatalogError,
  );
  await assert.rejects(
    validateGiftAsset(Buffer.alloc(1), "animation", "html"),
    GiftCatalogError,
  );
  const supplied = new URL(
    "../../../artifacts/mobile/assets/gifts/",
    import.meta.url,
  );
  for (const [file, kind, format] of [
    ["rose.png", "thumbnail", "png"],
    ["luxury/Blast-Off-Gift.svga", "animation", "svga"],
    ["webm/PumpkinBrute_march_9x16.webm", "animation", "webm-alpha"],
    ["ios/pumpkin.compact-crf26.mp4", "animation", "packed-alpha-mp4"],
  ]) {
    const metadata = await validateGiftAsset(
      await readFile(new URL(file, supplied)),
      kind,
      format,
    );
    assert.ok(metadata.width > 0 && metadata.height > 0);
    if (kind === "animation")
      assert.ok(metadata.durationMs > 0 && metadata.durationMs <= 60000);
  }
  let current = "rose_legacy_v1",
    cost = 1,
    legacy = true,
    available = true;
  const db = {
    async query(sql) {
      if (sql.includes("FROM gift_revisions r"))
        return {
          rows: available ? [
            {
              id: current,
              current_revision_id: current,
              gift_id: "rose",
              name: "Rose",
              coin_cost: cost,
              emoji: "🌹",
              legacy,
              assets: [],
              framing: { preset: "contained", scale: 1, x: 0, y: 0 },
            },
          ] : [],
        };
      return { rows: [] };
    },
  };
  assert.equal((await resolvePublishedGift(db, "rose")).coinCost, 1);
  await assert.rejects(
    resolvePublishedGift(db, "rose", current, 5),
    (e) => e.status === 409,
  );
  current = "newrevision";
  await assert.rejects(
    resolvePublishedGift(db, "rose"),
    (e) => e.status === 409,
  );
  await assert.rejects(
    resolvePublishedGift(db, "rose", "rose_legacy_v1"),
    (e) => e.status === 409,
  );
  assert.equal(
    (await resolvePublishedGift(db, "rose", current, 1)).revisionId,
    current,
  );
  legacy = false;
  await assert.rejects(
    resolvePublishedGift(db, "rose"),
    (e) => e.status === 409,
  );
  available = false;
  await assert.rejects(
    resolvePublishedGift(db, "rose", current),
    (e) => e.status === 400,
  );
  const rendition = { format: "webm-alpha", id: "android" };
  const gift = {
    androidAnimation: rendition,
    iosAnimation: { format: "packed-alpha-mp4" },
    thumbnail: { id: "fallback" },
  };
  assert.equal(
    selectPlatformGift(gift, "android", ["webm-alpha"]).animation,
    rendition,
  );
  assert.equal(selectPlatformGift(gift, "ios", ["webm-alpha"]).animation, null);
  assert.equal(selectPlatformGift(gift, "web", ["svga"]).animation, null);
  const migration = await readFile(
    new URL(
      "../../../lib/db/migrations/20261007_gift_catalog.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /luxury_rocket','Blast Off','🚀',4999/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON gift_revisions/);
  assert.match(migration, /'popular','Popular',0,true,'published'/);
  console.log(
    "Gift catalog: framing, malicious assets, price/revision guards, platform fallback and immutable seed checks passed.",
  );
} finally {
  await unlink(output).catch(() => {});
}
