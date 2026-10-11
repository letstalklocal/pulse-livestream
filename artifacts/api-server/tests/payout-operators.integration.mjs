import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import {
  runMcpIntegration,
  runMakerRetryMcp,
  callMakerPreparationMcp,
  connectMakerPreparationMcp,
} from "./payout-mcp.real-service.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "pulse-operators-"));
const output = join(root, "tests", `.operators-${randomUUID()}.cjs`);
let pool,
  server,
  preparationClient,
  started = false;
try {
  execFileSync(
    "initdb",
    [
      "-D",
      join(temporary, "data"),
      "-A",
      "trust",
      "-U",
      "operator_test",
      "--no-locale",
    ],
    { stdio: "pipe" },
  );
  execFileSync(
    "pg_ctl",
    [
      "-D",
      join(temporary, "data"),
      "-l",
      join(temporary, "postgres.log"),
      "-o",
      `-k ${temporary} -h '' -p 5432`,
      "-w",
      "start",
    ],
    { stdio: "pipe" },
  );
  started = true;
  process.env.DATABASE_URL = `postgresql://operator_test@localhost/postgres?host=${encodeURIComponent(temporary)}`;
  process.env.NODE_ENV = "test";
  process.env.PULSE_PAYOUT_CATALOG_ACCOUNT = "operator-business";
  await build({
    stdin: {
      contents: `import express from 'express';import operators,{adminPayoutOperatorsRouter} from './src/routes/payout-operators';import creator,{adminWithdrawalsRouter} from './src/routes/withdrawals';import {adminGuard} from './src/routes/admin';import {createPayoutMcpRouter} from './src/routes/payout-mcp';export * from './src/lib/creatorWithdrawals';export * from './src/lib/payoutOperators';export {importResearch} from './src/lib/payoutCatalog';export {pool} from '@workspace/db';export function testApp(){const app=express();app.use('/api/payout-mcp',createPayoutMcpRouter());app.use(express.json({limit:'64kb'}));app.use('/api/payout-operator',operators);app.use((req,res,next)=>{req.auth=()=>({userId:req.get('x-test-user')||null,sessionId:req.get('x-test-user')?'session':null,sessionClaims:req.get('x-test-mfa')?{fva:[0,0]}:{},tokenType:'session_token'});next();});app.use('/admin-data/payout-operators',adminGuard,adminPayoutOperatorsRouter);app.use('/admin-data/withdrawals',adminGuard,adminWithdrawalsRouter);app.use(creator);return app;}`,
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
    "CREATE TABLE users(uid integer PRIMARY KEY,name text,clerk_id text);CREATE TABLE coin_balances(user_id integer PRIMARY KEY,balance integer NOT NULL DEFAULT 0,updated_at timestamptz DEFAULT now());CREATE TABLE coin_transactions(id serial PRIMARY KEY,from_user_id integer,to_user_id integer,amount integer,type text,description text DEFAULT '',idempotency_key text UNIQUE,balance_after integer,created_at timestamptz DEFAULT now())",
  );
  for (const migration of [
    "20260913_admin_access.sql",
    "20261004_payout_catalog.sql",
    "20261004_creator_withdrawals.sql",
    "20261004_payout_operators.sql",
  ])
    await pool.query(
      readFileSync(join(root, "../../lib/db/migrations", migration), "utf8"),
    );
  await pool.query(
    "INSERT INTO users VALUES(1,'Creator','creator'),(2,'Other','other');INSERT INTO coin_balances(user_id,balance) VALUES(1,10000),(2,10000);INSERT INTO admin_staff(clerk_user_id,role) VALUES('owner','owner')",
  );
  await api.importResearch(
    pool,
    JSON.parse(
      readFileSync(
        join(root, "src/config/remitly-research-20261004.json"),
        "utf8",
      ),
    ),
    "operator-business",
    "owner",
  );
  const method = (
    await pool.query(
      "SELECT m.id FROM payout_catalog_methods m JOIN payout_catalog_countries c ON c.id=m.country_id WHERE c.country_code='CO' AND m.code='bre_b'",
    )
  ).rows[0].id;
  server = api.testApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  process.env.PORT = String(server.address().port);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (
    path,
    { token, user, method = "GET", body, mfa = false } = {},
  ) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        ...(token
          ? { authorization: "Bearer " + token }
          : user
            ? { authorization: "Bearer private-owner-token" }
            : {}),
        ...(user ? { "x-test-user": user } : {}),
        ...(mfa ? { "x-test-mfa": "yes" } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: await r.json() };
  };
  const issue = async (role, name = role) => {
    const r = await call("/admin-data/payout-operators/issue", {
      user: "owner",
      method: "POST",
      body: { name, role },
    });
    assert.equal(r.status, 201);
    return r.body;
  };
  assert.equal((await call("/api/payout-operator/identity")).status, 401);
  assert.equal(
    (
      await call("/api/payout-operator/identity", {
        token: "private-owner-token",
      })
    ).status,
    401,
  );
  assert.equal(
    (await call("/admin-data/payout-operators", { user: "creator" })).status,
    403,
  );
  process.env.NODE_ENV = "production";
  assert.equal(
    (
      await call("/admin-data/payout-operators/issue", {
        user: "owner",
        method: "POST",
        body: { name: "production-owner-without-mfa", role: "maker" },
      })
    ).status,
    201,
  );
  assert.equal(
    (await call("/admin-data/payout-operators", { user: "creator" })).status,
    403,
  );
  assert.equal((await call("/admin-data/payout-operators")).status, 401);
  assert.equal(
    (
      await call("/admin-data/payout-operators", {
        token: "forged-owner-token",
      })
    ).status,
    401,
  );
  await pool.query(
    "UPDATE admin_staff SET enabled=false WHERE clerk_user_id='owner'",
  );
  assert.equal(
    (await call("/admin-data/payout-operators", { user: "owner" })).status,
    403,
  );
  await pool.query(
    "UPDATE admin_staff SET enabled=true WHERE clerk_user_id='owner'",
  );
  process.env.NODE_ENV = "test";
  assert.equal(
    (
      await call("/admin-data/payout-operators/issue", {
        user: "owner",
        method: "POST",
        body: { name: "bad", role: "human" },
      })
    ).status,
    400,
  );
  const maker = await issue("maker"),
    checker = await issue("checker"),
    reconciler = await issue("reconciler");
  const makerOp = await api.authenticateOperator(
    pool,
    "Bearer " + maker.token,
    "operator-business",
  );
  const saved = (
    await pool.query(
      "SELECT token_hash FROM payout_operator_credentials WHERE id=$1",
      [maker.credential.id],
    )
  ).rows[0];
  assert.notEqual(saved.token_hash, maker.token);
  assert.equal(saved.token_hash.length, 64);
  const identity = (
    await call("/api/payout-operator/identity", { token: maker.token })
  ).body;
  assert.equal(identity.operator.role, "maker");
  assert.equal(identity.operator.id, maker.credential.id);
  assert.equal(identity.environment, "development");
  assert.ok(!JSON.stringify(identity).includes(maker.token));
  assert.ok(
    !identity.capabilities.some((c) =>
      /human|approve|decline|enroll|pause|credential/.test(c),
    ),
  );
  assert.equal(
    (
      await call("/api/payout-operator/playbooks/checker", {
        token: maker.token,
      })
    ).status,
    403,
  );
  assert.equal(
    (await call("/api/payout-operator/playbooks/maker", { token: maker.token }))
      .body.version,
    "2026-10-04.1",
  );
  assert.equal(
    (
      await call("/api/payout-operator/playbooks/../identity", {
        token: maker.token,
      })
    ).status,
    200,
  );
  for (const action of ["release", "decline", "enroll", "pause", "issue"])
    assert.equal(
      (
        await call("/api/payout-operator/withdrawals/fake/" + action, {
          token: maker.token,
          method: "POST",
          body: {},
        })
      ).status,
      404,
    );
  assert.equal(
    (
      await call("/admin-data/withdrawals/fake/release", {
        token: maker.token,
        method: "POST",
        body: {},
      })
    ).status,
    401,
  );
  const list = (await call("/admin-data/payout-operators", { user: "owner" }))
    .body;
  assert.equal(list.credentials.length, 3);
  assert.ok(!JSON.stringify(list).includes("token_hash"));
  assert.ok(!JSON.stringify(list).includes(maker.token));
  process.env.NODE_ENV = "production";
  assert.equal(
    (await call("/api/payout-operator/identity", { token: maker.token }))
      .status,
    401,
  );
  process.env.NODE_ENV = "test";
  process.env.PULSE_PAYOUT_CATALOG_ACCOUNT = "other-business";
  assert.equal(
    (await call("/api/payout-operator/identity", { token: maker.token }))
      .status,
    401,
  );
  process.env.PULSE_PAYOUT_CATALOG_ACCOUNT = "operator-business";
  const expiry = await issue("maker", "expiry");
  await pool.query(
    "UPDATE payout_operator_credentials SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [expiry.credential.id],
  );
  assert.equal(
    (await call("/api/payout-operator/identity", { token: expiry.token }))
      .status,
    401,
  );
  const revoked = await issue("checker", "revoke");
  assert.equal(
    (
      await call(
        `/admin-data/payout-operators/${revoked.credential.id}/revoke`,
        { user: "owner", method: "POST", body: {} },
      )
    ).status,
    200,
  );
  assert.equal(
    (await call("/api/payout-operator/identity", { token: revoked.token }))
      .status,
    401,
  );
  console.log(
    "PASS opaque hashed credentials, authenticated enabled-owner issuance, role boundaries, no human capabilities, environment/account isolation, expiry and revocation",
  );
  await runMcpIntegration({ base, maker, checker, reconciler });
  await pool.query(
    "UPDATE payout_operator_credentials SET request_count=0,rate_window=NULL",
  );
  const leaseCall = (token, path, body) =>
    call("/api/payout-operator/browser-lease/" + path, {
      token,
      method: "POST",
      body,
    });
  const leases = await Promise.all(
    Array.from({ length: 3 }, () =>
      leaseCall(maker.token, "acquire", { idempotencyKey: "one-browser" }),
    ),
  );
  assert.ok(leases.every((r) => r.status === 200));
  const lease = leases[0].body;
  assert.equal(new Set(leases.map((r) => r.body.leaseId)).size, 1);
  assert.equal(
    (await leaseCall(checker.token, "acquire", { idempotencyKey: "parallel" }))
      .status,
    409,
  );
  assert.equal(
    (await leaseCall(checker.token, "renew", { leaseId: lease.leaseId }))
      .status,
    409,
  );
  assert.equal(
    (
      await call("/api/payout-operator/heartbeat", {
        token: maker.token,
        method: "POST",
        body: { leaseId: lease.leaseId },
      })
    ).body.lease.leaseId,
    lease.leaseId,
  );
  let unblock;
  const blocked = new Promise((r) => (unblock = r));
  let mutationStarted;
  const mutationReady = new Promise((r) => (mutationStarted = r));
  const mutation = api.withBrowserLease(
    pool,
    makerOp,
    lease.leaseId,
    "fencing.fixture",
    "fixture",
    async (db) => {
      await db.query(
        "INSERT INTO payout_operator_events(environment,account_key,actor,action) VALUES($1,$2,$3,$4)",
        ["development", "operator-business", makerOp.actor, "fencing.mutation"],
      );
      mutationStarted();
      await blocked;
      return { ok: true };
    },
  );
  await mutationReady;
  let releaseSettled = false;
  const release = leaseCall(maker.token, "release", {
    leaseId: lease.leaseId,
    reason: "Forced parallel release",
  }).then((r) => {
    releaseSettled = true;
    return r;
  });
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(releaseSettled, false);
  let reclaimSettled = false;
  const reclaim = leaseCall(checker.token, "acquire", {
    idempotencyKey: "forced-parallel-reclaim",
  }).then((r) => {
    reclaimSettled = true;
    return r;
  });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(reclaimSettled, false);
  unblock();
  await mutation;
  assert.equal((await release).status, 200);
  const reclaimedAfterMutation = await reclaim;
  assert.equal(reclaimedAfterMutation.status, 200);
  await leaseCall(checker.token, "release", {
    leaseId: reclaimedAfterMutation.body.leaseId,
    reason: "Finish forced reclaim fixture",
  });
  const second = (
    await leaseCall(maker.token, "acquire", { idempotencyKey: "second" })
  ).body;
  assert.ok(BigInt(second.fencingToken) > BigInt(lease.fencingToken));
  await assert.rejects(
    () =>
      api.withBrowserLease(
        pool,
        makerOp,
        lease.leaseId,
        "stale",
        "fixture",
        async () => ({}),
      ),
    /active owned/,
  );
  const marker = "expired-mutation-" + randomUUID();
  await assert.rejects(
    () =>
      api.withBrowserLease(
        pool,
        makerOp,
        second.leaseId,
        "expires",
        "fixture",
        async (db) => {
          await db.query(
            "INSERT INTO payout_operator_events(environment,account_key,actor,action) VALUES($1,$2,$3,$4)",
            ["development", "operator-business", makerOp.actor, marker],
          );
          await db.query(
            "UPDATE payout_operator_browser_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
            [second.leaseId],
          );
          return {};
        },
      ),
    /expired during/,
  );
  assert.equal(
    (
      await pool.query("SELECT 1 FROM payout_operator_events WHERE action=$1", [
        marker,
      ])
    ).rows.length,
    0,
  );
  await pool.query(
    "UPDATE payout_operator_browser_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [second.leaseId],
  );
  assert.equal(
    (await leaseCall(maker.token, "renew", { leaseId: second.leaseId })).status,
    409,
  );
  const third = (
    await leaseCall(maker.token, "acquire", { idempotencyKey: "third" })
  ).body;
  assert.ok(BigInt(third.fencingToken) > BigInt(second.fencingToken));
  assert.equal(
    (
      await leaseCall(maker.token, "release", {
        leaseId: second.leaseId,
        reason: "Stale expired run cleanup",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/api/payout-operator/heartbeat", {
        token: maker.token,
        method: "POST",
        body: { leaseId: third.leaseId },
      })
    ).body.lease.leaseId,
    third.leaseId,
  );
  await leaseCall(maker.token, "release", {
    leaseId: third.leaseId,
    reason: "Finish fencing test",
  });
  console.log(
    "PASS exclusive/idempotent browser claims, owned leases, heartbeat, stale fencing, serialized release and expiry rollback",
  );
  await api.enroll(
    pool,
    {
      userId: 1,
      expectedWalletCoins: "10000",
      reason: "Isolated real-wallet fixture",
    },
    "owner",
  );
  await api.saveRecipient(pool, 1, {
    legalFirstName: "Test",
    legalLastName: "Recipient",
    countryCode: "CO",
    email: "recipient@example.com",
    phone: "+573001234567",
  });
  const wd = await api.requestWithdrawal(pool, 1, "operator-business", {
    methodId: method,
    withdrawalCents: 1500,
    idempotencyKey: "operator-full",
  });
  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=1"))
      .rows[0].balance,
    4000,
  );
  const active = (
    await leaseCall(maker.token, "acquire", { idempotencyKey: "prepare" })
  ).body;
  const action = async (token, id, path, data, leaseId = active.leaseId) =>
    call(`/api/payout-operator/withdrawals/${id}/${path}`, {
      token,
      method: "POST",
      body: { leaseId, data },
    });
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
    evidence: "Isolated quote fixture; no external provider action",
  };
  await runMcpIntegration({
    base,
    maker,
    checker,
    reconciler,
    withdrawalId: wd.id,
    leaseId: active.leaseId,
    quote,
  });
  await pool.query(
    "UPDATE payout_operator_credentials SET request_count=0,rate_window=NULL",
  );
  assert.equal(
    (await action(checker.token, wd.id, "quote", quote)).status,
    403,
  );
  assert.equal(
    (await action(maker.token, wd.id, "quote", quote, "wrong-lease")).status,
    409,
  );
  let detail = (await action(maker.token, wd.id, "quote", quote)).body;
  const quoteHash = detail.quote.hash;
  assert.equal(detail.status, "requested");
  assert.equal(detail.approvedQuoteHash, null);
  // Existing quoted requests from the previous app must be maker-eligible without
  // waiting for a creator to return or acknowledging a quote.
  await pool.query(
    "UPDATE creator_withdrawals SET status='awaiting_confirmation' WHERE id=$1",
    [wd.id],
  );
  assert.ok(
    (
      await call("/api/payout-operator/withdrawals", { token: maker.token })
    ).body.withdrawals.some((w) => w.id === wd.id),
  );
  detail = (
    await action(maker.token, wd.id, "prepare", {
      quoteHash,
      evidence: "Durable attempt before browser action",
    })
  ).body;
  const attemptId = detail.attemptId;
  assert.ok(attemptId);
  assert.equal(
    (
      await action(maker.token, wd.id, "lease/renew", {
        attemptId,
        quoteHash,
        evidence: "Keep active bounded preparation",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/api/payout-operator/withdrawals?limit=101", {
        token: maker.token,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/payout-operator/withdrawals?limit=2", {
        token: checker.token,
      })
    ).body.withdrawals.length,
    0,
  );
  assert.equal(
    (
      await action(maker.token, wd.id, "lease/release", {
        attemptId,
        quoteHash,
        evidence: "Interrupted preparation",
      })
    ).body.status,
    "unknown",
  );
  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=1"))
      .rows[0].balance,
    4000,
  );
  assert.equal((await api.overview(pool, 1)).balances.reservedCoins, "6000");
  const recipientIssue = {
    code: "recipient_validation_failed",
    fields: ["phone"],
  };
  const issueReport = await call(
    `/api/payout-operator/withdrawals/${wd.id}/unknown`,
    {
      token: maker.token,
      method: "POST",
      body: {
        data: { reason: "Private provider phone rejection", recipientIssue },
      },
    },
  );
  assert.equal(issueReport.status, 200);
  assert.deepEqual(issueReport.body.recipientIssue.fields, ["phone"]);
  assert(
    !JSON.stringify(issueReport.body).includes(
      "Private provider phone rejection",
    ),
  );
  assert.equal(
    (
      await call(`/api/payout-operator/withdrawals/${wd.id}/unknown`, {
        token: checker.token,
        method: "POST",
        body: { data: { reason: "Not authorized", recipientIssue } },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(`/api/payout-operator/withdrawals/${wd.id}/unknown`, {
        token: maker.token,
        method: "POST",
        body: {
          data: {
            reason: "Bad field",
            recipientIssue: { ...recipientIssue, fields: ["raw_contact"] },
          },
        },
      })
    ).status,
    400,
  );
  assert.equal((await api.overview(pool, 1)).balances.reservedCoins, "6000");
  assert.equal(
    (await call("/api/payout-operator/identity", { token: maker.token })).body
      .workflowRevision,
    "2026-10-11.6",
  );

  assert.equal(
    (
      await action(maker.token, wd.id, "prepare", {
        quoteHash,
        evidence: "Forbidden blind retry",
      })
    ).status,
    409,
  );
  await leaseCall(maker.token, "release", {
    leaseId: active.leaseId,
    reason: "Reconciler must investigate",
  });
  const recLease = (
    await leaseCall(reconciler.token, "acquire", {
      idempotencyKey: "reconcile",
    })
  ).body;
  const failure = {
    observationId: "operator-failed",
    status: "failed",
    providerStatus: "Failed",
    providerReference: "isolated-operator-reference",
    sourceUrl: quote.sourceUrl,
    observedAt: new Date().toISOString(),
    recipientMatches: true,
    methodId: method,
    sendAmountCents: 1401,
    feeCents: 99,
    taxCents: 0,
    receiveAmount: "56000.00",
    receiveCurrency: "COP",
    fundingReturned: true,
    recipientReady: false,
    evidence: "Isolated authoritative failure and full funding return fixture",
  };
  assert.equal(
    (
      await action(
        reconciler.token,
        wd.id,
        "reconcile",
        failure,
        recLease.leaseId,
      )
    ).body.status,
    "failed",
  );
  await action(reconciler.token, wd.id, "reconcile", failure, recLease.leaseId);
  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=1"))
      .rows[0].balance,
    10000,
  );
  await leaseCall(reconciler.token, "release", {
    leaseId: recLease.leaseId,
    reason: "Reconciled fixture",
  });
  console.log(
    "PASS leased maker quote/preparation, actor-bound attempt controls, unknown blocks retry, independent reconciler and exact shared-wallet refund",
  );
  // Complete a fresh request with independent service roles and a final human action.
  const success = (
    await call("/withdrawals", {
      user: "creator",
      method: "POST",
      body: {
        methodId: method,
        withdrawalCents: 1500,
        idempotencyKey: "operator-success",
      },
    })
  ).body;
  const successMakerLease = (
    await leaseCall(maker.token, "acquire", { idempotencyKey: "success-maker" })
  ).body;
  let sq = (
    await action(
      maker.token,
      success.id,
      "quote",
      quote,
      successMakerLease.leaseId,
    )
  ).body;
  const sqHash = sq.quote.hash;
  assert.equal(sq.status, "requested");
  assert.equal(sq.approvedQuoteHash, null);
  const prepared = (
    await action(
      maker.token,
      success.id,
      "prepare",
      { quoteHash: sqHash, evidence: "Complete private fixture" },
      successMakerLease.leaseId,
    )
  ).body;
  assert.equal(
    (
      await action(
        maker.token,
        success.id,
        "preparation",
        {
          attemptId: prepared.attemptId,
          quoteHash: sqHash,
          deadline: new Date(Date.now() + 1800000).toISOString(),
          oneTime: true,
          autoSend: false,
          recipientMatches: true,
          amountsMatch: true,
          historyInspected: true,
          historyCoverage: "Private fixture history",
          evidence: "First-time link plan; no actual provider action",
          kind: "first_time_link",
        },
        successMakerLease.leaseId,
      )
    ).status,
    200,
  );
  await leaseCall(maker.token, "release", {
    leaseId: successMakerLease.leaseId,
    reason: "Completed plan, independent checker next",
  });
  const successCheckerLease = (
    await leaseCall(checker.token, "acquire", {
      idempotencyKey: "success-checker",
    })
  ).body;
  const checked = await action(
    checker.token,
    success.id,
    "check",
    {
      attemptId: prepared.attemptId,
      quoteHash: sqHash,
      recipientMatches: true,
      amountsMatch: true,
      reservationMatches: true,
      historyInspected: true,
      historyCoverage: "Independently inspected private fixture history",
      oneTime: true,
      autoSend: false,
      evidence: "Independent checker fixture",
    },
    successCheckerLease.leaseId,
  );
  assert.equal(checked.status, 200);
  assert.equal(checked.body.checker.status, "passed");
  await leaseCall(checker.token, "release", {
    leaseId: successCheckerLease.leaseId,
    reason: "Human final decision remains pending",
  });
  delete process.env.PULSE_PAYOUT_LINK_PREFIXES;
  const beforeEmailRelease = await call("/withdrawals/overview", {
    user: "creator",
  });
  const released = await call(
    "/admin-data/withdrawals/" + success.id + "/release",
    {
      user: "owner",
      method: "POST",
      body: {
        attemptId: prepared.attemptId,
        quoteHash: sqHash,
        evidence:
          "Private recorded human action fixture; no external payment sent",
        releasedAt: new Date().toISOString(),
      },
    },
  );
  assert.equal(released.status, 200);
  assert.equal(released.body.status, "awaiting_recipient");
  assert.equal(released.body.providerOnboardingStatus, "pending");
  assert.equal(released.body.providerLink, null);
  assert.deepEqual(
    (await call("/withdrawals/overview", { user: "creator" })).body.balances,
    beforeEmailRelease.body.balances,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT provider_reference FROM creator_payout_attempts WHERE id=$1",
        [prepared.attemptId],
      )
    ).rows[0].provider_reference,
    null,
  );
  const successRecLease = (
    await leaseCall(reconciler.token, "acquire", {
      idempotencyKey: "success-reconciler",
    })
  ).body;
  const delivered = {
    ...failure,
    observationId: "operator-delivered",
    status: "delivered",
    providerStatus: "Delivered",
    providerReference: "isolated-delivered-reference",
    receiveAmount: "55000.00",
    fundingReturned: false,
    recipientReady: true,
    observedAt: new Date().toISOString(),
    evidence: "Private matched delivery fixture; no external funds",
  };
  assert.equal(
    (
      await action(
        reconciler.token,
        success.id,
        "reconcile",
        delivered,
        successRecLease.leaseId,
      )
    ).body.status,
    "delivered",
  );
  assert.equal(
    (
      await pool.query(
        "SELECT provider_reference FROM creator_payout_attempts WHERE id=$1",
        [prepared.attemptId],
      )
    ).rows[0].provider_reference,
    delivered.providerReference,
  );
  assert.equal(
    (
      await action(
        reconciler.token,
        success.id,
        "reconcile",
        {
          ...delivered,
          observationId: "changed-email-transfer-reference",
          providerReference: "different-private-reference",
          observedAt: new Date(Date.now() + 1000).toISOString(),
        },
        successRecLease.leaseId,
      )
    ).status,
    409,
  );
  await action(
    reconciler.token,
    success.id,
    "reconcile",
    delivered,
    successRecLease.leaseId,
  );
  await leaseCall(reconciler.token, "release", {
    leaseId: successRecLease.leaseId,
    reason: "Verified private delivery fixture",
  });
  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=1"))
      .rows[0].balance,
    4000,
  );
  console.log(
    "PASS complete initial creator request → scoped maker → independent checker → human release → reconciler delivery without service sending capability",
  );

  // Expired browser access quarantines an interrupted attempt before the next role claims it.
  await api.enroll(
    pool,
    {
      userId: 2,
      expectedWalletCoins: "10000",
      reason: "Interrupted lease fixture",
    },
    "owner",
  );
  await api.saveRecipient(pool, 2, {
    legalFirstName: "Second",
    legalLastName: "Recipient",
    countryCode: "CO",
    email: "second@example.com",
    phone: "+573001234568",
  });
  const uncertain = await api.requestWithdrawal(pool, 2, "operator-business", {
    methodId: method,
    withdrawalCents: 1500,
    idempotencyKey: "browser-expiry",
  });
  const oldLease = (
    await leaseCall(maker.token, "acquire", {
      idempotencyKey: "expiry-attempt",
    })
  ).body;
  const uq = (
    await action(maker.token, uncertain.id, "quote", quote, oldLease.leaseId)
  ).body;
  assert.equal(uq.status, "requested");
  await action(
    maker.token,
    uncertain.id,
    "prepare",
    { quoteHash: uq.quote.hash, evidence: "Interrupted possible creation" },
    oldLease.leaseId,
  );
  await pool.query(
    "UPDATE payout_operator_browser_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [oldLease.leaseId],
  );
  const reclaimed = await leaseCall(checker.token, "acquire", {
    idempotencyKey: "reclaim-expiry",
  });
  assert.equal(reclaimed.status, 200);
  assert.equal(
    (await api.withdrawalDetail(pool, uncertain.id, 2)).status,
    "unknown",
  );
  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=2"))
      .rows[0].balance,
    4000,
  );
  await leaseCall(checker.token, "release", {
    leaseId: reclaimed.body.leaseId,
    reason: "Unknown outcome requires reconciliation",
  });
  const renewedMaker = (
    await leaseCall(maker.token, "acquire", {
      idempotencyKey: "cannot-reprepare",
    })
  ).body;
  assert.equal(
    (
      await action(
        maker.token,
        uncertain.id,
        "prepare",
        { quoteHash: uq.quote.hash, evidence: "Forbidden duplicate" },
        renewedMaker.leaseId,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        "/admin-data/payout-operators/" + maker.credential.id + "/revoke",
        { user: "owner", method: "POST", body: {} },
      )
    ).status,
    200,
  );
  assert.equal(
    (await call("/api/payout-operator/identity", { token: maker.token }))
      .status,
    401,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer count FROM payout_operator_browser_leases WHERE credential_id=$1 AND state='active'",
        [maker.credential.id],
      )
    ).rows[0].count,
    0,
  );
  console.log(
    "PASS expired browser lease quarantines uncertain attempt and credential revocation releases exclusive resource without refund or recreation",
  );
  const recoveryLease = (
    await leaseCall(reconciler.token, "acquire", {
      idempotencyKey: "approved-contact-recovery",
    })
  ).body;
  assert.equal(
    (
      await call(`/api/payout-operator/withdrawals/${uncertain.id}/unknown`, {
        token: reconciler.token,
        method: "POST",
        body: {
          data: {
            reason: "Provider rejection confirmed, no transfer or link",
            recipientIssue: {
              code: "recipient_validation_failed",
              fields: ["phone"],
            },
          },
        },
      })
    ).status,
    200,
  );
  const serviceCorrection = (
    await call(`/withdrawals/${uncertain.id}/recipient-correction`, {
      user: "other",
      method: "POST",
      body: { phone: "+12025550123" },
    })
  ).body;
  const correctedOperatorView = (
    await call(`/api/payout-operator/withdrawals/${uncertain.id}`, {
      token: reconciler.token,
    })
  ).body;
  assert.equal(correctedOperatorView.status, "unknown");
  assert.equal(correctedOperatorView.creatorStatus, "correction_saved");
  assert.equal(correctedOperatorView.progress.stage, "correction_saved");
  assert.equal(
    correctedOperatorView.progress.nextAction,
    "verify_saved_correction",
  );
  assert.equal(correctedOperatorView.progress.blocked, true);
  const recoveryAttempt = (
    await api.adminWithdrawalDetail(pool, uncertain.id, "operator-business")
  ).attempts[0];
  const recipientRecovery = {
    attemptId: recoveryAttempt.id,
    correctionHash: serviceCorrection.recipientCorrection.hash,
    observationId: "leased-contact-recovery",
    sourceUrl: quote.sourceUrl,
    observedAt: new Date().toISOString(),
    evidence:
      "Private verified-absence fixture: no recipient/transfer/link/debit and prior draft closed",
    historyCoverage: "All contact/draft/pending/sent records inspected",
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
  const serviceRecoveryBalances = (await api.overview(pool, 2)).balances;
  const serviceRecoveryLedger = (
    await pool.query(
      "SELECT * FROM creator_cash_ledger WHERE user_id=2 ORDER BY id",
    )
  ).rows;
  assert.equal(
    (
      await action(
        checker.token,
        uncertain.id,
        "resolve-recipient-error",
        recipientRecovery,
        recoveryLease.leaseId,
      )
    ).status,
    403,
  );
  const otherMaker = await issue("maker", "recovery-denied-maker");
  assert.equal(
    (
      await action(
        otherMaker.token,
        uncertain.id,
        "resolve-recipient-error",
        recipientRecovery,
        recoveryLease.leaseId,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await action(
        reconciler.token,
        uncertain.id,
        "resolve-recipient-error",
        recipientRecovery,
        "wrong-lease",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await action(
        reconciler.token,
        uncertain.id,
        "resolve-recipient-error",
        { ...recipientRecovery, noRecipientLinkIssued: false },
        recoveryLease.leaseId,
      )
    ).status,
    409,
  );
  const leasedRecovery = await action(
    reconciler.token,
    uncertain.id,
    "resolve-recipient-error",
    recipientRecovery,
    recoveryLease.leaseId,
  );
  assert.equal(leasedRecovery.status, 200);
  assert.equal(leasedRecovery.body.status, "awaiting_quote");
  assert.equal(leasedRecovery.body.recipient.phone, "+12025550123");
  assert.equal(leasedRecovery.body.quote, null);
  assert.equal(leasedRecovery.body.errorMessage, null);
  assert.deepEqual(
    (await api.overview(pool, 2)).balances,
    serviceRecoveryBalances,
  );
  assert.deepEqual(
    (
      await pool.query(
        "SELECT * FROM creator_cash_ledger WHERE user_id=2 ORDER BY id",
      )
    ).rows,
    serviceRecoveryLedger,
  );
  assert.equal(
    (
      await action(
        reconciler.token,
        uncertain.id,
        "resolve-recipient-error",
        recipientRecovery,
        recoveryLease.leaseId,
      )
    ).status,
    200,
  );
  await leaseCall(reconciler.token, "release", {
    leaseId: recoveryLease.leaseId,
    reason:
      "Verified contact recovery complete; human sending remains required",
  });
  console.log(
    "PASS reconciler-only fenced recipient recovery preserves reservation and rejects maker/checker, stale leases and possible link issuance",
  );
  // A new phone rejection before any provider object is saved belongs to Maker.
  const retryLease = (
    await leaseCall(otherMaker.token, "acquire", {
      idempotencyKey: "maker-unsaved-retry",
    })
  ).body;
  const retryQuote = await action(
    otherMaker.token,
    uncertain.id,
    "quote",
    quote,
    retryLease.leaseId,
  );
  assert.equal(retryQuote.status, 200);
  const retryAttempt = await action(
    otherMaker.token,
    uncertain.id,
    "prepare",
    {
      quoteHash: retryQuote.body.quote.hash,
      evidence: "No-record recipient validation fixture",
    },
    retryLease.leaseId,
  );
  assert.equal(retryAttempt.status, 200);
  const reportRetryIssue = async (fields = ["phone"]) => {
    await api.markUnknown(
      pool,
      "operator-business",
      uncertain.id,
      {
        reason: "Recipient validation failed before anything was saved",
        recipientIssue: { code: "recipient_validation_failed", fields },
      },
      `operator:${otherMaker.credential.id}`,
    );
    return api.submitAdminRecipientCorrection(
      pool,
      "operator-business",
      uncertain.id,
      { phone: "+12025550124", email: "corrected@example.com" },
      "owner",
    );
  };
  let retryCorrection = await reportRetryIssue();
  const retryData = {
    ...recipientRecovery,
    attemptId: retryAttempt.body.attemptId,
    correctionHash: retryCorrection.recipientCorrection.hash,
    observationId: "maker-unsaved-validation-retry",
    observedAt: new Date().toISOString(),
    noRecipientSaved: true,
    noDraftSaved: true,
  };
  const retryAction = (
    data = retryData,
    token = otherMaker.token,
    leaseId = retryLease.leaseId,
  ) => action(token, uncertain.id, "retry-recipient-creation", data, leaseId);
  const readRetry = async () =>
    (
      await call(`/api/payout-operator/withdrawals/${uncertain.id}`, {
        token: otherMaker.token,
      })
    ).body;
  const consistentRetry = await readRetry();
  assert.deepEqual(consistentRetry.recipientRecoveryDiagnostics, {
    savedRecipientExists: true,
    savedRevisionMatchesSnapshot: true,
    savedDataMatchesSnapshot: true,
    pendingCorrectionExists: true,
    correctionIssueMatches: true,
    correctionVersionMatches: true,
    correctionHashMatches: true,
  });
  const safeProductionQuery = readFileSync(
    new URL("../scripts/diagnose-recipient-retry.sql", import.meta.url),
    "utf8",
  ).replace("wd_9d50689c-81cb-4ba2-8ccf-02a2e722e7e3", uncertain.id);
  const safeSqlResult = (await pool.query(safeProductionQuery)).rows[0];
  assert.equal(safeSqlResult.status, "unknown");
  assert.equal(safeSqlResult.saved_revision_matches_snapshot, true);
  assert.equal(safeSqlResult.saved_data_matches_snapshot, true);
  assert.equal(safeSqlResult.correction_issue_matches, true);
  assert.equal(safeSqlResult.correction_version_matches, true);
  assert.equal(safeSqlResult.reserved_coins, "6000");
  const beforeRejectedRetry = (
    await pool.query("SELECT * FROM creator_withdrawals WHERE id=$1", [
      uncertain.id,
    ])
  ).rows[0];
  await pool.query(
    "UPDATE creator_payout_recipients SET revision=revision+1 WHERE user_id=2",
  );
  assert.equal(
    (await readRetry()).recipientRecoveryDiagnostics
      .savedRevisionMatchesSnapshot,
    false,
  );
  await runMakerRetryMcp({
    base,
    maker: otherMaker,
    id: uncertain.id,
    leaseId: retryLease.leaseId,
    data: retryData,
    expectedRejection: "recipient_revision_mismatch",
  });
  assert.deepEqual(
    (
      await pool.query("SELECT * FROM creator_withdrawals WHERE id=$1", [
        uncertain.id,
      ])
    ).rows[0],
    beforeRejectedRetry,
  );
  await pool.query(
    "UPDATE creator_payout_recipients SET revision=revision-1 WHERE user_id=2",
  );
  const savedData = (
    await pool.query(
      "SELECT data FROM creator_payout_recipients WHERE user_id=2",
    )
  ).rows[0].data;
  await pool.query(
    "UPDATE creator_payout_recipients SET data=jsonb_set(data,'{phone}','\"+12025550999\"') WHERE user_id=2",
  );
  assert.equal(
    (await readRetry()).recipientRecoveryDiagnostics.savedDataMatchesSnapshot,
    false,
  );
  await runMakerRetryMcp({
    base,
    maker: otherMaker,
    id: uncertain.id,
    leaseId: retryLease.leaseId,
    data: retryData,
    expectedRejection: "recipient_snapshot_mismatch",
  });
  assert.deepEqual(
    (
      await pool.query("SELECT * FROM creator_withdrawals WHERE id=$1", [
        uncertain.id,
      ])
    ).rows[0],
    beforeRejectedRetry,
  );
  await pool.query(
    "UPDATE creator_payout_recipients SET data=$1 WHERE user_id=2",
    [JSON.stringify(savedData)],
  );
  const retryLedger = (
    await pool.query(
      "SELECT * FROM creator_cash_ledger WHERE user_id=2 ORDER BY id",
    )
  ).rows;
  const retryWallet = (
    await pool.query(
      "SELECT * FROM coin_transactions WHERE from_user_id=2 OR to_user_id=2 ORDER BY id",
    )
  ).rows;
  assert(
    (
      await call("/api/payout-operator/identity", { token: otherMaker.token })
    ).body.capabilities.includes("retry_recipient_creation"),
  );
  assert(
    (
      await call("/api/payout-operator/withdrawals", {
        token: otherMaker.token,
      })
    ).body.withdrawals.some((w) => w.id === uncertain.id),
  );
  for (const token of [checker.token, reconciler.token]) {
    const denied = await retryAction(retryData, token);
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, "forbidden");
  }
  assert.equal(
    (await retryAction(retryData, otherMaker.token, "wrong-lease")).status,
    409,
  );
  assert.equal(
    (await retryAction(retryData, otherMaker.token, "wrong-lease")).body.code,
    "browser_lease_required",
  );
  for (const flag of [
    "noRecipientSaved",
    "noDraftSaved",
    "noFundsSent",
    "noFundingDebit",
    "noRecipientLinkIssued",
    "noPendingTransfers",
    "noUnknownTransfers",
    "historyInspected",
    "recipientRecordInspected",
    "recipientCorrectionApplied",
    "previousDraftClosed",
  ]) {
    assert.equal(
      (await retryAction({ ...retryData, [flag]: false })).status,
      409,
    );
    const missing = { ...retryData };
    delete missing[flag];
    assert.equal((await retryAction(missing)).status, 409);
  }
  assert.equal(
    (await retryAction({ ...retryData, correctionHash: "stale" })).status,
    409,
  );
  assert.equal(
    (await retryAction({ ...retryData, correctionHash: "stale" })).body.code,
    "correction_hash_mismatch",
  );
  assert.equal(
    (
      await retryAction({
        ...retryData,
        observedAt: new Date(Date.now() - 90000000).toISOString(),
      })
    ).status,
    409,
  );
  await pool.query(
    "UPDATE creator_payout_settings SET preparation_paused=true WHERE id=1",
  );
  assert.equal((await retryAction()).status, 409);
  assert.equal((await retryAction()).body.code, "preparation_paused");
  await pool.query(
    "UPDATE creator_payout_settings SET preparation_paused=false WHERE id=1",
  );
  for (const field of ["draft_id", "provider_reference", "activity_id"]) {
    await pool.query(
      `UPDATE creator_payout_attempts SET ${field}='existing-record' WHERE id=$1`,
      [retryData.attemptId],
    );
    assert.equal((await retryAction()).status, 409);
    await pool.query(
      `UPDATE creator_payout_attempts SET ${field}=NULL WHERE id=$1`,
      [retryData.attemptId],
    );
  }
  for (const marker of [
    { recipientSaved: true },
    { draftSaved: true },
    { providerRecipientId: "contact" },
    { paymentSent: true },
    { fundingDebited: true },
    { recipientLinkIssued: true },
  ]) {
    await pool.query(
      "UPDATE creator_payout_attempts SET evidence=evidence || $2::jsonb WHERE id=$1",
      [retryData.attemptId, JSON.stringify(marker)],
    );
    assert.equal((await retryAction()).status, 409);
    await pool.query(
      "UPDATE creator_payout_attempts SET evidence=evidence-$2 WHERE id=$1",
      [retryData.attemptId, Object.keys(marker)[0]],
    );
  }
  retryCorrection = await reportRetryIssue(["phone", "name"]);
  assert.equal(
    (
      await retryAction({
        ...retryData,
        correctionHash: retryCorrection.recipientCorrection.hash,
        observedAt: new Date().toISOString(),
      })
    ).status,
    409,
  );
  await api.markUnknown(
    pool,
    "operator-business",
    uncertain.id,
    { reason: "Generic uncertain interruption" },
    "fixture",
  );
  assert.equal((await retryAction()).status, 409);
  retryCorrection = await reportRetryIssue();
  retryData.correctionHash = retryCorrection.recipientCorrection.hash;
  retryData.observedAt = new Date().toISOString();
  const retried = await runMakerRetryMcp({
    base,
    maker: otherMaker,
    id: uncertain.id,
    leaseId: retryLease.leaseId,
    data: retryData,
  });
  assert.equal(retried.status, 200, JSON.stringify(retried.body));
  assert.equal(retried.body.status, "awaiting_quote");
  assert.equal(retried.body.recipient.phone, "+12025550124");
  assert.equal(retried.body.quote, null);
  assert.equal(retried.body.checker, null);
  assert.deepEqual(
    (
      await pool.query(
        "SELECT * FROM creator_cash_ledger WHERE user_id=2 ORDER BY id",
      )
    ).rows,
    retryLedger,
  );
  assert.deepEqual(
    (
      await pool.query(
        "SELECT * FROM coin_transactions WHERE from_user_id=2 OR to_user_id=2 ORDER BY id",
      )
    ).rows,
    retryWallet,
  );
  assert.equal(
    (await retryAction()).status,
    200,
    "identical retry evidence is idempotent",
  );
  assert.equal(
    (await retryAction({ ...retryData, evidence: "changed evidence" })).status,
    409,
  );
  const requote = await action(
    otherMaker.token,
    uncertain.id,
    "quote",
    quote,
    retryLease.leaseId,
  );
  assert.equal(requote.status, 200);
  const recreated = await action(
    otherMaker.token,
    uncertain.id,
    "prepare",
    {
      quoteHash: requote.body.quote.hash,
      evidence: "Fresh corrected creation attempt",
    },
    retryLease.leaseId,
  );
  assert.equal(recreated.status, 200);
  assert.notEqual(recreated.body.attemptId, retryData.attemptId);
  assert.equal(
    (
      await pool.query(
        "SELECT state FROM creator_payout_attempts WHERE id=$1",
        [retryData.attemptId],
      )
    ).rows[0].state,
    "canceled",
  );
  await leaseCall(otherMaker.token, "release", {
    leaseId: retryLease.leaseId,
    reason: "Maker retry fixture finished",
  });
  console.log(
    "PASS Maker retries unsaved validation failures with saved correction; roles, lease, pause, stale data, saved objects/effects and generic/mixed errors guarded; ledger untouched and fresh attempt required",
  );
  process.env.PULSE_PAYOUT_LINK_PREFIXES =
    "https://www.remitly.com/us/en/transfer/review";
  // New preparation flow: no persisted quote or extra wait between browser quote
  // entry and draft saving; final details are committed atomically through MCP.
  await pool.query(
    "UPDATE payout_operator_credentials SET request_count=0,rate_window=NULL",
  );
  await pool.query(
    "INSERT INTO users VALUES(3,'Continuous fixture','continuous');INSERT INTO coin_balances(user_id,balance) VALUES(3,10000)",
  );
  await api.enroll(
    pool,
    {
      userId: 3,
      expectedWalletCoins: "10000",
      reason: "Continuous preparation fixture",
    },
    "owner",
  );
  await api.saveRecipient(pool, 3, {
    legalFirstName: "Test",
    legalLastName: "Continuous",
    countryCode: "CO",
    email: "continuous@example.com",
    phone: "+573001234568",
  });
  const continuousWd = await api.requestWithdrawal(
    pool,
    3,
    "operator-business",
    {
      methodId: method,
      withdrawalCents: 1500,
      idempotencyKey: "continuous-preparation",
    },
  );
  const continuousLease = (
    await leaseCall(otherMaker.token, "acquire", {
      idempotencyKey: "continuous-preparation",
    })
  ).body;
  preparationClient = await connectMakerPreparationMcp({
    base,
    maker: otherMaker,
  });
  const continuousCall = (tool, data) =>
    callMakerPreparationMcp({
      client: preparationClient,
      base,
      maker: otherMaker,
      id: continuousWd.id,
      leaseId: continuousLease.leaseId,
      tool,
      data,
    });
  const continuousBalance = (
    await pool.query("SELECT balance FROM coin_balances WHERE user_id=3")
  ).rows[0].balance;
  const continuousLedger = (
    await pool.query(
      "SELECT * FROM creator_cash_ledger WHERE user_id=3 ORDER BY id",
    )
  ).rows;
  const begun = await continuousCall("prepare", {
    evidence:
      "Claim before entering Remitly; no external provider action in fixture",
  });
  assert.equal(begun.status, 200, JSON.stringify(begun.body));
  assert.equal(begun.body.status, "preparing");
  assert.equal(begun.body.quote, null);
  assert.match(begun.body.preparationHash, /^[a-f0-9]{64}$/);
  assert.equal(
    (await continuousCall("prepare", { evidence: "Duplicate claim must fail" }))
      .status,
    409,
  );
  const preparationBinding = {
    attemptId: begun.body.attemptId,
    preparationHash: begun.body.preparationHash,
  };
  assert.equal(
    (
      await continuousCall("preparation_lease_renew", {
        ...preparationBinding,
        evidence: "Keep continuous browser run active",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await continuousCall("preparation_lease_renew", {
        ...preparationBinding,
        preparationHash: "0".repeat(64),
        evidence: "Wrong snapshot must fail",
      })
    ).status,
    409,
  );
  const finalQuote = {
    ...quote,
    observedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  const continuousDraft = {
    ...preparationBinding,
    quote: finalQuote,
    kind: "scheduled",
    draftId: "continuous-draft",
    reviewUrl:
      "https://www.remitly.com/us/en/transfer/review?scheduledDraftId=continuous-draft",
    deadline: new Date(Date.now() + 3600000).toISOString(),
    oneTime: true,
    autoSend: false,
    recipientMatches: true,
    amountsMatch: true,
    historyInspected: true,
    historyCoverage: "Full fixture contact/draft/activity coverage",
    evidence: "Actual saved draft fixture; no Remitly action performed",
  };
  const beforeFinal = async () => ({
    withdrawal: (
      await pool.query("SELECT * FROM creator_withdrawals WHERE id=$1", [
        continuousWd.id,
      ])
    ).rows,
    attempt: (
      await pool.query(
        "SELECT * FROM creator_payout_attempts WHERE withdrawal_id=$1",
        [continuousWd.id],
      )
    ).rows,
    audit: (
      await pool.query(
        "SELECT * FROM creator_payout_events WHERE withdrawal_id=$1 ORDER BY id",
        [continuousWd.id],
      )
    ).rows,
  });
  const uncompleted = await beforeFinal();
  for (const invalid of [
    { ...continuousDraft, quote: { ...finalQuote, sendAmountCents: 1500 } },
    { ...continuousDraft, quote: { ...finalQuote, receiveCurrency: "USD" } },
    {
      ...continuousDraft,
      quote: {
        ...finalQuote,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      },
    },
    { ...continuousDraft, preparationHash: "0".repeat(64) },
    {
      ...continuousDraft,
      kind: "first_time_link",
      draftId: undefined,
      reviewUrl: undefined,
    },
    {
      ...continuousDraft,
      reviewUrl:
        "https://www.remitly.com/us/en/transfer/review?scheduledDraftId=another-draft",
    },
    {
      ...continuousDraft,
      deadline: new Date(Date.now() + 60000).toISOString(),
    },
  ]) {
    await pool.query(
      "UPDATE payout_operator_credentials SET request_count=0,rate_window=NULL WHERE id=$1",
      [otherMaker.credential.id],
    );
    const rejected = await continuousCall("record_preparation", invalid);
    assert(rejected.status >= 400, JSON.stringify(rejected));
    assert.deepEqual(
      await beforeFinal(),
      uncompleted,
      "Invalid completion cannot publish quote, draft, audit or partial ready state",
    );
  }
  assert.equal(
    (
      await action(
        otherMaker.token,
        continuousWd.id,
        "quote",
        finalQuote,
        continuousLease.leaseId,
      )
    ).status,
    409,
  );
  const completed = await continuousCall("record_preparation", continuousDraft);
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.equal(completed.body.status, "awaiting_human_review");
  assert.equal(completed.body.quote.sendAmountCents, 1401);
  assert.equal(completed.body.quote.feeCents, 99);
  assert.equal(completed.body.quote.totalEarningsDeductedCents, 1500);
  assert.equal(completed.body.approvedQuoteHash, null);
  const completedAttempt = (
    await pool.query("SELECT * FROM creator_payout_attempts WHERE id=$1", [
      begun.body.attemptId,
    ])
  ).rows[0];
  assert.equal(completedAttempt.draft_id, "continuous-draft");
  assert.equal(completedAttempt.state, "awaiting_human_review");
  assert.equal(completedAttempt.evidence.quoteHash, completed.body.quote.hash);
  assert.equal(
    (await continuousCall("record_preparation", continuousDraft)).status,
    409,
    "Never blindly replay saved-draft completion",
  );
  assert.deepEqual(
    (
      await pool.query(
        "SELECT * FROM creator_cash_ledger WHERE user_id=3 ORDER BY id",
      )
    ).rows,
    continuousLedger,
  );
  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=3"))
      .rows[0].balance,
    continuousBalance,
  );
  await pool.query(
    "INSERT INTO users VALUES(4,'Error fixture','continuous-error');INSERT INTO coin_balances(user_id,balance) VALUES(4,10000)",
  );
  await api.enroll(
    pool,
    {
      userId: 4,
      expectedWalletCoins: "10000",
      reason: "Continuous error fixture",
    },
    "owner",
  );
  await api.saveRecipient(pool, 4, {
    legalFirstName: "Test",
    legalLastName: "Error",
    countryCode: "CO",
    email: "error@example.com",
    phone: "+573001234569",
  });
  const errorWd = await api.requestWithdrawal(pool, 4, "operator-business", {
    methodId: method,
    withdrawalCents: 1500,
    idempotencyKey: "continuous-error",
  });
  const errorCall = (tool, data) =>
    callMakerPreparationMcp({
      client: preparationClient,
      base,
      maker: otherMaker,
      id: errorWd.id,
      leaseId: continuousLease.leaseId,
      tool,
      data,
    });
  const errorStart = await errorCall("prepare", {
    evidence: "Claim the combined job before provider contact creation",
  });
  assert.equal(errorStart.status, 200);
  assert.equal(
    (
      await errorCall("preparation_lease_release", {
        attemptId: errorStart.body.attemptId,
        preparationHash: errorStart.body.preparationHash,
        evidence: "Keep uncertain preparation reserved; no blind replacement",
      })
    ).status,
    200,
  );
  const reportedError = await errorCall("unknown", {
    reason:
      "Fixture Remitly phone validation failed; no draft saved. No external provider action.",
    recipientIssue: { code: "recipient_validation_failed", fields: ["phone"] },
  });
  assert.equal(reportedError.status, 200);
  assert.equal(reportedError.body.status, "unknown");
  assert.equal(reportedError.body.creatorStatus, "error");
  assert(reportedError.body.errorMessage.includes("phone number"));
  assert.equal(reportedError.body.quote, null);
  assert.equal(
    (await errorCall("prepare", { evidence: "Blind retry must fail" })).status,
    409,
  );

  assert.equal(
    (await pool.query("SELECT balance FROM coin_balances WHERE user_id=4"))
      .rows[0].balance,
    4000,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT sum(reserved_ticks)::text value FROM creator_cash_ledger WHERE withdrawal_id=$1",
        [errorWd.id],
      )
    ).rows[0].value,
    "6000",
  );
  // An actual durable first-time UNSENT draft is distinct from a schedule or legacy plan.
  await pool.query(
    "UPDATE payout_operator_credentials SET request_count=0,rate_window=NULL WHERE id=$1",
    [otherMaker.credential.id],
  );
  await pool.query(
    "INSERT INTO users VALUES(5,'First draft fixture','first-draft');INSERT INTO coin_balances(user_id,balance) VALUES(5,10000)",
  );
  await api.enroll(
    pool,
    {
      userId: 5,
      expectedWalletCoins: "10000",
      reason: "Isolated first draft fixture",
    },
    "owner",
  );
  await api.saveRecipient(pool, 5, {
    legalFirstName: "Test",
    legalLastName: "First Draft",
    countryCode: "CO",
    email: "draft@example.test",
    phone: "+573001234570",
  });
  const firstWd = await api.requestWithdrawal(pool, 5, "operator-business", {
    methodId: method,
    withdrawalCents: 1500,
    idempotencyKey: "first-saved-draft",
  });
  const firstCall = (tool, data) =>
    callMakerPreparationMcp({
      client: preparationClient,
      base,
      maker: otherMaker,
      id: firstWd.id,
      leaseId: continuousLease.leaseId,
      tool,
      data,
    });
  const firstBegin = await firstCall("prepare", {
    evidence: "Isolated claim before saved draft; no provider action",
  });
  assert.equal(firstBegin.status, 200, JSON.stringify(firstBegin));
  const firstDraft = {
    ...continuousDraft,
    attemptId: firstBegin.body.attemptId,
    preparationHash: firstBegin.body.preparationHash,
    kind: "first_time_draft",
    draftId: "first-unsent-draft",
    reviewUrl:
      "https://www.remitly.com/us/en/transfer/review?draftId=first-unsent-draft",
    draftSaved: true,
    draftReopened: true,
    noPriorTransfer: true,
  };
  const firstBefore = async () => ({
    withdrawal: (
      await pool.query("SELECT * FROM creator_withdrawals WHERE id=$1", [
        firstWd.id,
      ])
    ).rows,
    attempts: (
      await pool.query(
        "SELECT * FROM creator_payout_attempts WHERE withdrawal_id=$1",
        [firstWd.id],
      )
    ).rows,
    events: (
      await pool.query(
        "SELECT * FROM creator_payout_events WHERE withdrawal_id=$1 ORDER BY id",
        [firstWd.id],
      )
    ).rows,
    ledger: (
      await pool.query(
        "SELECT * FROM creator_cash_ledger WHERE user_id=5 ORDER BY id",
      )
    ).rows,
    balance: (
      await pool.query("SELECT balance FROM coin_balances WHERE user_id=5")
    ).rows,
  });
  const unverifiedFirst = await firstBefore();
  assert.equal(
    (await api.adminWithdrawalDetail(pool, firstWd.id, "operator-business"))
      .pendingFirstTimeRecipient,
    false,
  );
  for (const invalid of [
    { ...firstDraft, draftSaved: undefined },
    { ...firstDraft, draftReopened: undefined },
    { ...firstDraft, noPriorTransfer: undefined },
    { ...firstDraft, draftId: undefined },
    { ...firstDraft, reviewUrl: undefined },
    {
      ...firstDraft,
      reviewUrl:
        "https://www.remitly.com/us/en/transfer/review?draftId=another-draft",
    },
    {
      ...firstDraft,
      reviewUrl:
        "https://example.test/transfer/review?draftId=first-unsent-draft",
    },
    { ...firstDraft, preparationHash: "0".repeat(64) },
    { ...firstDraft, quote: { ...finalQuote, sendAmountCents: 1500 } },
    {
      ...firstDraft,
      draftId: "continuous-draft",
      reviewUrl: continuousDraft.reviewUrl,
    },
  ]) {
    await pool.query(
      "UPDATE payout_operator_credentials SET request_count=0,rate_window=NULL WHERE id=$1",
      [otherMaker.credential.id],
    );
    const result = await firstCall("record_preparation", invalid);
    assert(result.status >= 400, JSON.stringify(result));
    assert.deepEqual(
      await firstBefore(),
      unverifiedFirst,
      "Invalid first draft cannot publish quote, draft, audit or change coins",
    );
  }
  await pool.query(
    "UPDATE payout_operator_credentials SET request_count=0,rate_window=NULL WHERE id=$1",
    [otherMaker.credential.id],
  );
  const firstUnknown = await firstCall("unknown", {
    reason:
      "Fixture browser interruption before the automatically saved draft could be recorded; no provider actions performed",
  });
  assert.equal(firstUnknown.status, 200);
  assert.equal(firstUnknown.body.status, "unknown");
  assert.equal(
    (await firstCall("record_preparation", firstDraft)).status,
    409,
    "Unknown cannot complete without verified recovery evidence",
  );
  firstDraft.recovery = {
    expectedVersion: firstUnknown.body.version,
    observationId: "reopened-first-draft-recovery",
    sourceUrl: "https://www.remitly.com/us/en/homepage",
    observedAt: new Date().toISOString(),
    evidence:
      "Fixture inspected matching automatically saved draft and reopened it; no external actions",
    historyCoverage:
      "Complete fixture activity, pending transfers and funding-debit coverage",
    historyInspected: true,
    noRecipientLinkIssued: true,
    noFundsSent: true,
    noFundingDebit: true,
    noPendingTransfers: true,
    noUnknownTransfers: true,
  };
  const unknownFirstState = await firstBefore();
  for (const invalidRecovery of [
    { ...firstDraft.recovery, expectedVersion: firstUnknown.body.version + 1 },
    {
      ...firstDraft.recovery,
      observedAt: new Date(Date.now() - 86401000).toISOString(),
    },
    { ...firstDraft.recovery, noFundsSent: false },
  ]) {
    const rejected = await firstCall("record_preparation", {
      ...firstDraft,
      recovery: invalidRecovery,
    });
    assert(rejected.status >= 400, JSON.stringify(rejected));
    assert.deepEqual(
      await firstBefore(),
      unknownFirstState,
      "Rejected saved-draft recovery cannot change attempt, reservation or audit",
    );
  }
  const firstCompleted = await firstCall("record_preparation", firstDraft);
  assert.equal(firstCompleted.status, 200, JSON.stringify(firstCompleted));
  assert.equal(firstCompleted.body.status, "awaiting_human_review");
  assert.equal(firstCompleted.body.quote.totalEarningsDeductedCents, 1500);
  assert.equal(firstCompleted.body.approvedQuoteHash, null);
  assert.equal(
    (await firstCall("record_preparation", firstDraft)).status,
    200,
    "Same saved-draft recovery observation is idempotent without new attempt",
  );
  assert.equal(
    (await firstBefore()).attempts.length,
    1,
    "Reopened draft recovery uses the same internal attempt",
  );
  const pendingFirstDetail = await api.adminWithdrawalDetail(
    pool,
    firstWd.id,
    "operator-business",
  );
  assert.equal(pendingFirstDetail.pendingFirstTimeRecipient, true);
  assert.equal(
    pendingFirstDetail.attempts.at(-1).evidence.kind,
    "first_time_draft",
  );
  assert.equal(
    pendingFirstDetail.attempts.at(-1).draftId,
    "first-unsent-draft",
  );
  assert.equal(
    (await api.listWithdrawals(pool, "operator-business")).withdrawals.find(
      (w) => w.id === firstWd.id,
    ).pendingFirstTimeRecipient,
    true,
  );
  assert.equal(
    (
      await api.adminWithdrawalDetail(
        pool,
        continuousWd.id,
        "operator-business",
      )
    ).pendingFirstTimeRecipient,
    false,
    "Scheduled drafts are not first-time unsent drafts",
  );
  await pool.query(
    "UPDATE payout_operator_credentials SET request_count=0,rate_window=NULL",
  );
  await runMcpIntegration({
    base,
    maker: otherMaker,
    checker,
    reconciler,
    withdrawalId: firstWd.id,
    leaseId: continuousLease.leaseId,
    expectedPendingFirstTimeRecipient: true,
  });
  const firstRelease = {
    attemptId: firstBegin.body.attemptId,
    quoteHash: firstCompleted.body.quote.hash,
    providerReference: "first-draft-human-reference",
    evidence: "Isolated human record fixture; no real sending",
    releasedAt: new Date().toISOString(),
  };
  assert.equal(
    (
      await call("/admin-data/withdrawals/" + firstWd.id + "/release", {
        user: "owner",
        method: "POST",
        body: firstRelease,
      })
    ).status,
    409,
    "Unreviewed first-time draft cannot be released",
  );
  // A generic interruption with NO saved provider object has its own Maker recovery.
  await pool.query(
    "UPDATE payout_operator_credentials SET request_count=0,rate_window=NULL",
  );
  await pool.query(
    "INSERT INTO users VALUES(6,'Unsaved fixture','unsaved');INSERT INTO coin_balances(user_id,balance) VALUES(6,10000)",
  );
  await api.enroll(
    pool,
    {
      userId: 6,
      expectedWalletCoins: "10000",
      reason: "Isolated generic interrupted preparation",
    },
    "owner",
  );
  await api.saveRecipient(pool, 6, {
    legalFirstName: "Test",
    legalLastName: "Unsaved",
    countryCode: "CO",
    email: "unsaved@example.test",
    phone: "+573001234571",
  });
  const unsavedWd = await api.requestWithdrawal(pool, 6, "operator-business", {
    methodId: method,
    withdrawalCents: 1500,
    idempotencyKey: "unsaved-preparation-recovery",
  });
  const unsavedCall = (tool, data) =>
    callMakerPreparationMcp({
      client: preparationClient,
      base,
      maker: otherMaker,
      id: unsavedWd.id,
      leaseId: continuousLease.leaseId,
      tool,
      data,
    });
  const unsavedBegin = await unsavedCall("prepare", {
    evidence: "Isolated claim; no provider action",
  });
  assert.equal(unsavedBegin.status, 200);
  const unsavedUnknown = await unsavedCall("unknown", {
    reason: "Isolated browser interruption; no provider record saved",
  });
  assert.equal(unsavedUnknown.status, 200);
  const unsavedProof = {
    attemptId: unsavedBegin.body.attemptId,
    expectedVersion: unsavedUnknown.body.version,
    observationId: "generic-unsaved-fixture-inspection",
    sourceUrl: "https://www.remitly.com/us/en/homepage",
    observedAt: new Date().toISOString(),
    historyCoverage:
      "Complete fixture contacts, drafts, schedules, full activity and funding history",
    evidence:
      "Fixture confirms no recipient, draft, link, pending/uncertain transfer, debit or sent payment",
    historyInspected: true,
    recipientRecordInspected: true,
    noRecipientSaved: true,
    noDraftSaved: true,
    noRecipientLinkIssued: true,
    noFundsSent: true,
    noFundingDebit: true,
    noPendingTransfers: true,
    noUnknownTransfers: true,
    previousDraftClosed: true,
  };
  const unsavedState = async () => ({
    withdrawal: (
      await pool.query("SELECT * FROM creator_withdrawals WHERE id=$1", [
        unsavedWd.id,
      ])
    ).rows,
    attempts: (
      await pool.query(
        "SELECT * FROM creator_payout_attempts WHERE withdrawal_id=$1 ORDER BY created_at",
        [unsavedWd.id],
      )
    ).rows,
    events: (
      await pool.query(
        "SELECT * FROM creator_payout_events WHERE withdrawal_id=$1 ORDER BY id",
        [unsavedWd.id],
      )
    ).rows,
    ledger: (
      await pool.query(
        "SELECT * FROM creator_cash_ledger WHERE user_id=6 ORDER BY id",
      )
    ).rows,
    balance: (
      await pool.query("SELECT balance FROM coin_balances WHERE user_id=6")
    ).rows,
  });
  const beforeRecovery = await unsavedState();
  for (const credential of [checker, reconciler]) {
    assert.equal(
      (
        await action(
          credential.token,
          unsavedWd.id,
          "retry-unsaved-preparation",
          unsavedProof,
          continuousLease.leaseId,
        )
      ).status,
      403,
    );
  }
  const unownedRecoveryMaker = await issue("maker", "Unowned recovery fixture");
  assert.equal(
    (
      await action(
        unownedRecoveryMaker.token,
        unsavedWd.id,
        "retry-unsaved-preparation",
        unsavedProof,
        continuousLease.leaseId,
      )
    ).status,
    409,
    "Other Maker cannot use an unowned browser lease",
  );
  const staleRecovery = await unsavedCall("retry_unsaved_preparation", {
    ...unsavedProof,
    expectedVersion: unsavedProof.expectedVersion + 1,
  });
  assert.equal(staleRecovery.status, 409);
  assert.equal(staleRecovery.body.code, "preparation_version_mismatch");
  assert.deepEqual(await unsavedState(), beforeRecovery);
  const unsavedRecovered = await unsavedCall(
    "retry_unsaved_preparation",
    unsavedProof,
  );
  assert.equal(unsavedRecovered.status, 200, JSON.stringify(unsavedRecovered));
  assert.equal(unsavedRecovered.body.status, "awaiting_quote");
  assert.equal(unsavedRecovered.body.id, unsavedWd.id);
  assert.equal(unsavedRecovered.body.version, unsavedProof.expectedVersion + 1);
  assert.equal((await unsavedState()).attempts[0].state, "canceled");
  assert.deepEqual((await unsavedState()).ledger, beforeRecovery.ledger);
  assert.deepEqual((await unsavedState()).balance, beforeRecovery.balance);
  // Continue in this same authorized run instead of ending after recovery.
  const resumed = await unsavedCall("prepare", {
    evidence: "Continue immediately after verified unsaved recovery",
  });
  assert.equal(resumed.status, 200, JSON.stringify(resumed));
  assert.notEqual(resumed.body.attemptId, unsavedBegin.body.attemptId);
  const recoveredCompletion = await unsavedCall("record_preparation", {
    ...firstDraft,
    recovery: undefined,
    attemptId: resumed.body.attemptId,
    preparationHash: resumed.body.preparationHash,
    quote: {
      ...finalQuote,
      observedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    },
    draftId: "unsaved-recovered-draft",
    reviewUrl:
      "https://www.remitly.com/us/en/transfer/review?draftId=unsaved-recovered-draft",
  });
  assert.equal(
    recoveredCompletion.status,
    200,
    JSON.stringify(recoveredCompletion),
  );
  assert.equal(recoveredCompletion.body.status, "awaiting_human_review");
  assert.equal(
    (await api.adminWithdrawalDetail(pool, unsavedWd.id, "operator-business"))
      .pendingFirstTimeRecipient,
    true,
  );
  assert.deepEqual((await unsavedState()).ledger, beforeRecovery.ledger);
  assert.deepEqual((await unsavedState()).balance, beforeRecovery.balance);
  console.log(
    "PASS actual Maker MCP recovers generic unsaved interruption and completes preparation in one run; existing first-time draft recovers on same attempt; roles, leases, version and funds preserved",
  );
  // Corrected saved contact + empty amount form is ordinary reuse, not absence.
  await pool.query(
    "UPDATE payout_operator_credentials SET request_count=0,rate_window=NULL WHERE id=$1",
    [otherMaker.credential.id],
  );
  await pool.query(
    "INSERT INTO users VALUES(7,'Reuse fixture','saved-contact-reuse');INSERT INTO coin_balances(user_id,balance) VALUES(7,10000)",
  );
  await api.enroll(
    pool,
    {
      userId: 7,
      expectedWalletCoins: "10000",
      reason: "Isolated saved-contact retry",
    },
    "owner",
  );
  await api.saveRecipient(pool, 7, {
    legalFirstName: "Test",
    legalLastName: "Reuse",
    countryCode: "CO",
    email: "reuse@example.test",
    phone: "+573001234572",
  });
  const reuseWd = await api.requestWithdrawal(pool, 7, "operator-business", {
    methodId: method,
    withdrawalCents: 1500,
    idempotencyKey: "reuse-saved-contact",
  });
  const reuseCall = (tool, data) =>
    callMakerPreparationMcp({
      client: preparationClient,
      base,
      maker: otherMaker,
      id: reuseWd.id,
      leaseId: continuousLease.leaseId,
      tool,
      data,
    });
  const reuseBegin = await reuseCall("prepare", {
    evidence: "Isolated first-time preparation; no external actions",
  });
  assert.equal(reuseBegin.status, 200);
  await pool.query(
    "UPDATE creator_payout_attempts SET evidence=evidence || $2::jsonb WHERE id=$1",
    [
      reuseBegin.body.attemptId,
      JSON.stringify({
        providerRecipientId: "fixture-existing-contact",
        recipientSaved: true,
      }),
    ],
  );
  const reuseUnknown = await reuseCall("unknown", {
    reason:
      "Fixture corrected contact exists; Send money opens empty amount form, no draft or transfer",
  });
  assert.equal(reuseUnknown.status, 200);
  const reuseProof = {
    ...unsavedProof,
    attemptId: reuseBegin.body.attemptId,
    expectedVersion: reuseUnknown.body.version,
    observationId: "reuse-saved-contact-observation",
    observedAt: new Date().toISOString(),
    noRecipientSaved: false,
    reuseSavedRecipient: true,
    recipientMatches: true,
    evidence:
      "Matching corrected contact verified; no draft at actual attempted location; recorded pre-send boundary never crossed, no external actions",
    historyCoverage:
      "Relevant attempt audit and provider draft location; no sending, funding or link action occurred in fixture",
  };
  const reuseFunds = async () => ({
    ledger: (
      await pool.query(
        "SELECT * FROM creator_cash_ledger WHERE user_id=7 ORDER BY id",
      )
    ).rows,
    balance: (
      await pool.query("SELECT balance FROM coin_balances WHERE user_id=7")
    ).rows,
    recipient: (
      await pool.query(
        "SELECT * FROM creator_payout_recipients WHERE user_id=7",
      )
    ).rows,
  });
  const reuseBefore = await reuseFunds();
  for (const invalid of [
    { ...reuseProof, recipientMatches: false },
    { ...reuseProof, reuseSavedRecipient: undefined },
    { ...reuseProof, noDraftSaved: false },
  ])
    assert(
      (await reuseCall("retry_unsaved_preparation", invalid)).status >= 400,
    );
  const reused = await reuseCall("retry_unsaved_preparation", reuseProof);
  assert.equal(reused.status, 200, JSON.stringify(reused));
  assert.equal(reused.body.id, reuseWd.id);
  assert.equal(reused.body.status, "awaiting_quote");
  assert.deepEqual(await reuseFunds(), reuseBefore);
  const reuseClaim = await reuseCall("prepare", {
    evidence:
      "Continue immediately with the verified existing contact; no creation/edit",
  });
  assert.equal(reuseClaim.status, 200, JSON.stringify(reuseClaim));
  assert.equal(reuseClaim.body.recipientHandling, "reuse_existing");
  const reuseAttempt = (
    await pool.query(
      "SELECT evidence FROM creator_payout_attempts WHERE id=$1",
      [reuseClaim.body.attemptId],
    )
  ).rows[0];
  assert.equal(reuseAttempt.evidence.recipientHandling, "reuse_existing");
  const reuseCompleted = await reuseCall("record_preparation", {
    ...firstDraft,
    recovery: undefined,
    attemptId: reuseClaim.body.attemptId,
    preparationHash: reuseClaim.body.preparationHash,
    quote: {
      ...finalQuote,
      observedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    },
    draftId: "reuse-contact-draft",
    reviewUrl:
      "https://www.remitly.com/us/en/transfer/review?draftId=reuse-contact-draft",
  });
  assert.equal(reuseCompleted.status, 200, JSON.stringify(reuseCompleted));
  assert.equal(reuseCompleted.body.status, "awaiting_human_review");
  assert.deepEqual(await reuseFunds(), reuseBefore);
  console.log(
    "PASS actual Maker MCP retries with saved matching contact, no invented provider ID or absence claim, immediately prepares with reuse directive and preserves recipient/reservation",
  );
  await leaseCall(otherMaker.token, "release", {
    leaseId: continuousLease.leaseId,
    reason: "Saved fixture ready for independent check",
  });
  const continuousCheckLease = (
    await leaseCall(checker.token, "acquire", {
      idempotencyKey: "continuous-check",
    })
  ).body;
  const checkContinuous = await action(
    checker.token,
    continuousWd.id,
    "check",
    {
      attemptId: begun.body.attemptId,
      quoteHash: completed.body.quote.hash,
      evidence: "Independent saved draft check",
      recipientMatches: true,
      amountsMatch: true,
      reservationMatches: true,
      historyInspected: true,
      historyCoverage: "Full fixture contact/draft/activity coverage",
      oneTime: true,
      autoSend: false,
    },
    continuousCheckLease.leaseId,
  );
  assert.equal(
    checkContinuous.status,
    200,
    JSON.stringify(checkContinuous.body),
  );
  assert.equal(checkContinuous.body.checker.status, "passed");
  const firstCheck = {
    attemptId: firstBegin.body.attemptId,
    quoteHash: firstCompleted.body.quote.hash,
    recipientMatches: true,
    amountsMatch: true,
    reservationMatches: true,
    historyInspected: true,
    historyCoverage: "Independent fixture history coverage",
    oneTime: true,
    autoSend: false,
    evidence: "Independent fixture verifies reopened first-time draft",
  };
  const withoutReopen = await action(
    checker.token,
    firstWd.id,
    "check",
    firstCheck,
    continuousCheckLease.leaseId,
  );
  assert.equal(withoutReopen.status, 200);
  assert.equal(withoutReopen.body.checker.status, "needs_attention");
  assert.equal(
    (
      await call("/admin-data/withdrawals/" + firstWd.id + "/release", {
        user: "owner",
        method: "POST",
        body: firstRelease,
      })
    ).status,
    409,
  );
  const firstChecked = await action(
    checker.token,
    firstWd.id,
    "check",
    { ...firstCheck, draftReopened: true },
    continuousCheckLease.leaseId,
  );
  assert.equal(firstChecked.status, 200, JSON.stringify(firstChecked));
  assert.equal(firstChecked.body.checker.status, "passed");
  assert.equal(
    (
      await call("/admin-data/withdrawals/" + firstWd.id + "/release", {
        user: "owner",
        method: "POST",
        body: { ...firstRelease, providerReference: undefined },
      })
    ).status,
    400,
    "New first-time draft human record requires actual provider reference, no link copying",
  );
  const firstReleased = await call(
    "/admin-data/withdrawals/" + firstWd.id + "/release",
    { user: "owner", method: "POST", body: firstRelease },
  );
  assert.equal(firstReleased.status, 200, JSON.stringify(firstReleased));
  assert.equal(firstReleased.body.status, "awaiting_recipient");
  assert.equal(firstReleased.body.providerOnboardingStatus, "pending");
  assert.equal(firstReleased.body.providerLink, null);
  assert.equal(
    (await api.adminWithdrawalDetail(pool, firstWd.id, "operator-business"))
      .pendingFirstTimeRecipient,
    false,
  );
  const firstAfter = await firstBefore();
  assert.deepEqual(firstAfter.ledger, unverifiedFirst.ledger);
  assert.deepEqual(firstAfter.balance, unverifiedFirst.balance);
  console.log(
    "PASS verified saved first-time unsent draft through actual Maker MCP: atomic quote/draft, rejected missing proof/ID/URL/stale binding/duplicate, visible pending flag, independent reopen check, human reference and unchanged reserved coins",
  );
  await leaseCall(checker.token, "release", {
    leaseId: continuousCheckLease.leaseId,
    reason: "Fixture independent check complete; human remains required",
  });
  console.log(
    "PASS continuous preparation via actual Maker MCP: pre-quote claim, owned renewal, duplicate protection, atomic final quote+draft, rollback on bad/expired quote or draft, independent checker binding, unchanged reservation and no extra approval",
  );
  const rate = await issue("maker", "rate");
  await pool.query(
    "UPDATE payout_operator_credentials SET rate_window=date_trunc('minute',clock_timestamp()),request_count=120 WHERE id=$1",
    [rate.credential.id],
  );
  assert.equal(
    (await call("/api/payout-operator/identity", { token: rate.token })).status,
    429,
  );
  await assert.rejects(
    () => pool.query("DELETE FROM payout_operator_events"),
    /append-only/,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer count FROM creator_cash_ledger WHERE kind NOT IN('reservation','release','settlement')",
      )
    ).rows[0].count,
    0,
  );
  console.log(
    "PASS bounded per-credential request rates and immutable operator audit without cash minting",
  );
} finally {
  await preparationClient?.close();
  if (server) await new Promise((r) => server.close(r));
  if (pool) await pool.end();
  if (started)
    execFileSync(
      "pg_ctl",
      ["-D", join(temporary, "data"), "-m", "immediate", "-w", "stop"],
      { stdio: "pipe" },
    );
  rmSync(output, { force: true });
  rmSync(temporary, { recursive: true, force: true });
}
