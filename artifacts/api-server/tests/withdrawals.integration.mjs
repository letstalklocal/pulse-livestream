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
  await api.approveQuote(pool, 1, id, { quoteHash: initialHash });
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
  await api.approveQuote(pool, 1, id, { quoteHash });
  await api.setPause(pool, { paused: true, reason: "test" }, "owner");
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
  await api.setPause(pool, { paused: false, reason: "test" }, "owner");
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
    /approve/,
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
  process.env.PULSE_PAYOUT_LINK_PREFIXES =
    "https://www.remitly.com/test-only-fixture/";
  await api.humanRelease(
    pool,
    "test-business",
    id,
    {
      attemptId,
      quoteHash,
      providerLink: "https://www.remitly.com/test-only-fixture/recipient",
      evidence: "Isolated human-release fixture; no payment was sent",
      releasedAt: new Date().toISOString(),
    },
    "owner",
  );
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
  await assert.rejects(
    () =>
      api.reconcile(
        pool,
        "test-business",
        id,
        { ...outcome, receiveAmount: "55000" },
        "reconciler",
      ),
    /below/,
  );
  await api.reconcile(pool, "test-business", id, outcome, "reconciler");
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
      await api.approveQuote(pool, 1, repeated.id, { quoteHash: hash });
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
  await api.approveQuote(pool, 2, failed.id, { quoteHash: fd.quote.hash });
  await api.prepare(
    pool,
    "test-business",
    failed.id,
    {
      quoteHash: fd.quote.hash,
      evidence: "Durable interrupted failure fixture",
    },
    "maker",
  );
  await api.humanDecline(
    pool,
    "test-business",
    failed.id,
    { reason: "Decline after possible provider action" },
    "owner",
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
