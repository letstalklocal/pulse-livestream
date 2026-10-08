import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "pulse-withdrawals-"));
const output = join(root, "tests", `.withdrawals-${randomUUID()}.cjs`);
let pool,
  server,
  started = false;
try {
  execFileSync(
    "initdb",
    [
      "-D",
      join(tmp, "data"),
      "-A",
      "trust",
      "-U",
      "withdraw_test",
      "--no-locale",
    ],
    { stdio: "pipe" },
  );
  execFileSync(
    "pg_ctl",
    [
      "-D",
      join(tmp, "data"),
      "-l",
      join(tmp, "postgres.log"),
      "-o",
      `-k ${tmp} -h '' -p 5432`,
      "-w",
      "start",
    ],
    { stdio: "pipe" },
  );
  started = true;
  process.env.DATABASE_URL = `postgresql://withdraw_test@localhost/postgres?host=${encodeURIComponent(tmp)}`;
  process.env.NODE_ENV = "test";
  await build({
    stdin: {
      contents: `import express from 'express';import creator,{adminWithdrawalsRouter} from './src/routes/withdrawals';import {adminGuard} from './src/routes/admin';export * from './src/lib/creatorWithdrawals';export {importResearch} from './src/lib/payoutCatalog';export {pool} from '@workspace/db';export {GetWithdrawalOverviewResponse,GetWithdrawalDetailResponse,GetAdminWithdrawalDetailResponse,ListAdminWithdrawalsResponse,PreviewWithdrawalEnrollmentResponse,EnrollWithdrawalCreatorResponse} from '@workspace/api-zod';export function testApp(){const app=express();app.use(express.json());app.use((req,res,next)=>{req.auth=()=>({userId:req.get('x-test-user')||null,sessionId:req.get('x-test-user')?'test-session':null,sessionClaims:req.get('x-test-mfa')?{fva:[0,0]}:{},tokenType:'session_token'});next();});app.use(creator);app.use('/admin',adminGuard,adminWithdrawalsRouter);return app;}`,
      resolveDir: root,
    },
    outfile: output,
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["pg-native"],
    logLevel: "silent",
  });
  const api = createRequire(import.meta.url)(output);
  pool = api.pool;
  await pool.query(
    "CREATE TABLE users(uid integer PRIMARY KEY,name text,clerk_id text); CREATE TABLE coin_transactions(id serial PRIMARY KEY,from_user_id integer,to_user_id integer,amount integer,type text,description text NOT NULL DEFAULT '',idempotency_key text UNIQUE,balance_after integer,created_at timestamptz DEFAULT now()); CREATE TABLE coin_balances(user_id integer PRIMARY KEY,balance integer NOT NULL DEFAULT 0,updated_at timestamptz DEFAULT now())",
  );
  for (const m of [
    "20260913_admin_access.sql",
    "20261004_payout_catalog.sql",
    "20261004_creator_withdrawals.sql",
    "20261005_withdrawal_repeat_limits.sql",
  ])
    await pool.query(
      readFileSync(join(root, "../../lib/db/migrations", m), "utf8"),
    );
  await pool.query(
    "INSERT INTO users VALUES(1,'Creator','creator'),(2,'Gifter','gifter'),(3,'Other','other'); INSERT INTO coin_balances(user_id,balance) VALUES(1,10000),(2,10000),(3,0);INSERT INTO coin_transactions(from_user_id,to_user_id,amount,type) VALUES(2,1,10000,'gift'),(NULL,1,100000,'grant'),(1,1,50000,'gift')",
  );
  process.env.PULSE_PAYOUT_CATALOG_ACCOUNT = "test-business";
  await pool.query(
    "INSERT INTO admin_staff(clerk_user_id,role) VALUES('owner','owner'),('checker','owner')",
  );
  server = api.testApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (
    path,
    { user = "creator", bearer = true, method = "GET", body, mfa = false } = {},
  ) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        ...(user ? { "x-test-user": user } : {}),
        ...(bearer ? { authorization: "Bearer private-test-token" } : {}),
        ...(mfa ? { "x-test-mfa": "yes" } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: await r.json() };
  };
  assert.equal(
    (await call("/withdrawals/overview", { user: null })).status,
    401,
  );
  assert.equal(
    (await call("/withdrawals/overview", { bearer: false })).status,
    401,
  );
  assert.equal((await call("/admin", { user: "creator" })).status, 403);
  assert.equal((await call("/admin", { user: null })).status, 401);
  assert.equal(
    (
      await call("/admin/missing/quote", {
        user: "owner",
        method: "POST",
        body: {},
      })
    ).status,
    403,
  );
  process.env.PULSE_PAYOUT_MAKER_IDS = "owner";
  assert.equal(
    (
      await call("/admin/missing/quote", {
        user: "checker",
        method: "POST",
        body: {},
      })
    ).status,
    403,
  );
  process.env.NODE_ENV = "production";
  assert.equal((await call("/admin", { user: "owner" })).status, 200);
  assert.equal((await call("/admin", { user: "creator" })).status, 403);
  assert.equal((await call("/admin", { user: null })).status, 401);
  assert.equal(
    (await call("/admin", { user: "owner", bearer: false })).status,
    401,
  );
  await pool.query(
    "UPDATE admin_staff SET enabled=false WHERE clerk_user_id='owner'",
  );
  assert.equal((await call("/admin", { user: "owner" })).status, 403);
  await pool.query(
    "UPDATE admin_staff SET enabled=true WHERE clerk_user_id='owner'",
  );
  process.env.NODE_ENV = "test";
  assert.equal(
    (
      await call("/withdrawals", {
        method: "POST",
        body: {
          methodId: "unavailable",
          withdrawalCents: 1500,
          idempotencyKey: "blocked",
        },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/admin/enroll", {
        user: "owner",
        method: "POST",
        body: {
          userId: 1,
          expectedGiftTicks: "10000",
          holdDays: 0,
          reason: "blocked",
        },
      })
    ).status,
    400,
  );
  console.log(
    "PASS creator bearer auth, authenticated enabled admin owner and distinct configured operator roles",
  );
  const research = JSON.parse(
    readFileSync(
      join(root, "src/config/remitly-research-20261004.json"),
      "utf8",
    ),
  );
  await api.importResearch(pool, research, "test-business", "owner");
  const method = (
    await pool.query(
      "SELECT m.id FROM payout_catalog_methods m JOIN payout_catalog_countries c ON c.id=m.country_id WHERE c.country_code='CO' AND m.code='bre_b'",
    )
  ).rows[0].id;
  const preview = await api.enrollmentPreview(pool, 1);
  api.PreviewWithdrawalEnrollmentResponse.parse(preview);
  api.GetWithdrawalOverviewResponse.parse(
    (await call("/withdrawals/overview")).body,
  );
  assert.equal(preview.walletCoins, "10000");
  assert.equal(preview.availableUsd, "25.0000");
  assert.equal(
    (
      await call("/admin/enroll", {
        user: "owner",
        method: "POST",
        body: { userId: 1, expectedWalletCoins: "9999", reason: "stale" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("/admin/enroll", {
        user: "owner",
        method: "POST",
        body: {
          userId: 1,
          expectedWalletCoins: preview.walletCoins,
          reason: "Explicit isolated wallet enrollment",
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=1"))
      .rows[0].balance,
    10000,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer count FROM creator_cash_ledger",
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (await pool.query("SELECT count(*)::integer count FROM coin_transactions"))
      .rows[0].count,
    3,
  );
  assert.equal(
    (
      await call("/admin/enroll", {
        user: "owner",
        method: "POST",
        body: { userId: 1, expectedWalletCoins: "10000", reason: "duplicate" },
      })
    ).status,
    409,
  );
  await pool.query(
    "UPDATE creator_cash_accounts SET enabled=false WHERE user_id=1",
  );
  const reenablePreview = await api.enrollmentPreview(pool, 1);
  assert.equal(
    reenablePreview.alreadyEnrolled,
    false,
    "disabled access can be enabled again",
  );
  await api.enroll(
    pool,
    {
      userId: 1,
      expectedWalletCoins: reenablePreview.walletCoins,
      reason: "Enabled from the user directory.",
    },
    "owner",
  );
  const reenabled = (
    await pool.query("SELECT * FROM creator_cash_accounts WHERE user_id=1")
  ).rows[0];
  assert.equal(reenabled.enabled, true);
  assert.equal(reenabled.repeat_allowed, true);
  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=1"))
      .rows[0].balance,
    10000,
    "reenabling does not mint or deduct coins",
  );
  await api.saveRecipient(pool, 1, {
    legalFirstName: "Test",
    legalLastName: "Recipient",
    countryCode: "CO",
    email: "recipient@example.com",
    phone: "+573001234567",
  });
  const make = (key) =>
    api.requestWithdrawal(pool, 1, "test-business", {
      methodId: method,
      withdrawalCents: 1500,
      idempotencyKey: key,
    });
  const httpBatch = await Promise.all(
    Array.from({ length: 4 }, () =>
      call("/withdrawals", {
        method: "POST",
        body: {
          methodId: method,
          withdrawalCents: 1500,
          idempotencyKey: "request-one",
        },
      }),
    ),
  );
  assert.ok(httpBatch.every((r) => r.status === 201));
  const batch = httpBatch.map((r) => r.body);
  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=1"))
      .rows[0].balance,
    4000,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer count FROM coin_transactions WHERE type='withdrawal_hold'",
      )
    ).rows[0].count,
    1,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer count FROM coin_transactions WHERE type IN('gift','grant')",
      )
    ).rows[0].count,
    3,
  );

  assert.equal(new Set(batch.map((w) => w.id)).size, 1);
  const id = batch[0].id;
  api.GetWithdrawalOverviewResponse.parse(
    (await call("/withdrawals/overview")).body,
  );
  api.GetWithdrawalDetailResponse.parse(
    (await call("/withdrawals/" + id)).body,
  );
  api.ListAdminWithdrawalsResponse.parse(
    (await call("/admin", { user: "owner" })).body,
  );
  api.GetAdminWithdrawalDetailResponse.parse(
    (await call("/admin/" + id, { user: "owner" })).body,
  );
  assert.equal(
    (await call("/withdrawals/" + id + "/statement", { user: "other" })).status,
    404,
  );

  await assert.rejects(() => make("other"), /unresolved/);
  assert.equal((await api.overview(pool, 1)).balances.reservedTicks, "6000");
  await assert.rejects(() => api.withdrawalDetail(pool, id, 3), /not found/);
  await assert.rejects(
    () =>
      api.requestWithdrawal(pool, 1, "test-business", {
        methodId: method,
        withdrawalCents: 1501,
        idempotencyKey: "too-large",
      }),
    /15/,
  );
  console.log(
    "PASS atomic reservation, concurrency, idempotency, gross cap and ownership",
  );
  const quote = {
    methodId: method,
    sendAmountCents: 1401,
    feeCents: 99,
    taxCents: 0,
    promotionalDiscountCents: 0,
    receiveAmount: "56000.00",
    receiveCurrency: "COP",
    fundingMethod: "debit_card",
    providerMinimumSendCents: 1000,
    source: "signed_in_remitly_business",
    sourceUrl: "https://www.remitly.com/us/en/transfer/send",
    observedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    evidence:
      "Isolated fixture quote, not provider observation\nMultiline evidence retained",
  };
  await assert.rejects(
    () => api.recordQuote(pool, "other-business", id, quote, "maker"),
    /not found/,
  );
  let detail = await api.recordQuote(pool, "test-business", id, quote, "maker");
  const initialHash = detail.quote.hash;
  assert.equal(detail.status, "requested");
  assert.equal(detail.approvedQuoteHash, null);
  assert.equal(
    detail.history.some((e) => e.action === "quote_approved"),
    false,
  );
  for (const invalidQuote of [
    { methodId: "wrong-method" },
    { receiveCurrency: "USD" },
    { fundingMethod: "bank_account" },
    { providerMinimumSendCents: 1500 },
    { expiresAt: new Date(Date.now() - 1000).toISOString() },
  ])
    await assert.rejects(() =>
      api.recordQuote(
        pool,
        "test-business",
        id,
        { ...quote, ...invalidQuote },
        "maker",
      ),
    );
  detail = await api.recordQuote(
    pool,
    "test-business",
    id,
    { ...quote, evidence: "Changed isolated evidence" },
    "maker",
  );
  await assert.rejects(
    () => api.approveQuote(pool, 1, id, { quoteHash: initialHash }),
    /changed/,
  );
  const quoteHash = detail.quote.hash;
  assert.equal(detail.status, "requested");
  assert.equal(detail.approvedQuoteHash, null);
  await assert.rejects(
    () =>
      api.prepare(
        pool,
        "test-business",
        id,
        { quoteHash: initialHash, evidence: "Stale pre-refresh binding" },
        "maker",
      ),
    /Current matching provider quote/,
  );
  await pool.query(
    "UPDATE creator_withdrawals SET quote=jsonb_set(quote,'{expiresAt}',to_jsonb($2::text)) WHERE id=$1",
    [id, new Date(Date.now() - 1000).toISOString()],
  );
  await assert.rejects(
    () =>
      api.prepare(
        pool,
        "test-business",
        id,
        { quoteHash, evidence: "Expired quote cannot prepare" },
        "maker",
      ),
    /Current matching provider quote/,
  );
  await pool.query("UPDATE creator_withdrawals SET quote=$2 WHERE id=$1", [
    id,
    JSON.stringify(detail.quote),
  ]);
  await pool.query("DELETE FROM creator_payout_settings WHERE id=1");
  assert.equal(
    (await call("/admin", { user: "owner" })).body.preparationPaused,
    true,
    "missing settings must report paused",
  );
  await assert.rejects(
    () =>
      api.prepare(
        pool,
        "test-business",
        id,
        { quoteHash, evidence: "Missing singleton fail-closed check" },
        "maker",
      ),
    /paused/,
  );
  assert.equal(
    (
      await call("/admin/pause", {
        user: "owner",
        method: "POST",
        body: { paused: false, reason: "" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer count FROM creator_payout_settings",
      )
    ).rows[0].count,
    0,
  );
  const auditBeforePause = Number(
    (
      await pool.query(
        "SELECT count(*) FROM creator_payout_events WHERE action='preparation_pause'",
      )
    ).rows[0].count,
  );
  const persistPause = async (paused) => {
    const response = await call("/admin/pause", {
      user: "owner",
      method: "POST",
      body: {
        paused,
        reason: paused ? "Pause for review" : "Resume after review",
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.preparationPaused, paused);
    assert.deepEqual(
      (
        await pool.query(
          "SELECT id,preparation_paused FROM creator_payout_settings",
        )
      ).rows,
      [{ id: 1, preparation_paused: paused }],
    );
    assert.equal(
      (await call("/admin", { user: "owner" })).body.preparationPaused,
      paused,
      "reloaded queue must reflect persisted pause setting",
    );
    const audit = (
      await pool.query(
        "SELECT actor,evidence FROM creator_payout_events WHERE action='preparation_pause' ORDER BY id DESC LIMIT 1",
      )
    ).rows[0];
    assert.equal(audit.actor, "owner");
    assert.equal(audit.evidence.paused, paused);
  };
  await persistPause(false);
  await persistPause(true);
  await assert.rejects(
    () =>
      api.prepare(
        pool,
        "test-business",
        id,
        { quoteHash, evidence: "test" },
        "maker",
      ),
    /paused/,
  );
  await persistPause(false);
  await persistPause(false);
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM creator_payout_events WHERE action='preparation_pause'",
        )
      ).rows[0].count,
    ),
    auditBeforePause + 4,
    "every accepted pause decision is audited",
  );
  detail = await api.prepare(
    pool,
    "test-business",
    id,
    { quoteHash, evidence: "Test durable attempt before possible action" },
    "maker",
  );
  const attemptId = detail.attemptId;
  await assert.rejects(
    () =>
      api.prepare(
        pool,
        "test-business",
        id,
        { quoteHash, evidence: "test" },
        "maker",
      ),
    (error) => error.status === 409,
  );
  process.env.PULSE_PAYOUT_LINK_PREFIXES =
    "https://www.remitly.com/test-only-fixture/";
  await assert.rejects(
    () =>
      api.completePreparation(
        pool,
        "test-business",
        id,
        {
          attemptId,
          quoteHash,
          draftId: "recorded-draft",
          reviewUrl:
            "https://www.remitly.com/test-only-fixture/review?scheduledDraftId=other-draft",
          deadline: new Date(Date.now() + 1800000).toISOString(),
          oneTime: true,
          autoSend: false,
          recipientMatches: true,
          amountsMatch: true,
          historyInspected: true,
          historyCoverage: "Private fixture",
          evidence: "Mismatched scheduled draft evidence",
          kind: "scheduled",
        },
        "maker",
      ),
    /scheduledDraftId/,
  );
  await api.completePreparation(
    pool,
    "test-business",
    id,
    {
      attemptId,
      quoteHash,
      deadline: new Date(Date.now() + 1800000).toISOString(),
      oneTime: true,
      autoSend: false,
      recipientMatches: true,
      amountsMatch: true,
      historyInspected: true,
      historyCoverage: "Private fixture has one attempt",
      evidence: "Isolated plan only",
      kind: "first_time_link",
    },
    "maker",
  );
  const checks = {
    attemptId,
    quoteHash,
    recipientMatches: true,
    amountsMatch: true,
    reservationMatches: true,
    historyInspected: true,
    historyCoverage: "Independent fixture history",
    oneTime: true,
    autoSend: false,
    evidence: "Independent test check",
  };
  await assert.rejects(
    () => api.check(pool, "test-business", id, checks, "maker"),
    /different operator/,
  );
  await assert.rejects(() =>
    api.check(
      pool,
      "test-business",
      id,
      { ...checks, quoteHash: initialHash },
      "checker",
    ),
  );
  await assert.rejects(
    () => api.recordQuote(pool, "test-business", id, quote, "maker"),
    /after preparation/,
  );
  await api.check(pool, "test-business", id, checks, "checker");
  await assert.rejects(
    () =>
      api.humanRelease(
        pool,
        "test-business",
        id,
        {
          attemptId,
          quoteHash,
          providerLink: "https://evil.example/link",
          evidence: "test",
          releasedAt: new Date().toISOString(),
        },
        "owner",
      ),
    /not verified/,
  );
  delete process.env.PULSE_PAYOUT_LINK_PREFIXES;
  const beforeEmailRelease = await api.overview(pool, 1);
  const emailedRelease = await api.humanRelease(
    pool,
    "test-business",
    id,
    {
      attemptId,
      quoteHash,
      evidence:
        "Isolated human-release fixture: provider emails recipient directly; no payment was sent",
      releasedAt: new Date().toISOString(),
    },
    "owner",
  );
  assert.equal(emailedRelease.status, "awaiting_recipient");
  assert.equal(emailedRelease.providerOnboardingStatus, "pending");
  assert.equal(emailedRelease.providerLink, null);
  assert.deepEqual(
    (await api.overview(pool, 1)).balances,
    beforeEmailRelease.balances,
    "email-only first-time release keeps wallet and reservation unchanged",
  );
  assert.equal(
    (
      await pool.query(
        "SELECT provider_reference FROM creator_payout_attempts WHERE id=$1",
        [attemptId],
      )
    ).rows[0].provider_reference,
    null,
  );
  process.env.PULSE_PAYOUT_LINK_PREFIXES =
    "https://www.remitly.com/test-only-fixture/";
  assert.equal(
    (await api.withdrawalDetail(pool, id, 1)).checker.actor,
    undefined,
  );
  console.log(
    "PASS quote invalidation, pause, durable attempt, maker/checker separation, URL controls and evidence privacy",
  );
  await api.humanDecline(
    pool,
    "test-business",
    id,
    {
      reason:
        "Human decline after actual provider attempt: investigate cancellation",
    },
    "owner",
  );
  assert.equal((await api.withdrawalDetail(pool, id, 1)).status, "unknown");
  const issueBalances = (await api.overview(pool, 1)).balances;
  const privateProviderReason =
    "Provider internal validation code with private contact evidence: do not expose this marker";
  const issueInput = {
    code: "recipient_validation_failed",
    fields: ["email", "phone"],
  };
  for (const recipientIssue of [
    null,
    { code: "arbitrary_error", fields: ["phone"] },
    { code: "recipient_validation_failed", fields: [] },
    { code: "recipient_validation_failed", fields: ["phone", "phone"] },
    { code: "recipient_validation_failed", fields: ["bank_account"] },
    { ...issueInput, message: privateProviderReason },
  ])
    await assert.rejects(
      () =>
        api.markUnknown(
          pool,
          "test-business",
          id,
          { reason: privateProviderReason, recipientIssue },
          "reconciler",
        ),
      (error) => error.status === 400,
    );
  let issueDetail = await api.markUnknown(
    pool,
    "test-business",
    id,
    { reason: privateProviderReason, recipientIssue: issueInput },
    "reconciler",
  );
  assert.deepEqual(issueDetail.recipientIssue.fields, ["phone", "email"]);
  assert.equal(issueDetail.recipientIssue.code, "recipient_validation_failed");
  assert.match(
    issueDetail.recipientIssue.message,
    /phone number, email address/,
  );
  assert(!JSON.stringify(issueDetail).includes(privateProviderReason));
  assert.equal(issueDetail.creatorStatus, "error");
  assert.equal(
    issueDetail.status,
    "unknown",
    "financial state remains uncertain",
  );
  assert.equal(issueDetail.errorMessage, issueDetail.recipientIssue.message);
  for (const badCorrection of [
    {},
    { phone: "3001234567" },
    { email: "invalid-email" },
    { phone: "+12" },
    { phone: "+12025550123", countryCode: "US" },
  ])
    assert.equal(
      (
        await call(`/withdrawals/${id}/recipient-correction`, {
          method: "POST",
          body: badCorrection,
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await call(`/withdrawals/${id}/recipient-correction`, {
        user: "other",
        method: "POST",
        body: { phone: "+12025550123" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call(`/withdrawals/${id}/recipient-correction`, {
        user: null,
        method: "POST",
        body: { phone: "+12025550123" },
      })
    ).status,
    401,
  );
  const originalErrorRecipient = issueDetail.recipient;
  const originalErrorVersion = issueDetail.version;
  const correctionBody = {
    phone: "+12025550123",
    email: "corrected-recipient@example.com",
  };
  const pendingResponse = await call(
    `/withdrawals/${id}/recipient-correction`,
    { method: "POST", body: correctionBody },
  );
  assert.equal(
    pendingResponse.status,
    200,
    "international syntax accepted without country restrictions",
  );
  const pending = pendingResponse.body;
  assert.deepEqual(
    pending.recipient,
    originalErrorRecipient,
    "pending edits never alter active recipient snapshot",
  );
  assert.equal(pending.status, "unknown");
  assert.equal(pending.creatorStatus, "error");
  assert.equal(pending.version, originalErrorVersion);
  assert.equal(pending.recipientCorrection.phone, correctionBody.phone);
  assert.equal(pending.recipientCorrection.email, correctionBody.email);
  assert.equal(pending.recipientCorrection.hash.length, 64);
  api.GetWithdrawalDetailResponse.parse(pending);
  const correctionAuditCount = Number(
    (
      await pool.query(
        "SELECT count(*) FROM creator_payout_events WHERE withdrawal_id=$1 AND action='recipient_correction_submitted'",
        [id],
      )
    ).rows[0].count,
  );
  assert.deepEqual(
    (
      await call(`/withdrawals/${id}/recipient-correction`, {
        method: "POST",
        body: correctionBody,
      })
    ).body,
    pending,
  );
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM creator_payout_events WHERE withdrawal_id=$1 AND action='recipient_correction_submitted'",
          [id],
        )
      ).rows[0].count,
    ),
    correctionAuditCount,
  );
  assert.deepEqual(
    (await api.overview(pool, 1)).withdrawals.find((w) => w.id === id)
      .recipientCorrection,
    pending.recipientCorrection,
  );
  assert.deepEqual((await api.overview(pool, 1)).balances, issueBalances);
  assert.equal(
    (await api.overview(pool, 1)).recipient.phone,
    originalErrorRecipient.phone,
  );
  await assert.rejects(
    () =>
      api.prepare(
        pool,
        "test-business",
        id,
        { quoteHash, evidence: "Correction cannot unlock attempt" },
        "maker",
      ),
    (error) => error.status === 409,
  );
  api.GetWithdrawalDetailResponse.parse(issueDetail);
  assert.deepEqual(
    (await api.overview(pool, 1)).withdrawals.find((w) => w.id === id)
      .recipientIssue,
    issueDetail.recipientIssue,
  );
  assert.deepEqual(
    (await api.listWithdrawals(pool, "test-business")).withdrawals.find(
      (w) => w.id === id,
    ).recipientIssue,
    issueDetail.recipientIssue,
  );
  assert.deepEqual((await api.overview(pool, 1)).balances, issueBalances);
  assert.equal(
    (await call(`/withdrawals/${id}`, { user: "other" })).status,
    404,
  );
  const adminIssueDetail = await api.adminWithdrawalDetail(
    pool,
    id,
    "test-business",
  );
  assert(
    adminIssueDetail.events.some(
      (e) => e.evidence?.reason === privateProviderReason,
    ),
  );
  issueDetail = await api.markUnknown(
    pool,
    "test-business",
    id,
    {
      reason:
        "Historical unstructured reason says phone rejected; must remain generic",
    },
    "reconciler",
  );
  assert.equal(
    issueDetail.recipientIssue,
    null,
    "generic uncertainty supersedes earlier validation errors",
  );
  assert.equal(issueDetail.creatorStatus, "unknown");
  assert.equal(issueDetail.errorMessage, null);
  assert.equal(
    issueDetail.recipientCorrection,
    null,
    "generic superseding error invalidates pending correction",
  );
  await assert.rejects(
    () => api.submitRecipientCorrection(pool, 1, id, correctionBody),
    (error) => error.status === 409,
  );
  assert.equal(
    (await api.overview(pool, 1)).withdrawals.find((w) => w.id === id)
      .recipientIssue,
    null,
  );
  issueDetail = await api.markUnknown(
    pool,
    "test-business",
    id,
    {
      reason: "Reviewed explicit rejection",
      status: "expired",
      recipientIssue: {
        code: "recipient_validation_failed",
        fields: ["name", "other"],
      },
    },
    "reconciler",
  );
  assert.deepEqual(issueDetail.recipientIssue.fields, ["name", "other"]);
  await assert.rejects(
    () => api.submitRecipientCorrection(pool, 1, id, correctionBody),
    (error) => error.status === 409,
  );
  assert.deepEqual((await api.overview(pool, 1)).balances, issueBalances);

  await assert.rejects(
    () =>
      api.humanRelease(
        pool,
        "test-business",
        id,
        {
          attemptId,
          quoteHash,
          providerLink: "https://www.remitly.com/test-only-fixture/recipient",
          evidence: "blocked",
          releasedAt: new Date().toISOString(),
        },
        "owner",
      ),
    /independent check/,
  );
  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=1"))
      .rows[0].balance,
    4000,
  );

  await assert.rejects(() => make("retry"), /unresolved/);
  assert.equal((await api.overview(pool, 1)).balances.reservedTicks, "6000");
  const outcome = {
    observationId: "observation-one",
    status: "delivered",
    providerStatus: "Delivered",
    providerReference: "private-test-reference",
    sourceUrl: quote.sourceUrl,
    observedAt: new Date().toISOString(),
    recipientMatches: true,
    methodId: method,
    sendAmountCents: 1401,
    feeCents: 89,
    taxCents: 0,
    receiveAmount: "56000.00",
    receiveCurrency: "COP",
    fundingReturned: false,
    recipientReady: true,
    evidence: "Isolated delivered fixture; no external payment",
  };
  await assert.rejects(
    () =>
      api.reconcile(
        pool,
        "test-business",
        id,
        { ...outcome, feeCents: 100 },
        "reconciler",
      ),
    /violate/,
  );
  for (const invalidActual of [
    { receiveAmount: "0" },
    { receiveAmount: "-1" },
    { receiveCurrency: "USD" },
    { sendAmountCents: 1402 },
    { taxCents: 1 },
  ])
    await assert.rejects(() =>
      api.reconcile(
        pool,
        "test-business",
        id,
        { ...outcome, ...invalidActual },
        "reconciler",
      ),
    );
  // A genuine historical exact approval retains its old receive floor.
  await pool.query(
    "UPDATE creator_withdrawals SET approved_quote_hash=quote->>'hash' WHERE id=$1",
    [id],
  );
  await assert.rejects(
    () =>
      api.reconcile(
        pool,
        "test-business",
        id,
        { ...outcome, receiveAmount: "55000" },
        "reconciler",
      ),
    /legacy creator-approved/,
  );
  await pool.query(
    "UPDATE creator_withdrawals SET approved_quote_hash=NULL WHERE id=$1",
    [id],
  );
  outcome.receiveAmount = "55000";
  await api.reconcile(pool, "test-business", id, outcome, "reconciler");
  assert.equal(
    (await api.withdrawalDetail(pool, id, 1)).recipientIssue,
    null,
    "resolved provider evidence clears creator validation alert",
  );
  assert.equal(
    (
      await pool.query(
        "SELECT provider_reference FROM creator_payout_attempts WHERE id=$1",
        [attemptId],
      )
    ).rows[0].provider_reference,
    outcome.providerReference,
    "first reconciliation binds the emailed transfer's discovered reference",
  );
  await assert.rejects(
    () =>
      api.reconcile(
        pool,
        "test-business",
        id,
        {
          ...outcome,
          observationId: "changed-email-transfer-reference",
          providerReference: "different-private-reference",
          observedAt: new Date(Date.now() + 1000).toISOString(),
        },
        "reconciler",
      ),
    /reference differs/,
  );

  await api.reconcile(pool, "test-business", id, outcome, "reconciler");
  await api.reconcile(
    pool,
    "test-business",
    id,
    Object.fromEntries(Object.entries(outcome).reverse()),
    "reconciler",
  );
  const overview = await api.overview(pool, 1);
  api.GetWithdrawalOverviewResponse.parse(overview);
  assert.throws(() =>
    api.GetWithdrawalOverviewResponse.parse({
      ...overview,
      balances: { ...overview.balances, availableCoins: "1.5" },
    }),
  );
  api.GetWithdrawalDetailResponse.parse(
    await api.withdrawalDetail(pool, id, 1),
  );
  api.GetAdminWithdrawalDetailResponse.parse(
    await api.adminWithdrawalDetail(pool, id, "test-business"),
  );
  assert.equal(overview.balances.reservedTicks, "0");
  assert.equal(overview.balances.availableTicks, "4040");
  await assert.rejects(() => make("repeat"), /Later withdrawals/);
  await assert.rejects(
    () =>
      api.reconcile(
        pool,
        "test-business",
        id,
        { ...outcome, observationId: "regression", status: "processing" },
        "reconciler",
      ),
    /cannot regress/,
  );
  assert.match(await api.statement(pool, id, 1), /private-test-reference/);
  assert.doesNotMatch(
    await api.statement(pool, id, 1),
    /Creator approved current quote/,
  );
  assert.match(await api.statement(pool, id, 1), /Estimated recipient amount/);
  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=1"))
      .rows[0].balance,
    4040,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer count FROM coin_transactions WHERE type='withdrawal_release'",
      )
    ).rows[0].count,
    1,
  );
  const later = {
    ...outcome,
    observationId: "delivery-refresh",
    observedAt: new Date(Date.now() + 1000).toISOString(),
  };
  await api.reconcile(pool, "test-business", id, later, "reconciler");
  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=1"))
      .rows[0].balance,
    4040,
  );
  await api.reconcile(
    pool,
    "test-business",
    id,
    {
      ...outcome,
      observationId: "return",
      status: "returned",
      fundingReturned: true,
      observedAt: new Date(Date.now() + 2000).toISOString(),
    },
    "reconciler",
  );
  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=1"))
      .rows[0].balance,
    10000,
  );
  for (const amount of [1500, 2499, 50001]) {
    await assert.rejects(
      () =>
        api.requestWithdrawal(pool, 1, "test-business", {
          methodId: method,
          withdrawalCents: amount,
          idempotencyKey: `invalid-repeat-${amount}`,
        }),
      /Later withdrawals|Invalid withdrawal amount/,
    );
  }
  await pool.query("UPDATE coin_balances SET balance=210000 WHERE user_id=1");
  for (const amount of [2500, 50000]) {
    const input = {
      methodId: method,
      withdrawalCents: amount,
      idempotencyKey: `valid-repeat-${amount}`,
    };
    const repeated = await api.requestWithdrawal(
      pool,
      1,
      "test-business",
      input,
    );
    api.GetWithdrawalDetailResponse.parse(
      await api.withdrawalDetail(pool, repeated.id, 1),
    );
    assert.equal(repeated.grossCents, amount);
    assert.equal(
      (await api.overview(pool, 1)).balances.reservedTicks,
      String(amount * 4),
    );
    assert.equal(
      (await api.requestWithdrawal(pool, 1, "test-business", input)).id,
      repeated.id,
    );
    await assert.rejects(
      () =>
        api.recordQuote(
          pool,
          "test-business",
          repeated.id,
          { ...quote, sendAmountCents: amount, feeCents: 99 },
          "maker",
        ),
      /fit the requested gross/,
    );
    const quoted = await api.recordQuote(
      pool,
      "test-business",
      repeated.id,
      { ...quote, sendAmountCents: amount - 99, feeCents: 99 },
      "maker",
    );
    if (amount === 50000) {
      const hash = quoted.quote.hash;
      assert.equal(quoted.status, "requested");
      assert.equal(quoted.approvedQuoteHash, null);
      const prepared = await api.prepare(
        pool,
        "test-business",
        repeated.id,
        { quoteHash: hash, evidence: "Maximum withdrawal isolated test" },
        "maker",
      );
      await api.completePreparation(
        pool,
        "test-business",
        repeated.id,
        {
          attemptId: prepared.attemptId,
          quoteHash: hash,
          deadline: new Date(Date.now() + 1800000).toISOString(),
          oneTime: true,
          autoSend: false,
          recipientMatches: true,
          amountsMatch: true,
          historyInspected: true,
          historyCoverage: "Isolated maximum fixture",
          evidence: "No external payment",
          kind: "first_time_link",
        },
        "maker",
      );
      await api.check(
        pool,
        "test-business",
        repeated.id,
        { ...checks, attemptId: prepared.attemptId, quoteHash: hash },
        "checker",
      );
      await api.humanRelease(
        pool,
        "test-business",
        repeated.id,
        {
          attemptId: prepared.attemptId,
          quoteHash: hash,
          providerLink: "https://www.remitly.com/test-only-fixture/maximum",
          evidence: "Isolated test only",
          releasedAt: new Date().toISOString(),
        },
        "owner",
      );
      const settled = {
        ...outcome,
        observationId: "maximum-delivery",
        providerReference: "maximum-private-reference",
        sendAmountCents: amount - 99,
        feeCents: 89,
        observedAt: new Date().toISOString(),
      };
      await api.reconcile(
        pool,
        "test-business",
        repeated.id,
        settled,
        "reconciler",
      );
      assert.equal(
        (await api.overview(pool, 1)).balances.availableTicks,
        "10040",
        "maximum reservation refunds exactly unused fee",
      );
      await api.reconcile(
        pool,
        "test-business",
        repeated.id,
        settled,
        "reconciler",
      );
      await api.reconcile(
        pool,
        "test-business",
        repeated.id,
        {
          ...settled,
          observationId: "maximum-return",
          status: "returned",
          fundingReturned: true,
          observedAt: new Date(
            Date.parse(settled.observedAt) + 1000,
          ).toISOString(),
        },
        "reconciler",
      );
    } else await api.cancelUnprepared(pool, 1, repeated.id);
    assert.equal((await api.overview(pool, 1)).balances.reservedTicks, "0");
    assert.equal(
      (await api.overview(pool, 1)).balances.availableTicks,
      "210000",
    );
  }
  await pool.query("UPDATE coin_balances SET balance=10000 WHERE user_id=1");

  console.log(
    "PASS lower-cost wallet refund and subsequent authoritative return restore exactly original coins",
  );

  // No received gifts exist for uid2. Purchases and grants are equally redeemable.
  await pool.query(
    "INSERT INTO coin_transactions(to_user_id,amount,type) VALUES(2,6000,'purchase'),(2,4001,'grant');UPDATE coin_balances SET balance=10001 WHERE user_id=2",
  );
  const p2 = await api.enrollmentPreview(pool, 2);
  assert.equal(p2.walletCoins, "10001");
  assert.equal(p2.availableUsd, "25.0025");
  await api.enroll(
    pool,
    {
      userId: 2,
      expectedWalletCoins: p2.walletCoins,
      reason: "All wallet sources approved",
    },
    "owner",
  );
  await api.saveRecipient(pool, 2, {
    legalFirstName: "Purchased",
    legalLastName: "Coins",
    countryCode: "CO",
    email: "bought@example.com",
    phone: "+573001234568",
  });
  const request2 = (key) =>
    api.requestWithdrawal(pool, 2, "test-business", {
      methodId: method,
      withdrawalCents: 1500,
      idempotencyKey: key,
    });
  const concurrent = await Promise.allSettled([
    request2("race-wallet"),
    pool.query(
      "UPDATE coin_balances SET balance=balance-5000 WHERE user_id=2 AND balance>=5000 RETURNING balance",
    ),
  ]);
  const withdrew = concurrent[0].status === "fulfilled";
  const spent =
    concurrent[1].status === "fulfilled" && concurrent[1].value.rowCount === 1;
  assert.equal(Number(withdrew) + Number(spent), 1);
  if (withdrew) {
    await api.humanDecline(
      pool,
      "test-business",
      concurrent[0].value.id,
      { reason: "Human decline before provider preparation" },
      "owner",
    );
    await api.humanDecline(
      pool,
      "test-business",
      concurrent[0].value.id,
      { reason: "Idempotent repeated decline" },
      "owner",
    );
  } else
    await pool.query("UPDATE coin_balances SET balance=10001 WHERE user_id=2");
  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=2"))
      .rows[0].balance,
    10001,
  );
  const cancel = await request2("cancel-before-attempt");
  await api.cancelUnprepared(pool, 2, cancel.id);
  await api.cancelUnprepared(pool, 2, cancel.id);
  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=2"))
      .rows[0].balance,
    10001,
  );
  console.log(
    "PASS bought/granted coins, exact quarter-cent balances, concurrent wallet spend exclusion and idempotent pre-attempt cancellation/decline refunds",
  );
  const failed = await request2("failed-provider");
  let fd = await api.recordQuote(
    pool,
    "test-business",
    failed.id,
    quote,
    "maker",
  );
  // Older app versions can still acknowledge a saved quote, without making it
  // an exact creator approval or imposing its expiry on the creator.
  await pool.query(
    "UPDATE creator_withdrawals SET status='awaiting_confirmation' WHERE id=$1",
    [failed.id],
  );
  assert.equal(
    (
      await call(`/withdrawals/${failed.id}/approve-quote`, {
        user: "creator",
        method: "POST",
        body: { quoteHash: fd.quote.hash },
      })
    ).status,
    404,
  );
  const acknowledged = await api.approveQuote(pool, 2, failed.id, {
    quoteHash: fd.quote.hash,
  });
  assert.equal(acknowledged.status, "requested");
  assert.equal(acknowledged.approvedQuoteHash, null);
  assert.deepEqual(
    await api.approveQuote(pool, 2, failed.id, { quoteHash: fd.quote.hash }),
    acknowledged,
  );
  assert.equal(
    acknowledged.history.some((e) => e.action === "quote_approved"),
    false,
  );
  const rejectedContactAttempt = await api.prepare(
    pool,
    "test-business",
    failed.id,
    {
      quoteHash: fd.quote.hash,
      evidence: "Durable interrupted failure fixture",
    },
    "maker",
  );
  await api.markUnknown(
    pool,
    "test-business",
    failed.id,
    {
      reason: "Provider rejects old phone before any transfer",
      recipientIssue: {
        code: "recipient_validation_failed",
        fields: ["phone"],
      },
    },
    "reconciler",
  );
  assert.equal(
    (await call(`/admin/${failed.id}`, { user: "owner" })).body
      .canResolveRecipientError,
    false,
  );
  const beforeAdminCorrection = await api.withdrawalDetail(pool, failed.id, 2);
  assert.equal(
    (
      await call(`/admin/${failed.id}/recipient-correction`, {
        user: null,
        method: "POST",
        body: { phone: "+12025550123" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call(`/admin/${failed.id}/recipient-correction`, {
        user: "creator",
        method: "POST",
        body: { phone: "+12025550123" },
      })
    ).status,
    403,
  );
  await assert.rejects(
    () =>
      api.submitAdminRecipientCorrection(
        pool,
        "other-business",
        failed.id,
        { phone: "+12025550123" },
        "owner",
      ),
    (error) => error.status === 404,
  );
  const adminPendingResponse = await call(
    `/admin/${failed.id}/recipient-correction`,
    {
      user: "owner",
      method: "POST",
      body: { phone: "+12025550123", email: "operator-corrected@example.com" },
    },
  );
  assert.equal(adminPendingResponse.status, 200);
  assert.deepEqual(
    adminPendingResponse.body.recipient,
    beforeAdminCorrection.recipient,
  );
  assert.equal(
    adminPendingResponse.body.version,
    beforeAdminCorrection.version,
  );
  assert.deepEqual(
    adminPendingResponse.body.quote,
    beforeAdminCorrection.quote,
  );
  assert.equal(adminPendingResponse.body.status, "unknown");
  assert.equal(
    (
      await api.adminWithdrawalDetail(pool, failed.id, "test-business")
    ).events.findLast((e) => e.action === "recipient_correction_submitted")
      .actor,
    "owner",
  );
  const recipientRecovery = {
    attemptId: rejectedContactAttempt.attemptId,
    correctionHash: adminPendingResponse.body.recipientCorrection.hash,
    observationId: "contact-recipientRecovery-one",
    sourceUrl: quote.sourceUrl,
    observedAt: new Date().toISOString(),
    evidence:
      "Private fixture: recipient record absent, closed draft verified and no payment/link/funding effects; corrected details ready for fresh preparation",
    historyCoverage:
      "All provider draft, contact, pending and sent fixtures inspected",
    historyInspected: true,
    recipientRecordInspected: true,
    recipientCorrectionApplied: true,
    noRecipientLinkIssued: true,
    noFundsSent: true,
    noFundingDebit: true,
    noPendingTransfers: true,
    noUnknownTransfers: true,
    previousDraftClosed: true,
  };
  const recoveryBalances = (await api.overview(pool, 2)).balances;
  let ledgerBeforeRecovery = (
    await pool.query(
      "SELECT * FROM creator_cash_ledger WHERE user_id=2 ORDER BY id",
    )
  ).rows;
  const walletEventsBeforeRecovery = (
    await pool.query(
      "SELECT * FROM coin_transactions WHERE from_user_id=2 OR to_user_id=2 ORDER BY id",
    )
  ).rows;
  assert.equal(
    (
      await call(`/admin/${failed.id}/resolve-recipient-error`, {
        user: "owner",
        method: "POST",
        body: recipientRecovery,
      })
    ).status,
    403,
  );
  process.env.PULSE_PAYOUT_RECONCILER_IDS = "owner";
  assert.equal(
    (await call(`/admin/${failed.id}`, { user: "owner" })).body
      .canResolveRecipientError,
    true,
  );
  assert.equal(
    (await call("/admin", { user: "owner" })).body.canResolveRecipientError,
    true,
  );
  for (const flag of [
    "historyInspected",
    "recipientRecordInspected",
    "recipientCorrectionApplied",
    "noRecipientLinkIssued",
    "noFundsSent",
    "noFundingDebit",
    "noPendingTransfers",
    "noUnknownTransfers",
    "previousDraftClosed",
  ]) {
    assert.equal(
      (
        await call(`/admin/${failed.id}/resolve-recipient-error`, {
          user: "owner",
          method: "POST",
          body: { ...recipientRecovery, [flag]: false },
        })
      ).status,
      409,
    );
  }
  const noLinkFlag = { ...recipientRecovery };
  delete noLinkFlag.noRecipientLinkIssued;
  assert.equal(
    (
      await call(`/admin/${failed.id}/resolve-recipient-error`, {
        user: "owner",
        method: "POST",
        body: noLinkFlag,
      })
    ).status,
    409,
  );
  await assert.rejects(
    () =>
      api.resolveRecipientError(
        pool,
        "other-business",
        failed.id,
        recipientRecovery,
        "reconciler",
      ),
    (error) => error.status === 404,
  );
  await assert.rejects(
    () =>
      api.resolveRecipientError(
        pool,
        "test-business",
        failed.id,
        { ...recipientRecovery, correctionHash: "stale-correction" },
        "reconciler",
      ),
    (error) => error.status === 409,
  );
  await assert.rejects(
    () =>
      api.resolveRecipientError(
        pool,
        "test-business",
        failed.id,
        { ...recipientRecovery, attemptId: "old-attempt" },
        "reconciler",
      ),
    (error) => error.status === 409,
  );
  await assert.rejects(
    () =>
      api.resolveRecipientError(
        pool,
        "test-business",
        failed.id,
        {
          ...recipientRecovery,
          observedAt: new Date(Date.now() - 90000000).toISOString(),
        },
        "reconciler",
      ),
    (error) => error.status === 409,
  );
  await pool.query(
    "UPDATE creator_payout_attempts SET provider_reference='private-conflicting-reference' WHERE id=$1",
    [recipientRecovery.attemptId],
  );
  await assert.rejects(
    () =>
      api.resolveRecipientError(
        pool,
        "test-business",
        failed.id,
        recipientRecovery,
        "reconciler",
      ),
    /provider activity/,
  );
  await pool.query(
    "UPDATE creator_payout_attempts SET provider_reference=NULL WHERE id=$1",
    [recipientRecovery.attemptId],
  );
  await pool.query(
    "UPDATE creator_payout_attempts SET evidence=evidence || '{\"recipientLinkIssued\":true}'::jsonb WHERE id=$1",
    [recipientRecovery.attemptId],
  );
  await assert.rejects(
    () =>
      api.resolveRecipientError(
        pool,
        "test-business",
        failed.id,
        recipientRecovery,
        "reconciler",
      ),
    /provider activity/,
  );
  await pool.query(
    "UPDATE creator_payout_attempts SET evidence=evidence-'recipientLinkIssued' WHERE id=$1",
    [recipientRecovery.attemptId],
  );
  await pool.query(
    "INSERT INTO creator_cash_ledger(user_id,kind,source_ref,reserved_ticks,withdrawal_id,actor,reason) VALUES(2,'adjustment','private-recipientRecovery-missing',-6000,$1,'fixture','Missing target reserve'),(2,'adjustment','private-recipientRecovery-other',6000,'different-private-withdrawal','fixture','Other reservation cannot mask missing target')",
    [failed.id],
  );
  assert.deepEqual(
    (await api.overview(pool, 2)).balances,
    recoveryBalances,
    "aggregate reserve remains unchanged while exact request reserve is missing",
  );
  await assert.rejects(
    () =>
      api.resolveRecipientError(
        pool,
        "test-business",
        failed.id,
        recipientRecovery,
        "reconciler",
      ),
    /Exact withdrawal reservation/,
  );
  await pool.query(
    "INSERT INTO creator_cash_ledger(user_id,kind,source_ref,reserved_ticks,withdrawal_id,actor,reason) VALUES(2,'adjustment','private-recipientRecovery-restored',6000,$1,'fixture','Restore target fixture reserve'),(2,'adjustment','private-recipientRecovery-other-cleared',-6000,'different-private-withdrawal','fixture','Restore fixture baseline')",
    [failed.id],
  );
  ledgerBeforeRecovery = (
    await pool.query(
      "SELECT * FROM creator_cash_ledger WHERE user_id=2 ORDER BY id",
    )
  ).rows;
  await api.markUnknown(
    pool,
    "test-business",
    failed.id,
    {
      reason: "Mixed provider rejection",
      recipientIssue: {
        code: "recipient_validation_failed",
        fields: ["phone", "name"],
      },
    },
    "reconciler",
  );
  const mixedCorrection = await api.submitAdminRecipientCorrection(
    pool,
    "test-business",
    failed.id,
    { phone: "+12025550123", email: "operator-corrected@example.com" },
    "owner",
  );
  await assert.rejects(
    () =>
      api.resolveRecipientError(
        pool,
        "test-business",
        failed.id,
        {
          ...recipientRecovery,
          correctionHash: mixedCorrection.recipientCorrection.hash,
          observedAt: new Date().toISOString(),
        },
        "reconciler",
      ),
    (error) => error.status === 409,
  );
  await api.markUnknown(
    pool,
    "test-business",
    failed.id,
    { reason: "New generic uncertainty supersedes error" },
    "reconciler",
  );
  await assert.rejects(
    () =>
      api.resolveRecipientError(
        pool,
        "test-business",
        failed.id,
        recipientRecovery,
        "reconciler",
      ),
    (error) => error.status === 409,
  );
  await api.markUnknown(
    pool,
    "test-business",
    failed.id,
    {
      reason: "Reverified only phone rejection",
      recipientIssue: {
        code: "recipient_validation_failed",
        fields: ["phone"],
      },
    },
    "reconciler",
  );
  const latestCorrection = await api.submitAdminRecipientCorrection(
    pool,
    "test-business",
    failed.id,
    { phone: "+12025550123", email: "operator-corrected@example.com" },
    "owner",
  );
  recipientRecovery.correctionHash = latestCorrection.recipientCorrection.hash;
  recipientRecovery.observedAt = new Date().toISOString();
  await assert.rejects(
    () =>
      api.resolveRecipientError(
        pool,
        "test-business",
        failed.id,
        {
          ...recipientRecovery,
          observedAt: new Date(
            Date.parse(latestCorrection.recipientCorrection.requestedAt) - 1,
          ).toISOString(),
        },
        "reconciler",
      ),
    /latest correction/,
  );
  await pool.query(
    "UPDATE creator_payout_attempts SET draft_id='private-definitively-closed-draft' WHERE id=$1",
    [recipientRecovery.attemptId],
  );
  const recoveredResponse = await call(
    `/admin/${failed.id}/resolve-recipient-error`,
    { user: "owner", method: "POST", body: recipientRecovery },
  );
  assert.equal(recoveredResponse.status, 200);
  const recovered = recoveredResponse.body;
  assert.equal(recovered.id, failed.id);
  assert.equal(recovered.status, "awaiting_quote");
  assert.equal(recovered.creatorStatus, "awaiting_quote");
  assert.equal(recovered.version, beforeAdminCorrection.version + 1);
  assert.equal(recovered.recipient.phone, "+12025550123");
  assert.equal(recovered.recipient.email, "operator-corrected@example.com");
  assert.equal(
    recovered.recipient.revision,
    beforeAdminCorrection.recipient.revision + 1,
  );
  assert.equal(recovered.quote, null);
  assert.equal(recovered.checker, null);
  assert.equal(recovered.approvedQuoteHash, null);
  assert.equal(recovered.recipientIssue, null);
  assert.equal(recovered.recipientCorrection, null);
  assert.equal(recovered.errorMessage, null);
  assert.deepEqual((await api.overview(pool, 2)).balances, recoveryBalances);
  assert.deepEqual(
    (
      await pool.query(
        "SELECT * FROM creator_cash_ledger WHERE user_id=2 ORDER BY id",
      )
    ).rows,
    ledgerBeforeRecovery,
  );
  assert.deepEqual(
    (
      await pool.query(
        "SELECT * FROM coin_transactions WHERE from_user_id=2 OR to_user_id=2 ORDER BY id",
      )
    ).rows,
    walletEventsBeforeRecovery,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT state FROM creator_payout_attempts WHERE id=$1",
        [recipientRecovery.attemptId],
      )
    ).rows[0].state,
    "canceled",
  );
  assert.equal(
    (
      await pool.query(
        "SELECT draft_id FROM creator_payout_attempts WHERE id=$1",
        [recipientRecovery.attemptId],
      )
    ).rows[0].draft_id,
    "private-definitively-closed-draft",
  );
  assert.deepEqual(
    await api.resolveRecipientError(
      pool,
      "test-business",
      failed.id,
      recipientRecovery,
      "reconciler",
    ),
    await api.withdrawalDetail(pool, failed.id, 2),
  );
  await assert.rejects(
    () =>
      api.resolveRecipientError(
        pool,
        "test-business",
        failed.id,
        {
          ...recipientRecovery,
          evidence: "Different evidence with same observation",
        },
        "reconciler",
      ),
    (error) => error.status === 409,
  );
  await assert.rejects(
    () =>
      api.resolveRecipientError(
        pool,
        "test-business",
        failed.id,
        {
          ...recipientRecovery,
          observationId: "stale-second-recipientRecovery",
        },
        "reconciler",
      ),
    (error) => error.status === 409,
  );
  await assert.rejects(
    () =>
      api.prepare(
        pool,
        "test-business",
        failed.id,
        { quoteHash: fd.quote.hash, evidence: "Old quote cannot resume" },
        "maker",
      ),
    (error) => error.status === 409,
  );
  const freshCorrectedQuote = await api.recordQuote(
    pool,
    "test-business",
    failed.id,
    {
      ...quote,
      observedAt: new Date().toISOString(),
      evidence: "Fresh quote for corrected recipient",
    },
    "maker",
  );
  const freshCorrectedAttempt = await api.prepare(
    pool,
    "test-business",
    failed.id,
    {
      quoteHash: freshCorrectedQuote.quote.hash,
      evidence: "Fresh durable attempt after verified recipientRecovery",
    },
    "maker",
  );
  assert.notEqual(freshCorrectedAttempt.attemptId, recipientRecovery.attemptId);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer count FROM creator_payout_attempts WHERE withdrawal_id=$1",
        [failed.id],
      )
    ).rows[0].count,
    2,
  );
  console.log(
    "PASS admin/creator pending contacts and independently verified recipient recovery preserve the same reserved withdrawal and invalidate every old quote/check/attempt",
  );
  await api.humanDecline(
    pool,
    "test-business",
    failed.id,
    { reason: "Decline after possible provider action" },
    "owner",
  );
  await api.markUnknown(
    pool,
    "test-business",
    failed.id,
    {
      reason: "Phone rejection remains after human decline",
      recipientIssue: {
        code: "recipient_validation_failed",
        fields: ["phone"],
      },
    },
    "reconciler",
  );
  const declinedCorrection = await api.submitRecipientCorrection(
    pool,
    2,
    failed.id,
    { phone: "+12025550124" },
  );
  await assert.rejects(
    () =>
      api.resolveRecipientError(
        pool,
        "test-business",
        failed.id,
        {
          ...recipientRecovery,
          attemptId: freshCorrectedAttempt.attemptId,
          correctionHash: declinedCorrection.recipientCorrection.hash,
          observationId: "cannot-undo-human-decline",
          observedAt: new Date().toISOString(),
        },
        "reconciler",
      ),
    /Recorded human decision/,
  );
  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=2"))
      .rows[0].balance,
    4001,
  );
  const failure = {
    ...outcome,
    observationId: "failed-provider-outcome",
    status: "failed",
    providerStatus: "Failed",
    providerReference: "private-failed-reference",
    feeCents: 99,
    fundingReturned: false,
    observedAt: new Date().toISOString(),
  };
  await assert.rejects(
    () =>
      api.reconcile(pool, "test-business", failed.id, failure, "reconciler"),
    /funding return/,
  );
  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=2"))
      .rows[0].balance,
    4001,
  );
  const verifiedFailure = { ...failure, fundingReturned: true };
  await api.reconcile(
    pool,
    "test-business",
    failed.id,
    verifiedFailure,
    "reconciler",
  );
  await api.reconcile(
    pool,
    "test-business",
    failed.id,
    verifiedFailure,
    "reconciler",
  );
  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=2"))
      .rows[0].balance,
    10001,
  );
  const recovery = await request2("failure-does-not-consume-first-success");
  await api.cancelUnprepared(pool, 2, recovery.id);
  console.log(
    "PASS attempted human decline retains coins until authoritative full funding return; failure refunds once and preserves first-success eligibility",
  );

  await assert.rejects(
    () => pool.query("DELETE FROM creator_cash_ledger"),
    /append-only/,
  );
  await assert.rejects(
    () => pool.query("UPDATE creator_payout_events SET actor='fake'"),
    /append-only/,
  );
  console.log(
    "PASS unknown blocks retry, actual-cost settlement/unused release, reconciliation idempotency, quote bounds, first-success policy, statement and append-only history",
  );
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
  if (started)
    execFileSync(
      "pg_ctl",
      ["-D", join(tmp, "data"), "-m", "immediate", "-w", "stop"],
      { stdio: "pipe" },
    );
  rmSync(output, { force: true });
  rmSync(tmp, { recursive: true, force: true });
}
