import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { runMcpIntegration } from "./payout-mcp.real-service.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "pulse-operators-"));
const output = join(root, "tests", `.operators-${randomUUID()}.cjs`);
let pool,
  server,
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
    "2026-10-08.2",
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
