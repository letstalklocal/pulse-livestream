import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  POLICY,
  listWithdrawals,
  adminWithdrawalDetail,
  WithdrawalError,
} from "./creatorWithdrawals";
type Row = Record<string, any>;
export type Sql = {
  query(
    sql: string,
    values?: any[],
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
};
export type Database = Sql & { connect(): Promise<Sql & { release(): void }> };
export type Operator = {
  id: string;
  name: string;
  role: "maker" | "checker" | "reconciler";
  environment: "development" | "production";
  accountKey: string;
  actor: string;
};
export class OperatorError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const PLAYBOOK_VERSION = "2026-10-04.1";
// Compatible MCP/profile version stays fixed; workflow instructions have their own revision.
export const WORKFLOW_REVISION = "2026-10-08.4";
export const operatorEnvironment = (): Operator["environment"] =>
  process.env.NODE_ENV === "production" ? "production" : "development";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const fail = (m: string, s = 400): never => {
  throw new OperatorError(m, s);
};
const text = (v: unknown, label: string, max = 200): string =>
  typeof v === "string" &&
  v.trim() &&
  v.length <= max &&
  !/[\u0000-\u001f]/.test(v)
    ? v.trim()
    : fail(`Invalid ${label}.`);
export function strictObject(v: unknown, keys: string[]): Row {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !keys.includes(k))
  )
    fail("Unsupported operator request fields.");
  return v as Row;
}
const metadata = (r: Row) => ({
  id: r.id,
  name: r.name,
  role: r.role,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
  lastUsedAt: r.last_seen_at,
  accountKey: r.account_key,
  environment: r.environment,
});
async function transaction<T>(db: Database, fn: (c: Sql) => Promise<T>) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL lock_timeout = '5s'");
    await c.query("SET LOCAL statement_timeout = '15s'");
    await c.query("SET LOCAL idle_in_transaction_session_timeout = '20s'");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function operatorAudit(
  db: Sql,
  op: Operator,
  action: string,
  target: string | null = null,
  meta: Row = {},
) {
  await db.query(
    "INSERT INTO payout_operator_events(environment,account_key,actor,action,target,metadata) VALUES($1,$2,$3,$4,$5,$6)",
    [
      op.environment,
      op.accountKey,
      op.actor,
      action,
      target,
      JSON.stringify(meta),
    ],
  );
}
export async function listCredentials(
  db: Sql,
  accountKey: string,
  actor: string,
) {
  const environment = operatorEnvironment();
  const result = await db.query(
    "SELECT * FROM payout_operator_credentials WHERE environment=$1 AND account_key=$2 ORDER BY created_at DESC LIMIT 500",
    [environment, accountKey],
  );
  await operatorAudit(
    db,
    { id: actor, name: "owner", role: "maker", actor, environment, accountKey },
    "credentials.list",
  );
  return { credentials: result.rows.map(metadata) };
}
export async function issueCredential(
  db: Database,
  accountKey: string,
  input: unknown,
  actor: string,
) {
  const b = strictObject(input, ["name", "role", "expiresAt"]);
  const name = text(b.name, "operator name", 100);
  if (!["maker", "checker", "reconciler"].includes(b.role))
    fail("Operator role must be maker, checker or reconciler.");
  const now = Date.now(),
    expires =
      b.expiresAt === undefined
        ? new Date(now + 7 * 86400000)
        : new Date(text(b.expiresAt, "credential expiry"));
  if (
    !Number.isFinite(expires.getTime()) ||
    expires.getTime() <= now ||
    expires.getTime() > now + 30 * 86400000
  )
    fail(
      "Credential expiry must be in the future and no more than 30 days away.",
    );
  const token = `pulse_op_${randomBytes(32).toString("hex")}`,
    id = `op_${randomUUID()}`,
    environment = operatorEnvironment();
  return transaction(db, async (c) => {
    const r = (
      await c.query(
        "INSERT INTO payout_operator_credentials(id,name,role,environment,account_key,token_hash,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        [
          id,
          name,
          b.role,
          environment,
          accountKey,
          hash(token),
          actor,
          expires,
        ],
      )
    ).rows[0];
    await operatorAudit(
      c,
      {
        id: actor,
        name: "owner",
        role: "maker",
        actor,
        environment,
        accountKey,
      },
      "credential.issued",
      id,
      { role: b.role },
    );
    return { credential: metadata(r), token };
  });
}
export async function authenticateOperator(
  db: Sql,
  authorization: unknown,
  accountKey: string,
): Promise<Operator> {
  if (
    typeof authorization !== "string" ||
    !/^Bearer pulse_op_[a-f0-9]{64}$/.test(authorization)
  )
    fail("Valid payout operator credential required.", 401);
  const token = (authorization as string).slice(7),
    environment = operatorEnvironment();
  const credential = (
    await db.query(
      "SELECT id,name,role FROM payout_operator_credentials WHERE token_hash=$1 AND environment=$2 AND account_key=$3 AND revoked_at IS NULL AND expires_at>clock_timestamp()",
      [hash(token), environment, accountKey],
    )
  ).rows[0];
  if (!credential)
    fail(
      "Operator credential is invalid, expired, revoked or outside this environment/account.",
      401,
    );
  const r = await db.query(
    `UPDATE payout_operator_credentials SET rate_window=date_trunc('minute',clock_timestamp()),request_count=CASE WHEN rate_window=date_trunc('minute',clock_timestamp()) THEN request_count+1 ELSE 1 END,last_seen_at=clock_timestamp() WHERE id=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp() AND (rate_window IS DISTINCT FROM date_trunc('minute',clock_timestamp()) OR request_count<120) RETURNING id`,
    [credential.id],
  );
  if (!r.rows.length) {
    const still = (
      await db.query(
        "SELECT 1 FROM payout_operator_credentials WHERE id=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()",
        [credential.id],
      )
    ).rows.length;
    if (!still) fail("Operator credential is no longer active.", 401);
    fail("Operator request limit reached; wait until the next minute.", 429);
  }
  return {
    ...credential,
    environment,
    accountKey,
    actor: `operator:${credential.id}`,
  } as Operator;
}
export function requireOperatorRole(op: Operator, roles: Operator["role"][]) {
  if (!roles.includes(op.role))
    fail("This operator role cannot perform that action.", 403);
}
const capabilities = {
  maker: [
    "read_identity",
    "list_withdrawals",
    "get_withdrawal",
    "get_playbook",
    "acquire_browser_lease",
    "renew_browser_lease",
    "release_browser_lease",
    "heartbeat",
    "record_quote",
    "begin_preparation",
    "record_preparation",
    "renew_preparation_lease",
    "release_preparation_lease",
    "record_unknown",
  ],
  checker: [
    "read_identity",
    "list_withdrawals",
    "get_withdrawal",
    "get_playbook",
    "acquire_browser_lease",
    "renew_browser_lease",
    "release_browser_lease",
    "heartbeat",
    "check_preparation",
  ],
  reconciler: [
    "read_identity",
    "list_withdrawals",
    "get_withdrawal",
    "get_playbook",
    "acquire_browser_lease",
    "renew_browser_lease",
    "release_browser_lease",
    "heartbeat",
    "reconcile",
    "resolve_recipient_error",
    "record_unknown",
  ],
};
export async function identity(db: Sql, op: Operator) {
  const paused =
    (
      await db.query(
        "SELECT preparation_paused FROM creator_payout_settings WHERE id=1",
      )
    ).rows[0]?.preparation_paused ?? true;
  await operatorAudit(db, op, "identity.read");
  return {
    environment: op.environment,
    accountKey: op.accountKey,
    operator: { id: op.id, name: op.name, role: op.role },
    policy: POLICY,
    preparationPaused: paused,
    playbookVersion: PLAYBOOK_VERSION,
    workflowRevision: WORKFLOW_REVISION,
    capabilities: capabilities[op.role],
  };
}
export async function operatorWithdrawals(
  db: Sql,
  op: Operator,
  limitInput: unknown,
) {
  const limit = limitInput === undefined ? 25 : Number(limitInput);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    fail("Withdrawal limit must be an integer between 1 and 100.");
  const allowed = {
    maker: [
      "awaiting_quote",
      "awaiting_confirmation",
      "requested",
      "preparing",
    ],
    checker: ["awaiting_human_review"],
    reconciler: ["awaiting_recipient", "processing", "unknown", "expired"],
  }[op.role];
  const queue = await listWithdrawals(db, op.accountKey, {
    statuses: allowed,
    limit,
    oldestFirst: true,
  });
  const rows = queue.withdrawals;
  await operatorAudit(db, op, "withdrawals.list", null, { limit });
  return { withdrawals: rows, truncated: queue.truncated };
}
export async function operatorDetail(db: Sql, op: Operator, id: string) {
  const result = await adminWithdrawalDetail(db, id, op.accountKey);
  await operatorAudit(db, op, "withdrawal.read", id);
  return result;
}
const leaseResult = (r: Row) => ({
  id: r.id,
  leaseId: r.id,
  resource: "remitly-browser",
  fencingToken: String(r.fencing_token),
  expiresAt: new Date(r.expires_at).toISOString(),
  operatorId: r.credential_id,
});
async function scopeLock(c: Sql, op: Operator) {
  await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `payout-browser:${op.environment}:${op.accountKey}`,
  ]);
}
async function activeCredential(c: Sql, op: Operator) {
  if (
    !(
      await c.query(
        "SELECT 1 FROM payout_operator_credentials WHERE id=$1 AND environment=$2 AND account_key=$3 AND role=$4 AND revoked_at IS NULL AND expires_at>clock_timestamp()",
        [op.id, op.environment, op.accountKey, op.role],
      )
    ).rows.length
  )
    fail("Operator credential is no longer active.", 401);
}
async function quarantine(c: Sql, lease: Row, reason: string) {
  const actor = `operator:${lease.credential_id}`;
  const attempts = (
    await c.query(
      "SELECT id,withdrawal_id FROM creator_payout_attempts WHERE account_key=$1 AND maker=$2 AND state='preparing' ORDER BY withdrawal_id,id",
      [lease.account_key, actor],
    )
  ).rows;
  for (const a of attempts) {
    // Match the financial domain's withdrawal → creator → attempt lock order.
    const w = (
      await c.query(
        "SELECT user_id,status FROM creator_withdrawals WHERE id=$1 FOR UPDATE",
        [a.withdrawal_id],
      )
    ).rows[0];
    if (!w || w.status !== "preparing") continue;
    await c.query("SELECT pg_advisory_xact_lock($1)", [w.user_id]);
    const changed = await c.query(
      "UPDATE creator_payout_attempts SET state='unknown',updated_at=now() WHERE id=$1 AND state='preparing' RETURNING id",
      [a.id],
    );
    if (!changed.rows.length) continue;
    await c.query(
      "UPDATE creator_withdrawals SET status='unknown',checker=NULL,updated_at=now() WHERE id=$1",
      [a.withdrawal_id],
    );
    await c.query(
      "INSERT INTO creator_payout_events(withdrawal_id,user_id,actor,action,evidence) VALUES($1,$2,$3,'operator_browser_interrupted',$4)",
      [
        a.withdrawal_id,
        w.user_id,
        actor,
        JSON.stringify({ attemptId: a.id, leaseId: lease.id, reason }),
      ],
    );
  }
}
export async function acquireBrowserLease(
  db: Database,
  op: Operator,
  input: unknown,
) {
  const b = strictObject(input, ["idempotencyKey", "durationSeconds"]);
  const key = text(b.idempotencyKey, "lease idempotency key", 100),
    duration = b.durationSeconds ?? 300;
  if (!Number.isInteger(duration) || duration < 30 || duration > 900)
    fail("Browser lease duration must be 30–900 seconds.");
  return transaction(db, async (c) => {
    await scopeLock(c, op);
    await activeCredential(c, op);
    const old = (
      await c.query(
        "SELECT * FROM payout_operator_browser_leases WHERE credential_id=$1 AND idempotency_key=$2",
        [op.id, key],
      )
    ).rows[0];
    if (old) {
      if (old.duration_seconds !== duration)
        fail("Lease idempotency key reused with different duration.", 409);
      if (old.state !== "active" || Date.parse(old.expires_at) <= Date.now())
        fail(
          "Previous lease expired/released; use a new idempotency key.",
          409,
        );
      return leaseResult(old);
    }
    const busy = (
      await c.query(
        "SELECT * FROM payout_operator_browser_leases WHERE environment=$1 AND account_key=$2 AND resource='remitly-browser' AND state='active' FOR UPDATE",
        [op.environment, op.accountKey],
      )
    ).rows[0];
    if (busy) {
      if (Date.parse(busy.expires_at) > Date.now())
        fail(
          "The Remitly browser is leased by another run. Retry after release; do not open parallel browser preparation.",
          409,
        );
      await quarantine(
        c,
        busy,
        "Exclusive browser lease expired; provider outcome may be uncertain",
      );
      await c.query(
        "UPDATE payout_operator_browser_leases SET state='expired',updated_at=now() WHERE id=$1",
        [busy.id],
      );
    }
    const fence =
      BigInt(
        (
          await c.query(
            "SELECT COALESCE(max(fencing_token),0)::text value FROM payout_operator_browser_leases WHERE environment=$1 AND account_key=$2",
            [op.environment, op.accountKey],
          )
        ).rows[0].value,
      ) + 1n;
    const row = (
      await c.query(
        "INSERT INTO payout_operator_browser_leases(id,credential_id,environment,account_key,resource,idempotency_key,duration_seconds,fencing_token,state,expires_at) VALUES($1,$2,$3,$4,'remitly-browser',$5,$6,$7,'active',clock_timestamp()+make_interval(secs=>$6::integer)) RETURNING *",
        [
          `browser_${randomUUID()}`,
          op.id,
          op.environment,
          op.accountKey,
          key,
          duration,
          fence.toString(),
        ],
      )
    ).rows[0];
    await operatorAudit(c, op, "browser.acquired", row.id, {
      fencingToken: fence.toString(),
    });
    return leaseResult(row);
  });
}
async function ownedLease(
  c: Sql,
  op: Operator,
  leaseId: unknown,
  allowExpired = false,
) {
  const id = text(leaseId, "browser lease ID");
  const row = (
    await c.query(
      "SELECT * FROM payout_operator_browser_leases WHERE id=$1 AND credential_id=$2 AND environment=$3 AND account_key=$4 FOR UPDATE",
      [id, op.id, op.environment, op.accountKey],
    )
  ).rows[0];
  if (
    !row ||
    row.state !== "active" ||
    (!allowExpired && Date.parse(row.expires_at) <= Date.now())
  )
    fail(
      "An active owned browser lease is required; expired leases cannot be renewed or reused.",
      409,
    );
  return row;
}
export async function renewBrowserLease(
  db: Database,
  op: Operator,
  input: unknown,
) {
  const b = strictObject(input, ["leaseId", "durationSeconds"]);
  const duration = b.durationSeconds ?? 300;
  if (!Number.isInteger(duration) || duration < 30 || duration > 900)
    fail("Browser lease duration must be 30–900 seconds.");
  return transaction(db, async (c) => {
    await scopeLock(c, op);
    await activeCredential(c, op);
    const lease = await ownedLease(c, op, b.leaseId);
    const r = (
      await c.query(
        "UPDATE payout_operator_browser_leases SET expires_at=clock_timestamp()+make_interval(secs=>$2::integer),updated_at=now() WHERE id=$1 RETURNING *",
        [lease.id, duration],
      )
    ).rows[0];
    await operatorAudit(c, op, "browser.renewed", lease.id);
    return leaseResult(r);
  });
}
export async function releaseBrowserLease(
  db: Database,
  op: Operator,
  input: unknown,
) {
  const b = strictObject(input, ["leaseId", "reason"]);
  const reason = text(b.reason, "browser release reason", 1000);
  return transaction(db, async (c) => {
    await scopeLock(c, op);
    await activeCredential(c, op);
    const old = (
      await c.query(
        "SELECT * FROM payout_operator_browser_leases WHERE id=$1 AND credential_id=$2 AND environment=$3 AND account_key=$4 FOR UPDATE",
        [b.leaseId, op.id, op.environment, op.accountKey],
      )
    ).rows[0];
    if (!old) fail("Browser lease not found.", 404);
    if (old.state !== "active") return { released: true };
    await quarantine(c, old, reason);
    await c.query(
      "UPDATE payout_operator_browser_leases SET state='released',updated_at=now() WHERE id=$1",
      [old.id],
    );
    await operatorAudit(c, op, "browser.released", old.id);
    return { released: true };
  });
}
export async function heartbeat(db: Database, op: Operator, input: unknown) {
  const b = strictObject(input, ["leaseId"]);
  return transaction(db, async (c) => {
    await activeCredential(c, op);
    const lease = b.leaseId
      ? leaseResult(await ownedLease(c, op, b.leaseId))
      : null;
    await operatorAudit(c, op, "heartbeat", lease?.id ?? null);
    return {
      ok: true,
      observedAt: new Date().toISOString(),
      operatorId: op.id,
      lease,
    };
  });
}
// Domain transactions use savepoints inside this transaction. The browser row
// remains locked through the financial mutation and final expiry/revocation check.
export async function withBrowserLease<T>(
  db: Database,
  op: Operator,
  leaseId: unknown,
  action: string,
  target: string,
  fn: (domainDb: Database) => Promise<T>,
): Promise<T> {
  return transaction(db, async (c) => {
    await activeCredential(c, op);
    const lease = await ownedLease(c, op, leaseId);
    const domainClient = {
      query: async (sql: string, values?: any[]) => {
        if (sql === "BEGIN")
          return c.query("SAVEPOINT operator_financial_domain");
        if (sql === "COMMIT")
          return c.query("RELEASE SAVEPOINT operator_financial_domain");
        if (sql === "ROLLBACK")
          return c.query("ROLLBACK TO SAVEPOINT operator_financial_domain");
        return c.query(sql, values);
      },
      release: () => {},
    };
    const scopedDb = {
      query: c.query.bind(c),
      connect: async () => domainClient,
    };
    const result = await fn(scopedDb);
    await activeCredential(c, op);
    if (
      !(
        await c.query(
          "SELECT 1 FROM payout_operator_browser_leases WHERE id=$1 AND state='active' AND expires_at>clock_timestamp()",
          [lease.id],
        )
      ).rows.length
    )
      fail(
        "Browser lease expired during operation; mutation rolled back.",
        409,
      );
    await operatorAudit(c, op, action, target, {
      leaseId: lease.id,
      fencingToken: String(lease.fencing_token),
    });
    return result;
  });
}
export async function revokeCredential(
  db: Database,
  accountKey: string,
  id: string,
  actor: string,
) {
  const environment = operatorEnvironment();
  return transaction(db, async (c) => {
    const r = (
      await c.query(
        "UPDATE payout_operator_credentials SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1 AND environment=$2 AND account_key=$3 RETURNING *",
        [id, environment, accountKey],
      )
    ).rows[0];
    if (!r) fail("Operator credential not found.", 404);
    const op: Operator = {
      id,
      name: r.name,
      role: r.role,
      environment,
      accountKey,
      actor,
    };
    await scopeLock(c, op);
    const leases = (
      await c.query(
        "SELECT * FROM payout_operator_browser_leases WHERE credential_id=$1 AND state='active' FOR UPDATE",
        [id],
      )
    ).rows;
    for (const l of leases) {
      await quarantine(
        c,
        l,
        "Operator credential revoked; interrupted preparation requires reconciliation",
      );
      await c.query(
        "UPDATE payout_operator_browser_leases SET state='released',updated_at=now() WHERE id=$1",
        [l.id],
      );
    }
    await operatorAudit(c, op, "credential.revoked", id);
    return { revoked: true, id };
  });
}
