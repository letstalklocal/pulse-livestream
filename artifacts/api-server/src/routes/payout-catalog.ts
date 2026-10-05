import { Router, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import {
  CatalogError,
  createCatalogProvider,
  addCatalogFee,
  estimateCatalog,
  importResearch,
  readCatalog,
  updateCatalog,
} from "../lib/payoutCatalog";

export function catalogAccountKey() {
  return (
    process.env.PULSE_PAYOUT_CATALOG_ACCOUNT ||
    (process.env.NODE_ENV === "development"
      ? "development-remitly-business"
      : "production-remitly-business")
  );
}
const safe =
  (fn: RequestHandler): RequestHandler =>
  async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      await fn(req, res, next);
    } catch (error) {
      if (error instanceof CatalogError)
        res.status(error.status).json({ error: error.message });
      else
        res.status(503).json({
          error: "Payout catalog is temporarily unavailable. Please retry.",
        });
    }
  };
const creatorCatalogRouter = Router();
creatorCatalogRouter.use(
  ["/payout-catalog", "/payout-catalog/estimate"],
  (req, res, next) => {
    if (
      !/^Bearer \S+$/i.test(req.get("authorization") ?? "") ||
      !getAuth(req).userId
    ) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    next();
  },
);
creatorCatalogRouter.get(
  "/payout-catalog",
  safe(async (_req, res) => {
    res.json(await readCatalog(pool, catalogAccountKey()));
  }),
);
creatorCatalogRouter.post(
  "/payout-catalog/estimate",
  safe(async (req, res) => {
    res.json(
      estimateCatalog(await readCatalog(pool, catalogAccountKey()), req.body),
    );
  }),
);
// The parent admin router mounts this AFTER the authenticated enabled-owner guard.
export const adminCatalogRouter = Router();
adminCatalogRouter.post(
  "/providers",
  safe(async (req, res) => {
    res
      .status(201)
      .json(
        await createCatalogProvider(
          pool,
          catalogAccountKey(),
          req.body,
          res.locals.adminId,
        ),
      );
  }),
);
adminCatalogRouter.post(
  "/methods/:id/fees",
  safe(async (req, res) => {
    res.json(
      await addCatalogFee(
        pool,
        catalogAccountKey(),
        String(req.params.id),
        req.body,
        res.locals.adminId,
      ),
    );
  }),
);
adminCatalogRouter.get(
  "/",
  safe(async (_req, res) => {
    const catalog = await readCatalog(pool, catalogAccountKey(), true);
    await pool.query(
      "INSERT INTO admin_audit_events(actor_clerk_id,action,outcome) VALUES($1,'payout-catalog.view','allowed')",
      [res.locals.adminId],
    );
    res.json(catalog);
  }),
);
adminCatalogRouter.post(
  "/import",
  safe(async (req, res) => {
    const account = catalogAccountKey();
    if (
      !req.body ||
      typeof req.body !== "object" ||
      Array.isArray(req.body) ||
      Object.keys(req.body).some(
        (k) => !["research", "dryRun", "providerId"].includes(k),
      ) ||
      (req.body.dryRun !== undefined && typeof req.body.dryRun !== "boolean")
    )
      throw new CatalogError(
        "Provide research and an optional boolean dryRun.",
      );
    let provider;
    if (req.body.providerId !== undefined) {
      if (
        typeof req.body.providerId !== "string" ||
        !req.body.providerId ||
        req.body.providerId.length > 250
      )
        throw new CatalogError("Select a valid provider.");
      const result = await pool.query(
        "SELECT id,name,account_key FROM payout_catalog_providers WHERE id=$1 AND account_key=$2",
        [req.body.providerId, account],
      );
      if (!result.rows.length)
        throw new CatalogError("Provider not found.", 404);
      const row = result.rows[0];
      provider = { id: row.id, name: row.name, accountKey: row.account_key };
    } else if (
      !process.env.PULSE_PAYOUT_CATALOG_ACCOUNT &&
      process.env.NODE_ENV !== "development"
    ) {
      throw new CatalogError("Add and select a provider before importing.");
    }
    res.json(
      await importResearch(
        pool,
        req.body.research,
        account,
        res.locals.adminId,
        req.body.dryRun !== false,
        provider,
      ),
    );
  }),
);
adminCatalogRouter.patch(
  "/:kind/:id",
  safe(async (req, res) => {
    const account = catalogAccountKey();
    res.json(
      await updateCatalog(
        pool,
        account,
        String(req.params.kind),
        String(req.params.id),
        req.body,
        res.locals.adminId,
      ),
    );
  }),
);
export default creatorCatalogRouter;
