import { Router, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import {
  CatalogError,
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
      : undefined)
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
// The parent admin router mounts this AFTER the owner/MFA guard.
export const adminCatalogRouter = Router();
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
    if (!account)
      throw new CatalogError(
        "Configure the provider account scope before importing.",
        503,
      );
    if (
      !req.body ||
      typeof req.body !== "object" ||
      Array.isArray(req.body) ||
      Object.keys(req.body).some((k) => !["research", "dryRun"].includes(k)) ||
      (req.body.dryRun !== undefined && typeof req.body.dryRun !== "boolean")
    )
      throw new CatalogError(
        "Provide research and an optional boolean dryRun.",
      );
    res.json(
      await importResearch(
        pool,
        req.body.research,
        account,
        res.locals.adminId,
        req.body.dryRun !== false,
      ),
    );
  }),
);
adminCatalogRouter.patch(
  "/:kind/:id",
  safe(async (req, res) => {
    const account = catalogAccountKey();
    if (!account)
      throw new CatalogError(
        "Configure the provider account scope before editing.",
        503,
      );
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
