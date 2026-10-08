import { Router, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import { catalogAccountKey } from "./payout-catalog";
import * as w from "../lib/creatorWithdrawals";
const safe =
  (fn: RequestHandler): RequestHandler =>
  async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      await fn(req, res, next);
    } catch (e) {
      if (e instanceof w.WithdrawalError)
        res.status(e.status).json({ error: e.message });
      else {
        const code =
          typeof e === "object" && e && "code" in e
            ? String(e.code)
            : undefined;
        req.log?.error(
          { category: "withdrawal_operation", code },
          "withdrawal operation failed",
        );
        if (code === "23505") {
          res.status(409).json({
            error:
              "Payout identifier already exists; reload and investigate duplicates.",
          });
          return;
        }
        res.status(503).json({
          error: "Withdrawals are temporarily unavailable. Please retry.",
        });
      }
    }
  };
const fundingReady = () => {
  if (!w.FUNDING_POLICY_READY)
    throw new w.WithdrawalError(
      "Withdrawal funding policy is awaiting confirmation; requests are not enabled yet.",
      503,
    );
};
const account = () => {
  const a = catalogAccountKey();
  if (!a) throw new w.WithdrawalError("Payout account is not configured.", 503);
  return a;
};
const creator = Router();
creator.use(
  "/withdrawals",
  safe(async (req, res, next) => {
    const auth = getAuth(req);
    if (!/^Bearer \S+$/i.test(req.get("authorization") ?? "") || !auth.userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const user = (
      await pool.query("SELECT uid FROM users WHERE clerk_id=$1", [auth.userId])
    ).rows[0];
    if (!user) {
      res.status(403).json({ error: "Pulse account required" });
      return;
    }
    res.locals.creatorUid = user.uid;
    next();
  }),
);
creator.get(
  "/withdrawals/overview",
  safe(async (_req, res) => {
    res.json(await w.overview(pool, res.locals.creatorUid));
  }),
);
creator.get(
  "/withdrawals/recipient",
  safe(async (_req, res) => {
    res.json((await w.overview(pool, res.locals.creatorUid)).recipient);
  }),
);
creator.put(
  "/withdrawals/recipient",
  safe(async (req, res) => {
    res.json(await w.saveRecipient(pool, res.locals.creatorUid, req.body));
  }),
);
creator.post(
  "/withdrawals",
  safe(async (req, res) => {
    fundingReady();
    res
      .status(201)
      .json(
        await w.requestWithdrawal(
          pool,
          res.locals.creatorUid,
          account(),
          req.body,
        ),
      );
  }),
);
creator.get(
  "/withdrawals/:id/statement",
  safe(async (req, res) => {
    const id = String(req.params.id);
    const text = await w.statement(pool, id, res.locals.creatorUid);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="pulse-withdrawal-${id.replace(/[^a-zA-Z0-9_-]/g, "")}.txt"`,
    );
    res.type("text/plain").send(text);
  }),
);
// Deprecated compatibility endpoint for older clients; no second approval is required.
creator.post(
  "/withdrawals/:id/approve-quote",
  safe(async (req, res) => {
    res.json(
      await w.approveQuote(
        pool,
        res.locals.creatorUid,
        String(req.params.id),
        req.body,
      ),
    );
  }),
);
creator.post(
  "/withdrawals/:id/recipient-correction",
  safe(async (req, res) => {
    res.json(
      await w.submitRecipientCorrection(
        pool,
        res.locals.creatorUid,
        String(req.params.id),
        req.body,
      ),
    );
  }),
);
creator.post(
  "/withdrawals/:id/cancel",
  safe(async (req, res) => {
    res.json(
      await w.cancelUnprepared(
        pool,
        res.locals.creatorUid,
        String(req.params.id),
      ),
    );
  }),
);
creator.get(
  "/withdrawals/:id",
  safe(async (req, res) => {
    res.json(
      await w.withdrawalDetail(
        pool,
        String(req.params.id),
        res.locals.creatorUid,
      ),
    );
  }),
);
// Parent mounts after the authenticated enabled-owner guard. Explicit role lists are independent
// configuration, never writable by agent credentials or self-provisioned in this router.
const requireRole =
  (role: "maker" | "checker" | "reconciler"): RequestHandler =>
  (req, res, next) => {
    const actor = res.locals.adminId;
    const ids = (process.env[`PULSE_PAYOUT_${role.toUpperCase()}_IDS`] ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (!actor || !ids.includes(actor)) {
      res
        .status(403)
        .json({ error: `Configured payout ${role} role required.` });
      return;
    }
    next();
  };
export const adminWithdrawalsRouter = Router();
adminWithdrawalsRouter.use(
  safe(async (req, res, next) => {
    if (req.method === "GET")
      await pool.query(
        "INSERT INTO admin_audit_events(actor_clerk_id,action,outcome) VALUES($1,'withdrawals.view','allowed')",
        [res.locals.adminId],
      );
    next();
  }),
);
adminWithdrawalsRouter.get(
  "/",
  safe(async (_req, res) => {
    res.json(await w.listWithdrawals(pool, account()));
  }),
);
adminWithdrawalsRouter.get(
  "/enrollment-preview",
  safe(async (req, res) => {
    const id = Number(req.query.userId);
    res.json(await w.enrollmentPreview(pool, id));
  }),
);
adminWithdrawalsRouter.post(
  "/enroll",
  safe(async (req, res) => {
    fundingReady();
    res.json(await w.enroll(pool, req.body, res.locals.adminId));
  }),
);
adminWithdrawalsRouter.post(
  "/pause",
  safe(async (req, res) => {
    res.json(await w.setPause(pool, req.body, res.locals.adminId));
  }),
);
adminWithdrawalsRouter.get(
  "/:id",
  safe(async (req, res) => {
    res.json(
      await w.adminWithdrawalDetail(pool, String(req.params.id), account()),
    );
  }),
);
adminWithdrawalsRouter.post(
  "/:id/quote",
  requireRole("maker"),
  safe(async (req, res) => {
    res.json(
      await w.recordQuote(
        pool,
        account(),
        String(req.params.id),
        req.body,
        res.locals.adminId,
      ),
    );
  }),
);
adminWithdrawalsRouter.post(
  "/:id/prepare",
  requireRole("maker"),
  safe(async (req, res) => {
    res.json(
      await w.prepare(
        pool,
        account(),
        String(req.params.id),
        req.body,
        res.locals.adminId,
      ),
    );
  }),
);
adminWithdrawalsRouter.post(
  "/:id/preparation",
  requireRole("maker"),
  safe(async (req, res) => {
    res.json(
      await w.completePreparation(
        pool,
        account(),
        String(req.params.id),
        req.body,
        res.locals.adminId,
      ),
    );
  }),
);
adminWithdrawalsRouter.post(
  "/:id/check",
  requireRole("checker"),
  safe(async (req, res) => {
    res.json(
      await w.check(
        pool,
        account(),
        String(req.params.id),
        req.body,
        res.locals.adminId,
      ),
    );
  }),
);
adminWithdrawalsRouter.post(
  "/:id/release",
  safe(async (req, res) => {
    res.json(
      await w.humanRelease(
        pool,
        account(),
        String(req.params.id),
        req.body,
        res.locals.adminId,
      ),
    );
  }),
);
adminWithdrawalsRouter.post(
  "/:id/decline",
  safe(async (req, res) => {
    res.json(
      await w.humanDecline(
        pool,
        account(),
        String(req.params.id),
        req.body,
        res.locals.adminId,
      ),
    );
  }),
);
adminWithdrawalsRouter.post(
  "/:id/unknown",
  requireRole("reconciler"),
  safe(async (req, res) => {
    res.json(
      await w.markUnknown(
        pool,
        account(),
        String(req.params.id),
        req.body,
        res.locals.adminId,
      ),
    );
  }),
);
adminWithdrawalsRouter.post(
  "/:id/reconcile",
  requireRole("reconciler"),
  safe(async (req, res) => {
    res.json(
      await w.reconcile(
        pool,
        account(),
        String(req.params.id),
        req.body,
        res.locals.adminId,
      ),
    );
  }),
);
export default creator;
