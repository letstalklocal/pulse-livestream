import { Router, raw, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import {
  GiftCatalogError,
  readPublishedGiftCatalog,
  readGiftRevision,
  readAdminGiftCatalog,
  mutateGiftCollection,
  reorderGiftCollections,
  reorderManagedGifts,
  revisionDto,
  draftManagedGift,
  publishManagedGift,
  archiveManagedGift,
  unpublishManagedGift,
  uploadManagedGiftAsset,
  giftAssetDelivery,
  importExistingGiftAssets,
} from "../lib/managedGiftCatalog";

const safe =
  (fn: RequestHandler): RequestHandler =>
  async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (e) {
      if (e instanceof GiftCatalogError)
        res.status(e.status).json({ error: e.message, code: e.code });
      else {
        console.error("Gift catalog operation failed", e);
        res
          .status(503)
          .json({ error: "Gift catalog temporarily unavailable." });
      }
    }
  };
async function transaction(fn: (db: any) => Promise<any>) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export const giftCatalogRouter = Router();
giftCatalogRouter.get(
  "/",
  safe(async (req, res) => {
    const platform = String(req.query.platform ?? "web");
    if (!["android", "ios", "web"].includes(platform))
      throw new GiftCatalogError("Unknown platform.");
    const caps = [
      ...new Set(
        String(req.query.capabilities ?? "")
          .split(",")
          .filter(Boolean),
      ),
    ].sort();
    if (
      caps.some(
        (cap) => !["svga", "webm-alpha", "packed-alpha-mp4"].includes(cap),
      )
    )
      throw new GiftCatalogError("Unknown player capability.");
    const catalog = await transaction((db) =>
      readPublishedGiftCatalog(db, platform, caps),
    );
    const etag = `"gifts-${catalog.version}-${platform}-${caps.sort().join("_")}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "private, max-age=60");
    if (req.get("if-none-match") === etag) {
      res.status(304).end();
      return;
    }
    res.json(catalog);
  }),
);
giftCatalogRouter.get(
  "/revisions/:id",
  safe(async (req, res) => {
    const db = await pool.query(
      "SELECT 1 FROM gift_revision_publications WHERE revision_id=$1",
      [String(req.params.id)],
    );
    if (!db.rows.length) throw new GiftCatalogError("Revision not found.", 404);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.json(await readGiftRevision(pool, String(req.params.id)));
  }),
);
giftCatalogRouter.get(
  "/assets/:id",
  safe(async (req, res) => {
    let actor: string | undefined;
    const auth = getAuth(req);
    if (
      auth.userId &&
      auth.sessionId &&
      /^Bearer \S+$/i.test(req.get("authorization") ?? "")
    ) {
      const staff = await pool.query(
        "SELECT 1 FROM admin_staff WHERE clerk_user_id=$1 AND enabled=true AND role='owner'",
        [auth.userId],
      );
      if (staff.rows.length) actor = auth.userId;
    }
    const { bytes, asset } = await giftAssetDelivery(
      pool,
      String(req.params.id),
      actor,
    );
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.setHeader("ETag", `"${asset!.sha256}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(
      (
        {
          png: "image/png",
          jpeg: "image/jpeg",
          webp: "image/webp",
          svga: "application/octet-stream",
          "webm-alpha": "video/webm",
          "packed-alpha-mp4": "video/mp4",
          mp3: "audio/mpeg",
          aac: "audio/aac",
        } as Record<string, string>
      )[asset!.format] ?? "application/octet-stream",
    );
    res.send(bytes);
  }),
);
// Mounted only after the existing enabled-owner adminGuard.
export const adminGiftCatalogRouter = Router();
adminGiftCatalogRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
adminGiftCatalogRouter.get(
  "/",
  safe(async (_req, res) => {
    res.json(await readAdminGiftCatalog(pool, res.locals.adminId));
  }),
);
adminGiftCatalogRouter.post(
  "/assets/import-existing",
  safe(async (_req, res) => {
    res.json(await transaction(db => importExistingGiftAssets(db, res.locals.adminId)));
  }),
);
adminGiftCatalogRouter.post(
  "/collections",
  safe(async (req, res) => {
    res
      .status(201)
      .json(
        await transaction((db) =>
          mutateGiftCollection(
            db,
            res.locals.adminId,
            req.body.id,
            req.body,
            true,
          ),
        ),
      );
  }),
);
adminGiftCatalogRouter.post(
  "/collections/reorder",
  safe(async (req, res) => {
    res.json(
      await transaction((db) =>
        reorderGiftCollections(db, res.locals.adminId, req.body.ids),
      ),
    );
  }),
);
adminGiftCatalogRouter.patch(
  "/collections/:id",
  safe(async (req, res) => {
    res.json(
      await transaction((db) =>
        mutateGiftCollection(
          db,
          res.locals.adminId,
          String(req.params.id),
          req.body,
        ),
      ),
    );
  }),
);
adminGiftCatalogRouter.post(
  "/gifts",
  safe(async (req, res) => {
    res
      .status(201)
      .json(
        await transaction((db) =>
          draftManagedGift(db, res.locals.adminId, req.body.id, req.body, true),
        ),
      );
  }),
);
adminGiftCatalogRouter.post(
  "/gifts/reorder",
  safe(async (req, res) => {
    res.json(
      await transaction((db) =>
        reorderManagedGifts(
          db,
          res.locals.adminId,
          req.body.collectionId,
          req.body.ids,
        ),
      ),
    );
  }),
);
adminGiftCatalogRouter.patch(
  "/gifts/:id",
  safe(async (req, res) => {
    res.json(
      await transaction((db) =>
        draftManagedGift(
          db,
          res.locals.adminId,
          String(req.params.id),
          req.body,
        ),
      ),
    );
  }),
);
adminGiftCatalogRouter.post(
  "/gifts/:id/publish",
  safe(async (req, res) => {
    res.json(
      await transaction((db) =>
        publishManagedGift(
          db,
          res.locals.adminId,
          String(req.params.id),
          req.body.revisionId,
        ),
      ),
    );
  }),
);
adminGiftCatalogRouter.post(
  "/gifts/:id/archive",
  safe(async (req, res) => {
    res.json(
      await transaction((db) =>
        archiveManagedGift(db, res.locals.adminId, String(req.params.id)),
      ),
    );
  }),
);
adminGiftCatalogRouter.post(
  "/gifts/:id/unpublish",
  safe(async (req, res) => {
    res.json(
      await transaction((db) =>
        unpublishManagedGift(db, res.locals.adminId, String(req.params.id)),
      ),
    );
  }),
);
adminGiftCatalogRouter.get(
  "/gifts/:id/revisions",
  safe(async (req, res) => {
    const result = await pool.query(
      "SELECT * FROM gift_revisions WHERE gift_id=$1 ORDER BY created_at DESC",
      [String(req.params.id)],
    );
    res.json({ revisions: result.rows.map(revisionDto) });
  }),
);
adminGiftCatalogRouter.post(
  "/assets",
  raw({ type: "application/octet-stream", limit: "30mb" }),
  safe(async (req, res) => {
    if (!Buffer.isBuffer(req.body))
      throw new GiftCatalogError("Upload binary application/octet-stream.");
    res
      .status(201)
      .json(
        await transaction((db) =>
          uploadManagedGiftAsset(
            db,
            res.locals.adminId,
            req.body,
            String(req.query.kind),
            String(req.query.format),
            req.query.filename === undefined ? undefined : String(req.query.filename),
          ),
        ),
      );
  }),
);
