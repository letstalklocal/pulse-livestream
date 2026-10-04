import { Router, type RequestHandler } from "express";
import { pool } from "@workspace/db";
import { catalogAccountKey } from "./payout-catalog";
import * as p from "../lib/payoutOperators";
import * as w from "../lib/creatorWithdrawals";
import preflight from "@workspace/payout-mcp/playbooks/preflight.json";
import maker from "@workspace/payout-mcp/playbooks/maker.json";
import checker from "@workspace/payout-mcp/playbooks/checker.json";
import reconciler from "@workspace/payout-mcp/playbooks/reconciler.json";
import recover from "@workspace/payout-mcp/playbooks/recover.json";
const account = () => {
  const a = catalogAccountKey();
  if (!a) throw new p.OperatorError("Payout account is not configured.", 503);
  return a;
};
const safe =
  (fn: RequestHandler): RequestHandler =>
  async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      await fn(req, res, next);
    } catch (error) {
      if (
        error instanceof p.OperatorError ||
        error instanceof w.WithdrawalError
      ) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      const code =
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : undefined;
      req.log?.error(
        { category: "payout_operator", code },
        "Payout operator operation failed",
      );
      res.status(code === "23505" ? 409 : 503).json({
        error:
          code === "23505"
            ? "Conflicting payout or lease identifier; reload and investigate."
            : "Payout operator service is temporarily unavailable.",
      });
    }
  };
const op = (res: { locals: Record<string, any> }) =>
  res.locals.payoutOperator as p.Operator;
const operatorRouter = Router();
// Must be mounted before Clerk middleware: these are opaque scoped service keys,
// not Clerk session tokens. Unknown actions terminate here and cannot reach admin.
operatorRouter.use(
  safe(async (req, res, next) => {
    res.locals.payoutOperator = await p.authenticateOperator(
      pool,
      req.get("authorization"),
      account(),
    );
    await p.operatorAudit(pool, op(res), "request.authenticated", null, {
      method: req.method,
    });
    next();
  }),
);
operatorRouter.get(
  "/identity",
  safe(async (_req, res) => {
    res.json(await p.identity(pool, op(res)));
  }),
);
operatorRouter.get(
  "/withdrawals",
  safe(async (req, res) => {
    if (Object.keys(req.query).some((k) => k !== "limit"))
      throw new p.OperatorError("Unsupported list query.");
    res.json(await p.operatorWithdrawals(pool, op(res), req.query.limit));
  }),
);
operatorRouter.get(
  "/withdrawals/:id",
  safe(async (req, res) => {
    res.json(await p.operatorDetail(pool, op(res), String(req.params.id)));
  }),
);
const playbooks = { preflight, maker, checker, reconciler, recover };
operatorRouter.get(
  "/playbooks/:name",
  safe(async (req, res) => {
    const name = String(req.params.name);
    if (!Object.hasOwn(playbooks, name))
      throw new p.OperatorError("Playbook not found.", 404);
    const playbook = playbooks[name as keyof typeof playbooks];
    if (playbook.role !== "all" && playbook.role !== op(res).role)
      throw new p.OperatorError(
        "This playbook is outside the operator role.",
        403,
      );
    if (
      playbook.version !== p.PLAYBOOK_VERSION ||
      playbook.humanFinalDecisionRequired !== true ||
      playbook.autoSendAllowed !== false
    )
      throw new p.OperatorError(
        "Playbook version or human controls do not match backend policy.",
        503,
      );
    await p.operatorAudit(pool, op(res), "playbook.read", name);
    res.json(playbook);
  }),
);
operatorRouter.post(
  "/browser-lease/acquire",
  safe(async (req, res) => {
    res.json(await p.acquireBrowserLease(pool, op(res), req.body));
  }),
);
operatorRouter.post(
  "/browser-lease/renew",
  safe(async (req, res) => {
    res.json(await p.renewBrowserLease(pool, op(res), req.body));
  }),
);
operatorRouter.post(
  "/browser-lease/release",
  safe(async (req, res) => {
    res.json(await p.releaseBrowserLease(pool, op(res), req.body));
  }),
);
operatorRouter.post(
  "/heartbeat",
  safe(async (req, res) => {
    res.json(await p.heartbeat(pool, op(res), req.body));
  }),
);
const actions = {
  quote: { roles: ["maker"], fn: w.recordQuote },
  prepare: { roles: ["maker"], fn: w.prepare },
  preparation: { roles: ["maker"], fn: w.completePreparation },
  check: { roles: ["checker"], fn: w.check },
  reconcile: { roles: ["reconciler"], fn: w.reconcile },
} as const;
for (const [action, config] of Object.entries(actions))
  operatorRouter.post(
    `/withdrawals/:id/${action}`,
    safe(async (req, res) => {
      const operator = op(res);
      p.requireOperatorRole(operator, [...config.roles]);
      const b = p.strictObject(req.body, ["leaseId", "data"]);
      res.json(
        await p.withBrowserLease(
          pool,
          operator,
          b.leaseId,
          `withdrawal.${action}`,
          String(req.params.id),
          (db) =>
            config.fn(
              db,
              operator.accountKey,
              String(req.params.id),
              b.data,
              operator.actor,
            ),
        ),
      );
    }),
  );
operatorRouter.post(
  "/withdrawals/:id/unknown",
  safe(async (req, res) => {
    const operator = op(res);
    p.requireOperatorRole(operator, ["maker", "reconciler"]);
    const b = p.strictObject(req.body, ["data"]);
    res.json(
      await w.markUnknown(
        pool,
        operator.accountKey,
        String(req.params.id),
        b.data,
        operator.actor,
      ),
    );
    await p.operatorAudit(
      pool,
      operator,
      "withdrawal.unknown",
      String(req.params.id),
    );
  }),
);
for (const [action, fn] of [
  ["renew", w.renewPreparationLease],
  ["release", w.releasePreparationLease],
] as const)
  operatorRouter.post(
    `/withdrawals/:id/lease/${action}`,
    safe(async (req, res) => {
      const operator = op(res);
      p.requireOperatorRole(operator, ["maker"]);
      const b = p.strictObject(req.body, ["leaseId", "data"]);
      res.json(
        await p.withBrowserLease(
          pool,
          operator,
          b.leaseId,
          `preparation.lease.${action}`,
          String(req.params.id),
          (db) =>
            fn(
              db,
              operator.accountKey,
              String(req.params.id),
              b.data,
              operator.actor,
            ),
        ),
      );
    }),
  );
operatorRouter.use((_req, res) => {
  res
    .status(404)
    .json({ error: "No operator capability is available at this path." });
});
export const adminPayoutOperatorsRouter = Router();
adminPayoutOperatorsRouter.get(
  "/",
  safe(async (_req, res) => {
    res.json(await p.listCredentials(pool, account(), res.locals.adminId));
  }),
);
adminPayoutOperatorsRouter.post(
  "/issue",
  safe(async (req, res) => {
    res
      .status(201)
      .json(
        await p.issueCredential(pool, account(), req.body, res.locals.adminId),
      );
  }),
);
adminPayoutOperatorsRouter.post(
  "/:id/revoke",
  safe(async (req, res) => {
    if (
      req.body !== undefined &&
      Object.keys(p.strictObject(req.body, [])).length
    )
      throw new p.OperatorError("Revoke accepts no body fields.");
    res.json(
      await p.revokeCredential(
        pool,
        account(),
        String(req.params.id),
        res.locals.adminId,
      ),
    );
  }),
);
export default operatorRouter;
