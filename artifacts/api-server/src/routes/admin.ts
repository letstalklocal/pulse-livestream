import { readAdminOverview } from "../lib/adminOverview";
import { Router, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import { verificationEnvironment } from "../lib/didit";

export function adminAuthConfig() {
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY ?? "";
  if (!/^pk_(test|live)_[A-Za-z0-9_-]+$/.test(publishableKey))
    throw new Error("Clerk unavailable");
  const host = Buffer.from(
    publishableKey.replace(/^pk_(test|live)_/, ""),
    "base64",
  )
    .toString()
    .replace(/\$$/, "");
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || !host.includes("."))
    throw new Error("Clerk unavailable");
  return { publishableKey, frontendApi: `https://${host}` };
}
const environment = () =>
  process.env.NODE_ENV === "production" ? "production" : "development";
const providerEnvironment = verificationEnvironment;
const guard: RequestHandler = async (req, res, next) => {
  try {
    // Admin accepts explicit session bearer tokens, never ambient mobile/web cookies.
    if (!/^Bearer \S+$/i.test(req.get("authorization") ?? ""))
      return void res.status(401).json({ error: "Sign in to Pulse admin." });
    const auth = getAuth(req);
    if (!auth.userId || !auth.sessionId)
      return void res.status(401).json({ error: "Sign in to Pulse admin." });
    const staff = await pool.query(
      "SELECT role FROM admin_staff WHERE clerk_user_id=$1 AND enabled=true",
      [auth.userId],
    );
    if (staff.rows[0]?.role !== "owner") {
      await pool.query(
        "INSERT INTO admin_audit_events(actor_clerk_id,action,outcome) VALUES($1,'access','denied')",
        [auth.userId],
      );
      return void res
        .status(403)
        .json({ error: "This account does not have admin access." });
    }
    // This gate applies only to admin routes; no global Clerk/mobile MFA changes.
    const factorAge = (auth.sessionClaims as { fva?: number[] } | null)
      ?.fva?.[1];
    if (
      environment() === "production" &&
      !(typeof factorAge === "number" && factorAge >= 0)
    ) {
      return void res.status(403).json({
        error:
          "Admin access requires a sign-in with a second factor in production.",
      });
    }
    res.locals.adminId = auth.userId;
    next();
  } catch {
    res.status(503).json({
      error: "Admin access is temporarily unavailable. Please retry.",
    });
  }
};
const router = Router();
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
router.get("/config", (_req, res) => {
  try {
    res.json(adminAuthConfig());
  } catch {
    res.status(503).json({ error: "Admin sign-in is not configured." });
  }
});
router.use(guard);
const safe =
  (fn: RequestHandler): RequestHandler =>
  async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch {
      res.status(503).json({
        error: "Admin data is temporarily unavailable. Please retry.",
      });
    }
  };
async function audit(
  actor: string,
  action: string,
  target: string | null = null,
) {
  await pool.query(
    "INSERT INTO admin_audit_events(actor_clerk_id,action,target,outcome) VALUES($1,$2,$3,'allowed')",
    [actor, action, target],
  );
}
router.get(
  "/session",
  safe(async (_req, res) => {
    await audit(res.locals.adminId, "session.view");
    res.json({ role: "owner", environment: environment() });
  }),
);
router.get(
  "/overview",
  safe(async (req, res) => {
    if (Object.keys(req.query).length)
      return void res
        .status(400)
        .json({
          error:
            "Overview uses the last seven UTC dates; query parameters are not supported.",
        });
    const overview = await readAdminOverview();
    await audit(res.locals.adminId, "overview.view");
    res.json(overview);
  }),
);

// Explicit field allowlist; do not select provider sessions, documents, preferences or money.
const fields = `u.uid,u.name,u.country_code,u.created_at,
  COALESCE(v.status,'not_started') AS status,COALESCE(v.is_verified,false) AS is_verified,
  v.verification_type,COALESCE(v.upgrade_status,'not_started') AS upgrade_status`;
const from = `FROM users u LEFT JOIN identity_verifications v ON v.user_id=u.uid AND v.environment=$1`;
function serialize(row: Record<string, any>) {
  return {
    uid: row.uid,
    name: row.name,
    countryCode: row.country_code,
    createdAt: row.created_at,
    verification: {
      status: row.status,
      isVerified: row.is_verified,
      method: row.is_verified ? (row.verification_type ?? null) : null,
      upgradeStatus: row.upgrade_status,
      environment: providerEnvironment(),
    },
  };
}
router.get(
  "/users",
  safe(async (req, res) => {
    const { q = "", status = "all", limit = "20", cursor } = req.query;
    if (
      Object.keys(req.query).some(
        (key) => !["q", "status", "limit", "cursor"].includes(key),
      ) ||
      typeof q !== "string" ||
      q.length > 100 ||
      typeof status !== "string" ||
      !["all", "verified", "pending", "unverified"].includes(status) ||
      typeof limit !== "string" ||
      !/^\d+$/.test(limit) ||
      Number(limit) < 1 ||
      Number(limit) > 50 ||
      (cursor !== undefined &&
        (typeof cursor !== "string" || cursor.length > 300))
    ) {
      return void res
        .status(400)
        .json({ error: "Invalid search, filter, or page size." });
    }
    const values: unknown[] = [providerEnvironment()];
    const where: string[] = [];
    const bind = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    const term = q.trim();
    if (term) {
      const p = bind(term.replace(/[\\%_]/g, "\\$&"));
      where.push(`(u.name ILIKE '%' || ${p} || '%' OR u.uid::text = ${p})`);
    }
    if (status === "verified") where.push("COALESCE(v.is_verified,false)=true");
    if (status === "pending")
      where.push(
        "COALESCE(v.is_verified,false)=false AND v.status IN ('pending','in_progress','review_needed','id_required')",
      );
    if (status === "unverified")
      where.push("COALESCE(v.is_verified,false)=false");
    if (cursor) {
      try {
        const c = JSON.parse(
          Buffer.from(cursor as string, "base64url").toString(),
        );
        if (
          typeof c.date !== "string" ||
          !/^\d{4}-\d{2}-\d{2}T/.test(c.date) ||
          !Number.isFinite(Date.parse(c.date)) ||
          !Number.isInteger(c.uid) ||
          c.uid < 1 ||
          c.uid > 2147483647
        )
          throw new Error();
        where.push(
          `(u.created_at,u.uid)<(${bind(c.date)}::timestamp,${bind(c.uid)}::integer)`,
        );
      } catch {
        return void res.status(400).json({ error: "Invalid page cursor." });
      }
    }
    const result = await pool.query(
      `SELECT ${fields},to_char(u.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US') AS cursor_date ${from} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY u.created_at DESC,u.uid DESC LIMIT ${bind(Number(limit) + 1)}`,
      values,
    );
    const more = result.rows.length > Number(limit),
      rows = result.rows.slice(0, Number(limit)),
      last = rows.at(-1);
    await audit(res.locals.adminId, "users.list");
    res.json({
      users: rows.map(serialize),
      nextCursor:
        more && last
          ? Buffer.from(
              JSON.stringify({ date: last.cursor_date, uid: last.uid }),
            ).toString("base64url")
          : null,
      asOf: new Date().toISOString(),
      environment: environment(),
    });
  }),
);
router.get(
  "/users/:uid",
  safe(async (req, res) => {
    const uid = Number(req.params.uid);
    if (
      !/^\d+$/.test(String(req.params.uid)) ||
      !Number.isInteger(uid) ||
      uid < 1 ||
      uid > 2147483647
    )
      return void res.status(400).json({ error: "Invalid account ID." });
    const result = await pool.query(`SELECT ${fields} ${from} WHERE u.uid=$2`, [
      providerEnvironment(),
      uid,
    ]);
    if (!result.rows[0])
      return void res.status(404).json({ error: "Account not found." });
    await audit(res.locals.adminId, "users.view", String(uid));
    res.json(serialize(result.rows[0]));
  }),
);
export default router;
