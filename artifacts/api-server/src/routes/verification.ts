import { Router, type Request, type Response, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db, usersTable, identityVerificationsTable as identities, verificationWebSessionsTable as sessions } from "@workspace/db";
import { decisionStatus, diditRequest, requireVerificationConfiguration, safeDiditUrl, VerificationError, verificationConfigured, verificationEnvironment, verificationOrigin, verifyDiditWebhook } from "../lib/didit";
import { verificationPage } from "../lib/verificationPage";

const router = Router();
const COOKIE = "__Secure-pulse_verification";
const PATH = "/api/verification";
export const CONSENT_VERSION = "pulse-id-18-v1";
export const PREFERENCE_VERSION = "pulse-mature-v1";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => async (req, res) => {
  res.set("Cache-Control", "no-store");
  try { await fn(req, res); } catch (error) {
    const known = error instanceof VerificationError;
    // Do not log request bodies, bearer links, provider responses, or ID information.
    if (!known) req.log?.error({ name: error instanceof Error ? error.name : "Unknown" }, "Verification request failed");
    res.status(known ? error.status : 503).json({ error: known ? error.message : "Verification is temporarily unavailable. Please try again later." });
  }
};
async function account(req: Request) {
  const userId = getAuth(req).userId;
  if (!userId) throw new VerificationError(401, "Please sign in again.");
  const [user] = await db.select({ uid: usersTable.uid }).from(usersTable).where(eq(usersTable.clerkId, userId)).limit(1);
  if (!user) throw new VerificationError(404, "Your Pulse account is not ready. Please sign in again.");
  return user.uid;
}
async function identity(uid: number) {
  await db.insert(identities).values({ userId: uid, reference: randomUUID(), environment: verificationEnvironment() }).onConflictDoNothing();
  const [row] = await db.select().from(identities).where(eq(identities.userId, uid));
  return row!;
}
function publicStatus(row: typeof identities.$inferSelect | undefined) {
  const sameEnvironment = row?.environment === verificationEnvironment();
  const isVerified = !!(sameEnvironment && row?.isVerified);
  return { isVerified, status: sameEnvironment ? row!.status : "not_started", matureContentEnabled: isVerified && !!row?.matureContentEnabled };
}
function sameOrigin(req: Request) {
  if (req.get("origin") !== verificationOrigin()) throw new VerificationError(403, "Open verification from Pulse and try again.");
}
async function browser(req: Request, mutation = false) {
  // The app's general CORS middleware is permissive; these cookie endpoints are same-origin only.
  if ((req.get("origin") && req.get("origin") !== verificationOrigin()) || ["cross-site", "same-site"].includes(req.get("sec-fetch-site") ?? ""))
    throw new VerificationError(403, "Open verification from Pulse to continue.");
  const cookie = (req.get("cookie") ?? "").split(";").map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!cookie || !/^[A-Za-z0-9_-]{43}$/.test(cookie)) throw new VerificationError(401, "Open verification from Pulse to continue.");
  const [session] = await db.select().from(sessions).where(and(eq(sessions.tokenHash, hash(cookie)), eq(sessions.kind, "browser"), gt(sessions.expiresAt, new Date()))).limit(1);
  if (!session) throw new VerificationError(401, "Your verification page has expired. Open it again from Pulse.");
  const csrf = hash(`${cookie}:csrf`);
  if (mutation) {
    sameOrigin(req);
    if (req.get("x-verification-csrf") !== csrf) throw new VerificationError(403, "Refresh the verification page and try again.");
  }
  requireVerificationConfiguration(session.userId);
  return { uid: session.userId, csrf };
}

// Refetch from Didit while holding the account row lock. Reordered callbacks cannot replay an old decision.
export async function refreshVerification(uid: number, expectedSession?: string) {
  requireVerificationConfiguration(uid);
  return db.transaction(async tx => {
    const [row] = await tx.select().from(identities).where(eq(identities.userId, uid)).for("update");
    if (!row || !row.sessionId || (expectedSession && row.sessionId !== expectedSession)) return row;
    if (row.environment !== verificationEnvironment()) throw new VerificationError(409, "Verification configuration changed. Please contact support.");
    if (!expectedSession && row.checkedAt && Date.now() - row.checkedAt.getTime() < 10_000) return row;
    const decision = await diditRequest(`session/${encodeURIComponent(row.sessionId)}/decision/`);
    if (decision.session_id !== row.sessionId || decision.workflow_id !== row.workflowId || decision.vendor_data !== row.reference)
      throw new VerificationError(502, "Verification could not be matched to this account.");
    // Some API responses omit environment. Credentials are environment-specific; when present, enforce it too.
    if (decision.environment && decision.environment !== row.environment) throw new VerificationError(502, "Verification environment mismatch.");
    const status = decisionStatus(decision);
    const verified = status === "verified";
    const [updated] = await tx.update(identities).set({
      status, isVerified: verified,
      verifiedAt: verified ? row.verifiedAt ?? new Date() : null,
      matureContentEnabled: verified ? row.matureContentEnabled : false,
      checkedAt: new Date(), updatedAt: new Date(),
    }).where(eq(identities.userId, uid)).returning();
    return updated;
  });
}

router.get("/account/verification", wrap(async (req, res) => {
  const uid = await account(req);
  const [row] = await db.select().from(identities).where(eq(identities.userId, uid));
  let available = true;
  try { requireVerificationConfiguration(uid); } catch { available = false; }
  res.json({ ...publicStatus(row), available });
}));
router.post("/account/verification/handoff", wrap(async (req, res) => {
  const uid = await account(req);
  requireVerificationConfiguration(uid);
  const ticket = token();
  await db.transaction(async tx => {
    // Lock the user to serialize issuance and bound link creation per account.
    await tx.select({ uid: usersTable.uid }).from(usersTable).where(eq(usersTable.uid, uid)).for("update");
    await tx.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(sessions).where(and(eq(sessions.userId, uid), gt(sessions.createdAt, new Date(Date.now() - 60_000))));
    if (count!.n >= 5) throw new VerificationError(429, "Please wait a minute before trying again.");
    await tx.insert(sessions).values({ tokenHash: hash(ticket), userId: uid, kind: "handoff", expiresAt: new Date(Date.now() + 120_000) });
  });
  res.json({ url: `${verificationOrigin()}${PATH}/#ticket=${ticket}` });
}));
router.get("/verification/", wrap(async (_req, res) => {
  const nonce = token();
  res.set({
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
    "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
  });
  res.type("html").send(verificationPage(nonce, process.env.PULSE_PRIVACY_URL));
}));
router.post("/verification/web/exchange", wrap(async (req, res) => {
  sameOrigin(req);
  const ticket = req.body?.ticket;
  if (typeof ticket !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new VerificationError(400, "Invalid verification link.");
  const value = token();
  await db.transaction(async tx => {
    const [used] = await tx.delete(sessions).where(and(eq(sessions.tokenHash, hash(ticket)), eq(sessions.kind, "handoff"), gt(sessions.expiresAt, new Date()))).returning();
    if (!used) throw new VerificationError(401, "Your verification link has expired or was already used. Open it again from Pulse.");
    requireVerificationConfiguration(used.userId);
    await tx.insert(sessions).values({ tokenHash: hash(value), userId: used.userId, kind: "browser", expiresAt: new Date(Date.now() + 3_600_000) });
  });
  res.cookie(COOKIE, value, { httpOnly: true, secure: true, sameSite: "lax", path: PATH, maxAge: 3_600_000 });
  res.json({ ok: true });
}));
router.get("/verification/web/status", wrap(async (req, res) => {
  const { uid, csrf } = await browser(req);
  const row = await identity(uid);
  res.json({ ...publicStatus(row), csrf, accountId: uid, environment: verificationEnvironment() });
}));
router.post("/verification/web/refresh", wrap(async (req, res) => {
  const { uid } = await browser(req, true);
  res.json(publicStatus(await refreshVerification(uid)));
}));
router.post("/verification/web/start", wrap(async (req, res) => {
  const { uid } = await browser(req, true);
  if (req.body?.consent !== true || req.body?.consentVersion !== CONSENT_VERSION) throw new VerificationError(400, "Please read and accept the verification notice first.");
  await identity(uid);
  const url = await db.transaction(async tx => {
    const [row] = await tx.select().from(identities).where(eq(identities.userId, uid)).for("update");
    if (row!.environment !== verificationEnvironment()) throw new VerificationError(409, "Verification configuration changed. Please contact support.");
    if (row!.isVerified) throw new VerificationError(409, "You are already verified.");
    if (row!.status === "review_needed") throw new VerificationError(409, "Your verification needs review. Please contact support.");
    if (row!.sessionUrl && row!.status === "pending" && Date.now() - row!.updatedAt.getTime() < 86_400_000) return safeDiditUrl(row!.sessionUrl);
    const sameDay = Date.now() - row!.attemptWindowAt.getTime() < 86_400_000;
    if (sameDay && row!.attempts >= 5) throw new VerificationError(429, "You have reached today's verification limit. Please try again tomorrow.");
    const result = await diditRequest("session/", { workflow_id: process.env.DIDIT_WORKFLOW_ID, vendor_data: row!.reference, ...(verificationEnvironment() === "sandbox" ? { sandbox_scenario: "approve" } : {}), callback: `${verificationOrigin()}${PATH}/` });
    if (typeof result.session_id !== "string" || !/^[a-zA-Z0-9-]{10,100}$/.test(result.session_id)) throw new VerificationError(502, "Invalid verification session.");
    const url = safeDiditUrl(result.url);
    await tx.update(identities).set({ sessionId: result.session_id, sessionUrl: url, workflowId: process.env.DIDIT_WORKFLOW_ID!, status: "pending", isVerified: false, matureContentEnabled: false, verifiedAt: null, consentAt: new Date(), consentVersion: CONSENT_VERSION, checkedAt: null, attempts: sameDay ? row!.attempts + 1 : 1, attemptWindowAt: sameDay ? row!.attemptWindowAt : new Date(), updatedAt: new Date() }).where(eq(identities.userId, uid));
    return url;
  });
  res.json({ url });
}));
router.post("/verification/web/preference", wrap(async (req, res) => {
  const { uid } = await browser(req, true);
  if (typeof req.body?.enabled !== "boolean" || req.body?.version !== PREFERENCE_VERSION) throw new VerificationError(400, "Choose whether to show mature content.");
  const [row] = await db.update(identities).set({ matureContentEnabled: req.body.enabled, preferenceUpdatedAt: new Date(), preferenceVersion: PREFERENCE_VERSION, updatedAt: new Date() }).where(and(eq(identities.userId, uid), eq(identities.isVerified, true), eq(identities.environment, verificationEnvironment()))).returning();
  if (!row) throw new VerificationError(403, "Complete age verification first.");
  res.json(publicStatus(row));
}));

export const diditWebhook = wrap(async (req, res) => {
  if (!verificationConfigured()) throw new VerificationError(503, "Verification is not configured.");
  const raw = req.body;
  if (!Buffer.isBuffer(raw) || !verifyDiditWebhook(raw, req.get("x-signature-v2"), req.get("x-signature"), req.get("x-timestamp"), process.env.DIDIT_WEBHOOK_SECRET!)) throw new VerificationError(401, "Invalid webhook signature.");
  const event = JSON.parse(raw.toString("utf8"));
  if (!["status.updated", "data.updated"].includes(event.webhook_type)) return void res.json({ received: true });
  if (typeof event.session_id !== "string") throw new VerificationError(400, "Missing session.");
  const [row] = await db.select().from(identities).where(eq(identities.sessionId, event.session_id)).limit(1);
  // A callback may beat create-session persistence. Retry unknown sessions instead of granting anything.
  if (!row) throw new VerificationError(404, "Session not found.");
  if (event.environment && event.environment !== row.environment) throw new VerificationError(400, "Environment mismatch.");
  await refreshVerification(row.userId, event.session_id);
  res.json({ received: true });
});
export default router;
