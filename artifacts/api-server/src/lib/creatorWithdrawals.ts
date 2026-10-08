import { createHash, randomUUID } from "node:crypto";
import { readCatalog } from "./payoutCatalog";
import { withdrawalProgress } from "./withdrawalProgress";
type Row = Record<string, any>;
type Sql = {
  query(
    sql: string,
    values?: any[],
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
};
type Database = Sql & { connect(): Promise<Sql & { release(): void }> };
export class WithdrawalError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const fail = (message: string, status = 400): never => {
  throw new WithdrawalError(message, status);
};
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Row)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v) ?? "null";
}
const hash = (v: unknown) =>
  createHash("sha256").update(canonical(v)).digest("hex");
const str = (v: unknown, label: string, max = 200) =>
  typeof v === "string" &&
  v.trim() &&
  v.length <= max &&
  !/[\u0000-\u001f]/.test(v)
    ? v.trim()
    : fail(`Invalid ${label}.`);
const note = (v: unknown, label: string, max = 5000) =>
  typeof v === "string" &&
  v.trim() &&
  v.length <= max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
    ? v.trim()
    : fail(`Invalid ${label}.`);
const integer = (v: unknown, label: string, max = 1000000) =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max
    ? Number(v)
    : fail(`Invalid ${label}.`);
function body(v: unknown, keys: string[]): Row {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !keys.includes(k))
  )
    fail("Unsupported request fields.");
  return v as Row;
}
const date = (v: unknown, label: string) => {
  const s = str(v, label);
  const d = new Date(s);
  if (!Number.isFinite(d.getTime()) || d.getTime() > Date.now() + 60000)
    fail(`Invalid ${label}.`);
  return d.toISOString();
};
const units = (ticks: bigint, divisor: bigint, precision: number) => {
  const sign = ticks < 0n ? "-" : "";
  const a = ticks < 0n ? -ticks : ticks;
  return `${sign}${a / divisor}.${(((a % divisor) * 10n ** BigInt(precision)) / divisor).toString().padStart(precision, "0")}`;
};
// All existing wallet coins, including purchases, gifts and grants, are redeemable.
// Individual creator enrollment and human final sending remain required.
export const FUNDING_POLICY_READY = true;
export const POLICY = {
  fundingPolicyReady: FUNDING_POLICY_READY,
  coinsPerUsd: 400,
  ticksPerUsd: 400,
  allWalletCoinsRedeemable: true,
  holdDays: 0,
  maxWithdrawalCents: 50000,
  firstMinimumCents: 1500,
  repeatAllowed: true,
};
async function tx<T>(db: Database, fn: (c: Sql) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
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
async function lock(c: Sql, uid: number) {
  await c.query("SELECT pg_advisory_xact_lock($1)", [uid]);
}
async function event(
  c: Sql,
  uid: number,
  actor: string,
  action: string,
  evidence: unknown = {},
  id: string | null = null,
) {
  await c.query(
    "INSERT INTO creator_payout_events(user_id,actor,action,evidence,withdrawal_id) VALUES($1,$2,$3,$4,$5)",
    [uid, actor, action, JSON.stringify(evidence), id],
  );
}
async function ledger(
  c: Sql,
  uid: number,
  kind: string,
  ref: string,
  a: bigint,
  r: bigint,
  actor: string,
  reason: string,
  id: string | null = null,
) {
  await c.query(
    "INSERT INTO creator_cash_ledger(user_id,kind,source_ref,available_ticks,reserved_ticks,actor,reason,withdrawal_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [uid, kind, ref, a.toString(), r.toString(), actor, reason, id],
  );
}
async function balances(c: Sql, uid: number) {
  const r = (
    await c.query(
      `SELECT COALESCE((SELECT balance FROM coin_balances WHERE user_id=$1),0)::text available,COALESCE((SELECT sum(reserved_ticks) FROM creator_cash_ledger WHERE user_id=$1),0)::text reserved`,
      [uid],
    )
  ).rows[0];
  const a = BigInt(r.available),
    v = BigInt(r.reserved);
  return {
    availableTicks: a.toString(),
    heldTicks: "0",
    reservedTicks: v.toString(),
    availableCoins: a.toString(),
    heldCoins: "0",
    reservedCoins: v.toString(),
    availableUsd: units(a, 400n, 4),
    heldUsd: "0.0000",
    reservedUsd: units(v, 400n, 4),
  };
}
async function walletChange(
  c: Sql,
  uid: number,
  change: bigint,
  ref: string,
  reason: string,
) {
  if (change === 0n) return;
  const delta = Number(change);
  if (!Number.isSafeInteger(delta))
    fail("Wallet adjustment is outside safe bounds.", 409);
  const updated = (
    await c.query(
      "UPDATE coin_balances SET balance=balance+$2,updated_at=now() WHERE user_id=$1 AND balance::bigint+$2 BETWEEN 0 AND 2147483647 RETURNING balance",
      [uid, delta],
    )
  ).rows[0];
  if (!updated)
    fail(
      change < 0n
        ? "Insufficient available wallet coins for this withdrawal."
        : "Wallet refund cannot be applied; investigate the wallet balance.",
      409,
    );
  await c.query(
    `INSERT INTO coin_transactions(from_user_id,to_user_id,amount,type,description,idempotency_key,balance_after) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [
      change < 0n ? uid : null,
      change > 0n ? uid : null,
      Math.abs(delta),
      change < 0n ? "withdrawal_hold" : "withdrawal_release",
      reason,
      ref,
      updated.balance,
    ],
  );
}
export async function enrollmentPreview(db: Sql, uid: number) {
  integer(uid, "user ID", 2147483647);
  if (uid < 1) fail("Invalid user ID.");
  const user = (
    await db.query("SELECT uid,name FROM users WHERE uid=$1", [uid])
  ).rows[0];
  if (!user) fail("Creator not found.", 404);
  const b = await balances(db, uid);
  return {
    userId: uid,
    name: user.name,
    walletCoins: b.availableCoins,
    availableUsd: b.availableUsd,
    alreadyEnrolled: !!(
      await db.query(
        "SELECT 1 FROM creator_cash_accounts WHERE user_id=$1 AND enabled=true",
        [uid],
      )
    ).rows.length,
  };
}
export async function enroll(db: Database, input: unknown, actor: string) {
  const b = body(input, ["userId", "expectedWalletCoins", "reason"]);
  const uid = integer(b.userId, "user ID", 2147483647);
  if (uid < 1) fail("Invalid user ID.");
  const expected = str(b.expectedWalletCoins, "preview wallet balance");
  if (!/^\d+$/.test(expected)) fail("Invalid preview wallet balance.");
  const reason = note(b.reason, "enrollment reason", 2000);
  return tx(db, async (c) => {
    await lock(c, uid);
    await c.query(
      "SELECT balance FROM coin_balances WHERE user_id=$1 FOR UPDATE",
      [uid],
    );
    const p = await enrollmentPreview(c, uid);
    if (p.alreadyEnrolled)
      fail("Creator already enrolled; enrollment does not add coins.", 409);
    if (p.walletCoins !== expected)
      fail("Wallet balance changed. Preview again before enrollment.", 409);
    await c.query(
      "INSERT INTO creator_cash_accounts(user_id,enrolled_by) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET enabled=true",
      [uid, actor],
    );
    await event(c, uid, actor, "enrolled", { ...p, reason, policy: POLICY });
    return { enrolled: true, userId: uid, balances: await balances(c, uid) };
  });
}
export async function saveRecipient(db: Database, uid: number, input: unknown) {
  const b = body(input, [
    "legalFirstName",
    "legalLastName",
    "secondSurname",
    "countryCode",
    "email",
    "phone",
  ]);
  const data = {
    legalFirstName: str(b.legalFirstName, "legal first name", 100),
    legalLastName: str(b.legalLastName, "legal last name", 100),
    secondSurname: b.secondSurname
      ? str(b.secondSurname, "second surname", 100)
      : null,
    countryCode: str(b.countryCode, "country", 2),
    email: str(b.email, "email", 254),
    phone: str(b.phone, "international phone", 20),
  };
  if (
    !/^[A-Z]{2}$/.test(data.countryCode) ||
    !/^\+\d{8,15}$/.test(data.phone) ||
    !/^\S+@\S+\.\S+$/.test(data.email)
  )
    fail("Use valid country, email and international phone.");
  return tx(db, async (c) => {
    await lock(c, uid);
    if (
      (
        await c.query(
          "SELECT 1 FROM creator_withdrawals WHERE user_id=$1 AND status NOT IN('delivered','failed','canceled','returned')",
          [uid],
        )
      ).rows.length
    )
      fail(
        "Contact changes are blocked while a withdrawal is unresolved.",
        409,
      );
    const r = await c.query(
      "INSERT INTO creator_payout_recipients(user_id,data) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET data=EXCLUDED.data,revision=creator_payout_recipients.revision+1,updated_at=now() RETURNING *",
      [uid, JSON.stringify(data)],
    );
    await event(c, uid, `creator:${uid}`, "contact_saved", {
      revision: r.rows[0].revision,
    });
    return { ...data, revision: r.rows[0].revision, status: "contact_saved" };
  });
}
const recipientIssueFields = ["phone", "email", "name", "other"] as const;
function recipientIssueInput(value: unknown) {
  const issue = body(value, ["code", "fields"]);
  if (
    issue.code !== "recipient_validation_failed" ||
    !Array.isArray(issue.fields) ||
    !issue.fields.length ||
    issue.fields.length > recipientIssueFields.length ||
    new Set(issue.fields).size !== issue.fields.length ||
    issue.fields.some((field) => !recipientIssueFields.includes(field))
  )
    fail("Invalid recipient validation issue.");
  return {
    code: "recipient_validation_failed" as const,
    fields: recipientIssueFields.filter((field) =>
      issue.fields.includes(field),
    ),
  };
}
const recipientIssueEvidence = (alias: string) =>
  `(SELECT jsonb_build_object('eventId',id::text,'details',evidence) FROM creator_payout_events WHERE withdrawal_id=${alias}.id AND action IN ('unknown','expired','human_declined','reconciled','preparation_lease_released_unknown','operator_browser_interrupted','recipient_error_resolved') ORDER BY id DESC LIMIT 1) recipient_issue_evidence`;
function publicRecipientIssue(r: Row) {
  if (!["unknown", "expired"].includes(r.status)) return null;
  const issue = r.recipient_issue_evidence?.details?.recipientIssue;
  if (
    issue?.code !== "recipient_validation_failed" ||
    !Array.isArray(issue.fields) ||
    !issue.fields.length ||
    issue.fields.length > recipientIssueFields.length ||
    new Set(issue.fields).size !== issue.fields.length ||
    issue.fields.some((field: any) => !recipientIssueFields.includes(field))
  )
    return null;
  const labels: Record<string, string> = {
    phone: "phone number",
    email: "email address",
    name: "legal name",
    other: "other recipient details",
  };
  return {
    code: "recipient_validation_failed" as const,
    fields: recipientIssueFields.filter((field) =>
      issue.fields.includes(field),
    ),
    message: `Remitly could not accept your saved recipient details: ${issue.fields.map((field: string) => labels[field]).join(", ")}. Your withdrawal is under review. Your coins remain reserved.`,
  };
}
const recipientCorrectionEvidence = (alias: string) =>
  `(SELECT evidence FROM creator_payout_events WHERE withdrawal_id=${alias}.id AND action='recipient_correction_submitted' ORDER BY id DESC LIMIT 1) recipient_correction_evidence,
   (SELECT CASE WHEN action='reconciled' THEN 'processing' ELSE 'recipient' END FROM creator_payout_events WHERE withdrawal_id=${alias}.id AND action IN ('human_release_recorded','reconciled') ORDER BY id DESC LIMIT 1) progress_recorded_stage`;
function publicRecipientCorrection(r: Row) {
  const correction = r.recipient_correction_evidence;
  if (
    !publicRecipientIssue(r) ||
    !correction ||
    correction.issueEventId !== r.recipient_issue_evidence.eventId ||
    correction.recipientVersion !== r.version
  )
    return null;
  return {
    hash: correction.hash,
    phone: correction.phone,
    email: correction.email,
    requestedAt: correction.requestedAt,
  };
}
const summary = (r: Row) => {
  const recipientIssue = publicRecipientIssue(r);
  const recipientCorrection = publicRecipientCorrection(r);
  const progress = withdrawalProgress({
    status: r.status,
    providerLink: r.provider_link,
    checker: r.checker,
    quote: r.quote,
    recipientIssue,
    recipientCorrection,
    recordedStage: r.progress_recorded_stage,
  });
  return {
    id: r.id,
    userId: r.user_id,
    status: r.status,
    grossCents: r.gross_cents,
    methodId: r.method_id,
    recipient: r.recipient,
    route: r.route,
    quote: r.quote,
    approvedQuoteHash: r.approved_quote_hash,
    checker: r.checker
      ? { status: r.checker.status, checkedAt: r.checker.checkedAt }
      : null,
    providerLink: r.provider_link,
    providerOnboardingStatus: r.provider_onboarding_status,
    recipientIssue,
    creatorStatus:
      progress.stage === "correction_saved"
        ? "correction_saved"
        : recipientIssue
          ? "error"
          : r.status,
    errorMessage:
      progress.stage === "correction_saved"
        ? null
        : (recipientIssue?.message ?? null),
    recipientCorrection,
    progress,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
};
export async function overview(db: Database, uid: number) {
  return tx(db, async (c) => {
    await lock(c, uid);
    const a = (
      await c.query("SELECT * FROM creator_cash_accounts WHERE user_id=$1", [
        uid,
      ])
    ).rows[0];
    const recipient = (
      await c.query(
        "SELECT * FROM creator_payout_recipients WHERE user_id=$1",
        [uid],
      )
    ).rows[0];
    const ws = (
      await c.query(
        `SELECT w.*,${recipientIssueEvidence("w")},${recipientCorrectionEvidence("w")} FROM creator_withdrawals w WHERE user_id=$1 ORDER BY created_at DESC`,
        [uid],
      )
    ).rows;
    return {
      enrolled: FUNDING_POLICY_READY && !!a?.enabled,
      balances: await balances(c, uid),
      policy: {
        ...POLICY,
        repeatAllowed: a?.repeat_allowed ?? true,
        holdDays: 0,
      },
      recipient: recipient
        ? {
            ...recipient.data,
            revision: recipient.revision,
            status: "contact_saved",
          }
        : null,
      withdrawals: ws.map(summary),
    };
  });
}
export async function requestWithdrawal(
  db: Database,
  uid: number,
  account: string,
  input: unknown,
) {
  const b = body(input, ["methodId", "withdrawalCents", "idempotencyKey"]);
  const methodId = str(b.methodId, "method ID", 250),
    key = str(b.idempotencyKey, "idempotency key", 100);
  const gross = integer(
    b.withdrawalCents,
    "withdrawal amount",
    POLICY.maxWithdrawalCents,
  );
  const reserved = BigInt(gross) * 4n;
  const requestHash = hash({ methodId, withdrawalCents: gross });
  return tx(db, async (c) => {
    await lock(c, uid);
    const old = (
      await c.query(
        `SELECT w.*,${recipientIssueEvidence("w")},${recipientCorrectionEvidence("w")} FROM creator_withdrawals w WHERE user_id=$1 AND idempotency_key=$2`,
        [uid, key],
      )
    ).rows[0];
    if (old) {
      if (old.request_hash !== requestHash)
        fail("Idempotency key reused for different request.", 409);
      return summary(old);
    }
    const a = (
      await c.query(
        "SELECT * FROM creator_cash_accounts WHERE user_id=$1 AND enabled",
        [uid],
      )
    ).rows[0];
    if (!a) fail("Withdrawals are not yet enabled for this creator.", 403);
    const returning =
      (
        await c.query(
          "SELECT 1 FROM creator_withdrawals WHERE user_id=$1 AND status IN('delivered','returned')",
          [uid],
        )
      ).rows.length > 0;
    if (!returning && gross !== 1500)
      fail("Your first withdrawal must be USD 15, including fees.");
    if (returning && gross < 2500)
      fail(
        "Later withdrawals must be between USD 25 and USD 500, including fees.",
      );
    if (
      (
        await c.query(
          "SELECT 1 FROM creator_withdrawals WHERE user_id=$1 AND status NOT IN('delivered','failed','canceled','returned')",
          [uid],
        )
      ).rows.length
    )
      fail("A withdrawal is already unresolved.", 409);
    const recipient = (
      await c.query(
        "SELECT * FROM creator_payout_recipients WHERE user_id=$1",
        [uid],
      )
    ).rows[0];
    if (!recipient) fail("Save recipient contact details first.");
    const catalog = await readCatalog(c, account);
    let route: Row | undefined;
    for (const p of catalog.providers)
      for (const country of p.countries)
        for (const method of country.methods)
          if (method.id === methodId)
            route = {
              providerId: p.id,
              provider: p.name,
              countryCode: country.countryCode,
              country: country.name,
              method: method.name,
              receiveCurrency: method.receiveCurrency,
              fundingMethod: "debit_card",
            };
    if (!route) fail("Method unavailable.", 409);
    if (route!.countryCode !== recipient.data.countryCode)
      fail("Recipient country must match selected method.");
    const bal = await balances(c, uid);
    if (BigInt(bal.availableTicks) < reserved)
      fail("Insufficient available wallet coins for this withdrawal.", 409);
    const id = `wd_${randomUUID()}`;
    await walletChange(
      c,
      uid,
      -reserved,
      `${id}:wallet-hold`,
      `Reserve ${reserved} coins for USD ${(gross / 100).toFixed(2)} gross withdrawal, including provider fees`,
    );
    const r = await c.query(
      "INSERT INTO creator_withdrawals(id,user_id,account_key,method_id,gross_cents,idempotency_key,request_hash,recipient,route) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
      [
        id,
        uid,
        account,
        methodId,
        gross,
        key,
        requestHash,
        JSON.stringify({ ...recipient.data, revision: recipient.revision }),
        JSON.stringify(route),
      ],
    );
    await ledger(
      c,
      uid,
      "reservation",
      `${id}:reserve`,
      -reserved,
      reserved,
      `creator:${uid}`,
      "Reserve gross while awaiting exact provider quote",
      id,
    );
    await event(c, uid, `creator:${uid}`, "awaiting_quote", {}, id);
    return summary(r.rows[0]);
  });
}
export async function withdrawalDetail(
  db: Sql,
  id: string,
  uid?: number,
  account?: string,
) {
  const r = (
    await db.query(
      `SELECT w.*,${recipientIssueEvidence("w")},${recipientCorrectionEvidence("w")} FROM creator_withdrawals w WHERE id=$1 AND ($2::integer IS NULL OR user_id=$2) AND ($3::text IS NULL OR account_key=$3)`,
      [id, uid ?? null, account ?? null],
    )
  ).rows[0];
  if (!r) fail("Withdrawal not found.", 404);
  const history = (
    await db.query(
      "SELECT action,created_at FROM creator_payout_events WHERE withdrawal_id=$1 ORDER BY id",
      [id],
    )
  ).rows.map((e) => ({ action: e.action, createdAt: e.created_at }));
  return { ...summary(r), history };
}
export async function approveQuote(
  db: Database,
  uid: number,
  id: string,
  input: unknown,
) {
  const b = body(input, ["quoteHash"]);
  const quoteHash = str(b.quoteHash, "quote hash");
  return tx(db, async (c) => {
    const w = await lockedWithdrawal(c, id, undefined, uid);
    // Older clients may still call this endpoint. The initial request provides
    // consent; this compatibility acknowledgement never approves an exact quote.
    if (
      !["requested", "awaiting_confirmation"].includes(w.status) ||
      w.quote?.hash !== quoteHash
    )
      fail(
        "Quote changed or request cannot be acknowledged. Reload details.",
        409,
      );
    if (w.status === "awaiting_confirmation") {
      await c.query(
        "UPDATE creator_withdrawals SET status='requested',updated_at=now() WHERE id=$1",
        [id],
      );
      await event(
        c,
        uid,
        `creator:${uid}`,
        "legacy_quote_acknowledged",
        { quoteHash },
        id,
      );
    }
    return withdrawalDetail(c, id, uid);
  });
}
async function lockedWithdrawal(
  c: Sql,
  id: string,
  account?: string,
  uid?: number,
) {
  const w = (
    await c.query(
      "SELECT * FROM creator_withdrawals WHERE id=$1 AND ($2::text IS NULL OR account_key=$2) AND ($3::integer IS NULL OR user_id=$3) FOR UPDATE",
      [id, account ?? null, uid ?? null],
    )
  ).rows[0];
  if (!w) fail("Withdrawal not found.", 404);
  await lock(c, w.user_id);
  return w;
}
export async function listWithdrawals(
  db: Sql,
  account: string,
  options?: { statuses?: string[]; limit?: number; oldestFirst?: boolean },
) {
  const limit = options?.limit ?? 500;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500)
    fail("Invalid payout queue limit.");
  const filter = options?.statuses ? " AND w.status=ANY($2::text[])" : "";
  const order = options?.oldestFirst
    ? "w.created_at ASC,w.id ASC"
    : "w.created_at DESC,w.id DESC";
  const rows = (
    await db.query(
      `SELECT w.*,${recipientIssueEvidence("w")},${recipientCorrectionEvidence("w")},u.name creator_name,a.state attempt_state,a.maker,a.provider_reference,a.evidence->>'deadline' review_deadline FROM creator_withdrawals w JOIN users u ON u.uid=w.user_id LEFT JOIN LATERAL (SELECT state,maker,provider_reference,evidence FROM creator_payout_attempts WHERE withdrawal_id=w.id ORDER BY created_at DESC LIMIT 1) a ON true WHERE w.account_key=$1${filter} ORDER BY ${order} LIMIT ${limit + 1}`,
      options?.statuses ? [account, options.statuses] : [account],
    )
  ).rows;
  return {
    truncated: rows.length > limit,
    withdrawals: rows.slice(0, limit).map((r) => ({
      ...summary(r),
      creatorName: r.creator_name,
      reviewDeadline: r.review_deadline,
      attemptState: r.attempt_state,
      maker: r.maker,
      providerReference: r.provider_reference,
    })),
    preparationPaused:
      (
        await db.query(
          "SELECT preparation_paused FROM creator_payout_settings WHERE id=1",
        )
      ).rows[0]?.preparation_paused ?? true,
    policy: POLICY,
  };
}
export async function setPause(db: Database, input: unknown, actor: string) {
  const b = body(input, ["paused", "reason"]);
  if (typeof b.paused !== "boolean") fail("Paused must be boolean.");
  const reason = note(b.reason, "reason", 2000);
  return tx(db, async (c) => {
    const saved = await c.query(
      "INSERT INTO creator_payout_settings(id,preparation_paused) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET preparation_paused=EXCLUDED.preparation_paused RETURNING preparation_paused",
      [b.paused],
    );
    await event(c, 0, actor, "preparation_pause", { paused: b.paused, reason });
    return { preparationPaused: saved.rows[0].preparation_paused };
  });
}
function providerSource(v: unknown) {
  const value = str(v, "provider source URL", 2000);
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    fail("Invalid provider source URL.");
  }
  if (
    u!.protocol !== "https:" ||
    u!.hostname !== "www.remitly.com" ||
    u!.username ||
    u!.password ||
    u!.port ||
    !["/us/en/homepage", "/us/en/transfer/send"].includes(u!.pathname)
  )
    fail(
      "Evidence must originate from signed-in Remitly Business transfer/homepage.",
    );
  return value;
}
export function safeProviderLink(v: unknown): string {
  const value = str(v, "provider link", 2000);
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    fail("Invalid provider link.");
  }
  if (
    u!.protocol !== "https:" ||
    u!.username ||
    u!.password ||
    u!.port ||
    u!.hash
  )
    fail("Unsafe provider URL.");
  const rules = (process.env.PULSE_PAYOUT_LINK_PREFIXES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    !rules.some((rule) => {
      try {
        const p = new URL(rule);
        return (
          p.protocol === "https:" &&
          (p.hostname === "www.remitly.com" ||
            p.hostname.endsWith(".remitly.com")) &&
          u!.origin === p.origin &&
          u!.pathname.startsWith(p.pathname)
        );
      } catch {
        return false;
      }
    })
  )
    fail(
      "Provider link path is not verified/configured for this account.",
      409,
    );
  return value;
}
export async function recordQuote(
  db: Database,
  account: string,
  id: string,
  input: unknown,
  actor: string,
) {
  const b = body(input, [
    "methodId",
    "sendAmountCents",
    "feeCents",
    "taxCents",
    "promotionalDiscountCents",
    "receiveAmount",
    "receiveCurrency",
    "fundingMethod",
    "providerMinimumSendCents",
    "source",
    "sourceUrl",
    "observedAt",
    "expiresAt",
    "evidence",
  ]);
  const send = integer(
      b.sendAmountCents,
      "send amount",
      POLICY.maxWithdrawalCents,
    ),
    fee = integer(b.feeCents, "fee", POLICY.maxWithdrawalCents),
    tax = integer(b.taxCents, "tax", POLICY.maxWithdrawalCents),
    promo = integer(
      b.promotionalDiscountCents,
      "promotion",
      POLICY.maxWithdrawalCents,
    );
  if (send <= 0)
    fail(
      "Send amount must be positive. Promotions cannot fund the withdrawal.",
    );
  const minimum = integer(
    b.providerMinimumSendCents,
    "verified route minimum",
    POLICY.maxWithdrawalCents,
  );
  if (send < minimum) fail("Send amount is below verified provider minimum.");
  if (b.source !== "signed_in_remitly_business")
    fail("Quote requires signed-in Remitly Business evidence.");
  const sourceUrl = providerSource(b.sourceUrl);
  const observedAt = date(b.observedAt, "observation date");
  const expiresAt = str(b.expiresAt, "expiry");
  if (
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) <= Date.now() ||
    Date.parse(expiresAt) > Date.now() + 86400000 ||
    Date.parse(observedAt) < Date.now() - 86400000
  )
    fail("Quote must be recent and expire within 24 hours.");
  const evidence = note(b.evidence, "quote evidence", 5000);
  const receiveAmount = str(b.receiveAmount, "receive amount", 40);
  if (!/^\d+(\.\d{1,8})?$/.test(receiveAmount) || !/[1-9]/.test(receiveAmount))
    fail("Receive amount must be an exact positive decimal.");
  return tx(db, async (c) => {
    const w = await lockedWithdrawal(c, id, account);
    if (send + fee + tax > w.gross_cents)
      fail(
        "Send, fee and taxes must fit the requested gross amount. Promotions cannot fund the withdrawal.",
      );
    if (
      !["awaiting_quote", "awaiting_confirmation", "requested"].includes(
        w.status,
      )
    )
      fail(
        "Cannot change quote after preparation; resolve the attempt first.",
        409,
      );
    if (
      b.methodId !== w.method_id ||
      b.receiveCurrency !== w.route.receiveCurrency ||
      b.fundingMethod !== w.route.fundingMethod
    )
      fail("Quote route/currency/funding method does not match request.");
    const q = {
      methodId: w.method_id,
      sendAmountCents: send,
      feeCents: fee,
      taxCents: tax,
      promotionalDiscountCents: promo,
      totalEarningsDeductedCents: send + fee + tax,
      receiveAmount,
      receiveCurrency: b.receiveCurrency,
      fundingMethod: b.fundingMethod,
      providerMinimumSendCents: minimum,
      source: b.source,
      sourceUrl,
      observedAt,
      expiresAt,
      recipientHash: hash(w.recipient),
      evidenceHash: hash(evidence),
    };
    const quote = { ...q, hash: hash(q) };
    await c.query(
      "UPDATE creator_withdrawals SET quote=$2,status='requested',approved_quote_hash=NULL,checker=NULL,version=version+1,updated_at=now() WHERE id=$1",
      [id, JSON.stringify(quote)],
    );
    await event(c, w.user_id, actor, "quote_recorded", { quote, evidence }, id);
    return withdrawalDetail(c, id, undefined, account);
  });
}
const binding = (w: Row) =>
  hash({
    id: w.id,
    version: w.version,
    quote: w.quote?.hash,
    recipient: w.recipient,
    route: w.route,
    gross: w.gross_cents,
  });
export async function prepare(
  db: Database,
  account: string,
  id: string,
  input: unknown,
  actor: string,
) {
  const b = body(input, ["quoteHash", "evidence"]);
  const evidence = note(b.evidence, "preparation reason", 5000);
  return tx(db, async (c) => {
    const w = await lockedWithdrawal(c, id, account);
    if (
      (
        await c.query(
          "SELECT preparation_paused FROM creator_payout_settings WHERE id=1 FOR SHARE",
        )
      ).rows[0]?.preparation_paused ??
      true
    )
      fail("Preparation is paused.", 409);
    if (
      !["requested", "awaiting_confirmation"].includes(w.status) ||
      !w.quote ||
      b.quoteHash !== w.quote.hash ||
      w.quote.methodId !== w.method_id ||
      w.quote.receiveCurrency !== w.route.receiveCurrency ||
      w.quote.fundingMethod !== w.route.fundingMethod ||
      w.quote.recipientHash !== hash(w.recipient) ||
      w.quote.sendAmountCents + w.quote.feeCents + w.quote.taxCents >
        w.gross_cents ||
      !Number.isFinite(Date.parse(w.quote.expiresAt)) ||
      Date.parse(w.quote.expiresAt) <= Date.now()
    )
      fail(
        "Current matching provider quote required before preparation; refresh stale quotes.",
        409,
      );
    const bal = await balances(c, w.user_id);
    if (BigInt(bal.reservedTicks) < BigInt(w.gross_cents) * 4n)
      fail("Reservation is missing.", 409);
    const attemptId = `attempt_${randomUUID()}`;
    await c.query(
      "INSERT INTO creator_payout_attempts(id,withdrawal_id,account_key,maker,binding_hash,lease_until,evidence) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes',$6)",
      [attemptId, id, account, actor, binding(w), JSON.stringify({ evidence })],
    );
    await c.query(
      "UPDATE creator_withdrawals SET status='preparing',checker=NULL,updated_at=now() WHERE id=$1",
      [id],
    );
    await event(c, w.user_id, actor, "preparing", { attemptId, evidence }, id);
    return {
      ...(await withdrawalDetail(c, id, undefined, account)),
      attemptId,
    };
  });
}
export async function completePreparation(
  db: Database,
  account: string,
  id: string,
  input: unknown,
  actor: string,
) {
  const b = body(input, [
    "attemptId",
    "quoteHash",
    "draftId",
    "reviewUrl",
    "deadline",
    "oneTime",
    "autoSend",
    "recipientMatches",
    "amountsMatch",
    "historyInspected",
    "historyCoverage",
    "evidence",
    "kind",
  ]);
  const evidence = note(b.evidence, "preparation evidence", 5000);
  const coverage = note(b.historyCoverage, "provider history coverage", 2000);
  if (!["first_time_link", "scheduled"].includes(b.kind))
    fail("Specify first-time link or one-time scheduled preparation.");
  if (
    b.recipientMatches !== true ||
    b.amountsMatch !== true ||
    b.historyInspected !== true ||
    b.oneTime !== true ||
    b.autoSend !== false
  )
    fail("All preparation checks must be confirmed; auto-send must be off.");
  return tx(db, async (c) => {
    const w = await lockedWithdrawal(c, id, account);
    const a = (
      await c.query(
        "SELECT * FROM creator_payout_attempts WHERE id=$1 AND withdrawal_id=$2 FOR UPDATE",
        [b.attemptId, id],
      )
    ).rows[0];
    if (
      !a ||
      a.maker !== actor ||
      a.state !== "preparing" ||
      w.status !== "preparing" ||
      Date.parse(a.lease_until) <= Date.now()
    )
      fail(
        "Preparation lease expired or actor/attempt changed. Record unknown and reconcile.",
        409,
      );
    if (b.quoteHash !== w.quote?.hash || a.binding_hash !== binding(w))
      fail("Preparation changed; check current request.", 409);
    const deadline = str(b.deadline, "review deadline");
    if (
      !Number.isFinite(Date.parse(deadline)) ||
      Date.parse(deadline) < Date.now() + 5 * 60000
    )
      fail("Review deadline must allow at least five minutes.");
    const draftId = b.draftId ? str(b.draftId, "draft ID") : null;
    const reviewUrl = b.reviewUrl ? safeProviderLink(b.reviewUrl) : null;
    if (b.kind === "scheduled" && (!draftId || !reviewUrl))
      fail("Scheduled draft requires ID and approved review URL.");
    if (
      b.kind === "scheduled" &&
      new URL(reviewUrl!).searchParams.get("scheduledDraftId") !== draftId
    )
      fail("Review URL scheduledDraftId must match the recorded draft ID.");
    const details = {
      kind: b.kind,
      quoteHash: b.quoteHash,
      deadline,
      reviewUrl,
      oneTime: true,
      autoSend: false,
      recipientMatches: true,
      amountsMatch: true,
      historyInspected: true,
      historyCoverage: coverage,
      evidence,
    };
    await c.query(
      "UPDATE creator_payout_attempts SET state='awaiting_human_review',draft_id=$2,evidence=$3,updated_at=now() WHERE id=$1",
      [a.id, draftId, JSON.stringify(details)],
    );
    await c.query(
      "UPDATE creator_withdrawals SET status='awaiting_human_review',updated_at=now() WHERE id=$1",
      [id],
    );
    await event(
      c,
      w.user_id,
      actor,
      "preparation_recorded",
      { attemptId: a.id, ...details },
      id,
    );
    return withdrawalDetail(c, id, undefined, account);
  });
}
export async function check(
  db: Database,
  account: string,
  id: string,
  input: unknown,
  actor: string,
) {
  const b = body(input, [
    "attemptId",
    "quoteHash",
    "recipientMatches",
    "amountsMatch",
    "reservationMatches",
    "historyInspected",
    "historyCoverage",
    "oneTime",
    "autoSend",
    "evidence",
  ]);
  const evidence = note(b.evidence, "independent check evidence", 5000),
    coverage = note(
      b.historyCoverage,
      "independently inspected history coverage",
      2000,
    );
  return tx(db, async (c) => {
    const w = await lockedWithdrawal(c, id, account);
    const a = (
      await c.query(
        "SELECT * FROM creator_payout_attempts WHERE id=$1 AND withdrawal_id=$2 FOR UPDATE",
        [b.attemptId, id],
      )
    ).rows[0];
    if (!a || a.maker === actor)
      fail("Checker must be a different operator from the maker.", 403);
    if (
      w.status !== "awaiting_human_review" ||
      a.state !== "awaiting_human_review" ||
      a.binding_hash !== binding(w) ||
      b.quoteHash !== w.quote?.hash ||
      !Number.isFinite(Date.parse(a.evidence?.deadline ?? "")) ||
      Date.parse(a.evidence?.deadline ?? "") <= Date.now() ||
      !Number.isFinite(Date.parse(w.quote.expiresAt)) ||
      Date.parse(w.quote.expiresAt) <= Date.now()
    )
      fail("Attempt/quote changed or deadline expired.", 409);
    const passed =
      b.recipientMatches === true &&
      b.amountsMatch === true &&
      b.reservationMatches === true &&
      b.historyInspected === true &&
      b.oneTime === true &&
      b.autoSend === false &&
      BigInt((await balances(c, w.user_id)).reservedTicks) >=
        BigInt(w.gross_cents) * 4n;
    const checker = {
      actor,
      status: passed ? "passed" : "needs_attention",
      bindingHash: a.binding_hash,
      attemptId: a.id,
      quoteHash: w.quote.hash,
      evidence,
      historyCoverage: coverage,
      checkedAt: new Date().toISOString(),
    };
    await c.query(
      "UPDATE creator_withdrawals SET checker=$2,updated_at=now() WHERE id=$1",
      [id, JSON.stringify(checker)],
    );
    await event(c, w.user_id, actor, "independent_check", checker, id);
    return withdrawalDetail(c, id, undefined, account);
  });
}
export async function humanRelease(
  db: Database,
  account: string,
  id: string,
  input: unknown,
  actor: string,
) {
  const b = body(input, [
    "attemptId",
    "quoteHash",
    "providerLink",
    "providerReference",
    "evidence",
    "releasedAt",
  ]);
  const evidence = note(b.evidence, "human release provider evidence", 5000);
  const releasedAt = date(b.releasedAt, "human release observation");
  const link = b.providerLink ? safeProviderLink(b.providerLink) : null;
  const reference = b.providerReference
    ? str(b.providerReference, "provider reference")
    : null;
  return tx(db, async (c) => {
    const w = await lockedWithdrawal(c, id, account);
    const a = (
      await c.query(
        "SELECT * FROM creator_payout_attempts WHERE id=$1 AND withdrawal_id=$2 FOR UPDATE",
        [b.attemptId, id],
      )
    ).rows[0];
    if (
      !a ||
      w.status !== "awaiting_human_review" ||
      a.state !== "awaiting_human_review" ||
      w.checker?.status !== "passed" ||
      w.checker?.bindingHash !== binding(w) ||
      w.checker.attemptId !== a.id ||
      b.quoteHash !== w.quote?.hash ||
      !Number.isFinite(Date.parse(a.evidence?.deadline ?? "")) ||
      Date.parse(a.evidence?.deadline ?? "") <= Date.now() ||
      !Number.isFinite(Date.parse(w.quote.expiresAt)) ||
      Date.parse(w.quote.expiresAt) <= Date.now()
    )
      fail("Current independent check and valid deadline required.", 409);
    const first = a.evidence?.kind === "first_time_link";
    // Remitly emails the first-time recipient link directly. Recording the
    // human's completed provider action does not require copying that link here.
    // Optional supplied links still pass the provider URL checks above.
    if (!first && !reference)
      fail("Released scheduled transfer requires provider reference.");
    const status = first ? "awaiting_recipient" : "processing";
    await c.query(
      "UPDATE creator_payout_attempts SET state=$2,provider_reference=$3,updated_at=now() WHERE id=$1",
      [a.id, status, reference],
    );
    await c.query(
      "UPDATE creator_withdrawals SET status=$2,provider_link=$3,provider_onboarding_status=$4,updated_at=now() WHERE id=$1",
      [id, status, link, first ? "pending" : "ready"],
    );
    await event(
      c,
      w.user_id,
      actor,
      "human_release_recorded",
      { attemptId: a.id, evidence, releasedAt, providerReference: reference },
      id,
    );
    return withdrawalDetail(c, id, undefined, account);
  });
}
export async function submitRecipientCorrection(
  db: Database,
  uid: number,
  id: string,
  input: unknown,
) {
  return saveRecipientCorrection(
    db,
    { uid, actor: `creator:${uid}` },
    id,
    input,
  );
}
export async function submitAdminRecipientCorrection(
  db: Database,
  account: string,
  id: string,
  input: unknown,
  actor: string,
) {
  return saveRecipientCorrection(db, { account, actor }, id, input);
}
async function saveRecipientCorrection(
  db: Database,
  scope: { uid?: number; account?: string; actor: string },
  id: string,
  input: unknown,
) {
  const b = body(input, ["phone", "email"]);
  if (b.phone === undefined && b.email === undefined)
    fail("Enter a corrected phone number or email address.");
  return tx(db, async (c) => {
    const w = await lockedWithdrawal(c, id, scope.account, scope.uid);
    const current = await withdrawalDetail(c, id, scope.uid, scope.account);
    if (
      !current.recipientIssue ||
      !current.recipientIssue.fields.some(
        (field) => field === "phone" || field === "email",
      )
    )
      fail("No correctable phone or email rejection is active.", 409);
    const phone =
      b.phone === undefined
        ? (current.recipientCorrection?.phone ?? w.recipient.phone)
        : str(b.phone, "international phone", 20);
    const email =
      b.email === undefined
        ? (current.recipientCorrection?.email ?? w.recipient.email)
        : str(b.email, "email", 254);
    if (!/^\+\d{8,15}$/.test(phone))
      fail(
        "Use an international phone number starting with + and 8 to 15 digits.",
      );
    if (!/^\S+@\S+\.\S+$/.test(email)) fail("Enter a valid email address.");
    const issue = (
      await c.query(
        `SELECT ${recipientIssueEvidence("w")} FROM creator_withdrawals w WHERE id=$1`,
        [id],
      )
    ).rows[0].recipient_issue_evidence;
    const correctionHash = hash({
      id,
      version: w.version,
      issueEventId: issue.eventId,
      phone,
      email,
    });
    if (current.recipientCorrection?.hash === correctionHash) return current;
    await event(
      c,
      w.user_id,
      scope.actor,
      "recipient_correction_submitted",
      {
        hash: correctionHash,
        phone,
        email,
        requestedAt: new Date().toISOString(),
        issueEventId: issue.eventId,
        recipientVersion: w.version,
      },
      id,
    );
    return withdrawalDetail(c, id, scope.uid, scope.account);
  });
}
// Owner classification records only the provider's rejected fields on an already
// uncertain attempt. It does not change payout status, contacts, quotes or funds.
export async function reportRecipientError(
  db: Database,
  account: string,
  id: string,
  input: unknown,
  actor: string,
) {
  const b = body(input, ["reason", "recipientIssue"]);
  const reason = note(b.reason, "recipient rejection evidence", 5000);
  const issue = recipientIssueInput(b.recipientIssue);
  return tx(db, async (c) => {
    const w = await lockedWithdrawal(c, id, account);
    if (!["unknown", "expired"].includes(w.status))
      fail(
        "Recipient error classification requires an existing withdrawal under review.",
        409,
      );
    if (
      !(
        await c.query(
          "SELECT 1 FROM creator_payout_attempts WHERE withdrawal_id=$1 AND state IN('unknown','expired')",
          [id],
        )
      ).rows.length
    )
      fail("No uncertain provider attempt exists for this withdrawal.", 409);
    await event(
      c,
      w.user_id,
      actor,
      w.status,
      { reason, recipientIssue: issue },
      id,
    );
    return withdrawalDetail(c, id, undefined, account);
  });
}
// Explicitly approved recovery: operator observations must establish that the
// original attempt has no payment/link effects before retaining its reservation
// for a fresh quote. This function never calls a provider or moves wallet funds.
async function recoverRecipientError(
  db: Database,
  account: string,
  id: string,
  input: unknown,
  actor: string,
  makerRetry = false,
) {
  const b = body(input, [
    ...(makerRetry ? ["noRecipientSaved", "noDraftSaved"] : []),
    "attemptId",
    "correctionHash",
    "observationId",
    "sourceUrl",
    "observedAt",
    "evidence",
    "historyCoverage",
    "historyInspected",
    "recipientRecordInspected",
    "recipientCorrectionApplied",
    "noRecipientLinkIssued",
    "noFundsSent",
    "noFundingDebit",
    "noPendingTransfers",
    "noUnknownTransfers",
    "previousDraftClosed",
  ]);
  const attemptId = str(b.attemptId, "attempt ID"),
    correctionHash = str(b.correctionHash, "correction hash"),
    observationId = str(b.observationId, "observation ID"),
    sourceUrl = providerSource(b.sourceUrl),
    observedAt = date(b.observedAt, "recovery observation"),
    evidence = note(b.evidence, "recovery evidence", 5000),
    historyCoverage = note(
      b.historyCoverage,
      "provider history coverage",
      2000,
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
  ])
    if (b[flag] !== true)
      fail(
        "Recovery requires confirmed correction, closed prior drafts and no recipient link, sent/debited funds, pending or uncertain transfer.",
        409,
      );
  if (Date.parse(observedAt) < Date.now() - 86400000)
    fail("Recovery provider observation must be recent.", 409);
  if (makerRetry && (b.noRecipientSaved !== true || b.noDraftSaved !== true))
    fail(
      "Maker retry requires confirmation that no provider recipient or draft was saved.",
      409,
    );
  const observationHash = hash(b);
  return tx(db, async (c) => {
    const w = await lockedWithdrawal(c, id, account);
    if (
      makerRetry &&
      ((
        await c.query(
          "SELECT preparation_paused FROM creator_payout_settings WHERE id=1 FOR SHARE",
        )
      ).rows[0]?.preparation_paused ??
        true)
    )
      fail("Preparation is paused.", 409);
    const old = (
      await c.query(
        "SELECT evidence FROM creator_payout_events WHERE withdrawal_id=$1 AND action='recipient_error_resolved' AND evidence->>'observationId'=$2",
        [id, observationId],
      )
    ).rows[0];
    if (old) {
      if (old.evidence.observationHash !== observationHash)
        fail("Recovery observation ID reused with different evidence.", 409);
      return withdrawalDetail(c, id, undefined, account);
    }
    const current = await withdrawalDetail(c, id, undefined, account);
    const correction = current.recipientCorrection;
    if (!correction)
      throw new WithdrawalError(
        "Latest pending recipient correction required.",
        409,
      );
    if (
      !current.recipientIssue ||
      !current.recipientIssue.fields.every(
        (field) => field === "phone" || field === "email",
      ) ||
      !current.recipientCorrection ||
      current.recipientCorrection.hash !== correctionHash
    )
      fail(
        "Current recipient error and latest pending correction required.",
        409,
      );
    if (Date.parse(observedAt) < Date.parse(correction.requestedAt))
      fail(
        "Provider recovery inspection must cover the latest correction.",
        409,
      );
    const attempts = (
      await c.query(
        "SELECT * FROM creator_payout_attempts WHERE withdrawal_id=$1 ORDER BY created_at FOR UPDATE",
        [id],
      )
    ).rows;
    const a = attempts.find((item) => item.id === attemptId);
    if (
      !a ||
      !["unknown", "expired"].includes(a.state) ||
      attempts.some(
        (item) =>
          item.id !== attemptId &&
          !["delivered", "failed", "canceled", "returned"].includes(item.state),
      )
    )
      fail(
        "The current uncertain recipient attempt must be inspected before recovery.",
        409,
      );
    if (
      makerRetry &&
      attempts.some(
        (item) =>
          item.draft_id ||
          item.evidence?.kind ||
          item.evidence?.reviewUrl ||
          item.evidence?.draftId ||
          item.evidence?.scheduledDraftId ||
          item.evidence?.recipientId ||
          item.evidence?.providerRecipientId ||
          item.evidence?.recipientSaved === true ||
          item.evidence?.draftSaved === true,
      )
    )
      fail(
        "Recorded provider recipient or preparation blocks Maker retry; inspect the existing record instead.",
        409,
      );
    const released = (
      await c.query(
        "SELECT 1 FROM creator_payout_events WHERE withdrawal_id=$1 AND action IN('human_release_recorded','human_declined','reconciled') LIMIT 1",
        [id],
      )
    ).rows.length;
    if (
      released ||
      attempts.some(
        (item) =>
          item.provider_reference ||
          item.activity_id ||
          item.evidence?.providerLink ||
          item.evidence?.recipientLink ||
          item.evidence?.providerReference ||
          item.evidence?.activityId ||
          item.evidence?.releasedAt ||
          item.evidence?.sentAt ||
          item.evidence?.recipientLinkIssued === true ||
          item.evidence?.linkIssued === true ||
          item.evidence?.paymentSent === true ||
          item.evidence?.fundingDebited === true,
      ) ||
      w.provider_link
    )
      fail(
        "Recorded human decision or provider activity blocks recipient recovery; reconcile the existing transfer instead.",
        409,
      );
    const reserved = (
      await c.query(
        "SELECT COALESCE(sum(reserved_ticks),0)::text reserved FROM creator_cash_ledger WHERE user_id=$1 AND withdrawal_id=$2",
        [w.user_id, id],
      )
    ).rows[0].reserved;
    if (BigInt(reserved) !== BigInt(w.gross_cents) * 4n)
      fail("Exact withdrawal reservation is missing or inconsistent.", 409);
    const contact = (
      await c.query(
        "SELECT * FROM creator_payout_recipients WHERE user_id=$1 FOR UPDATE",
        [w.user_id],
      )
    ).rows[0];
    if (
      !contact ||
      contact.revision !== w.recipient.revision ||
      hash(contact.data) !==
        hash(
          Object.fromEntries(
            Object.entries(w.recipient).filter(
              ([key]) => !["revision", "status"].includes(key),
            ),
          ),
        )
    )
      fail(
        "Saved recipient changed; investigate before applying correction.",
        409,
      );
    const recipientRecord = (
      await c.query(
        "UPDATE creator_payout_recipients SET data=jsonb_set(jsonb_set(data,'{phone}',to_jsonb($2::text)),'{email}',to_jsonb($3::text)),revision=revision+1,updated_at=now() WHERE user_id=$1 RETURNING revision",
        [w.user_id, correction.phone, correction.email],
      )
    ).rows[0];
    const recipient = {
      ...w.recipient,
      phone: correction.phone,
      email: correction.email,
      revision: recipientRecord.revision,
    };
    await c.query(
      "UPDATE creator_payout_attempts SET state='canceled',lease_until=now(),updated_at=now() WHERE id=$1",
      [attemptId],
    );
    await c.query(
      "UPDATE creator_withdrawals SET status='awaiting_quote',recipient=$2,quote=NULL,approved_quote_hash=NULL,checker=NULL,provider_link=NULL,provider_onboarding_status='pending',version=version+1,updated_at=now() WHERE id=$1",
      [id, JSON.stringify(recipient)],
    );
    await event(
      c,
      w.user_id,
      actor,
      "recipient_error_resolved",
      {
        ...b,
        sourceUrl,
        observedAt,
        evidence,
        historyCoverage,
        observationHash,
        recipientHash: hash(recipient),
        reservationRetained: true,
      },
      id,
    );
    return withdrawalDetail(c, id, undefined, account);
  });
}
export async function resolveRecipientError(
  db: Database,
  account: string,
  id: string,
  input: unknown,
  actor: string,
) {
  return recoverRecipientError(db, account, id, input, actor);
}

// Maker retries only validation failures verified to have saved no provider
// objects. This is preparation retry, never transfer reconciliation or sending.
export async function retryRecipientCreation(
  db: Database,
  account: string,
  id: string,
  input: unknown,
  actor: string,
) {
  return recoverRecipientError(db, account, id, input, actor, true);
}

export async function markUnknown(
  db: Database,
  account: string,
  id: string,
  input: unknown,
  actor: string,
) {
  const b = body(input, ["reason", "status", "recipientIssue"]);
  const issue =
    b.recipientIssue === undefined
      ? undefined
      : recipientIssueInput(b.recipientIssue);
  const reason = note(b.reason, "uncertain outcome reason", 5000);
  const target = b.status === "expired" ? "expired" : "unknown";
  if (b.status !== undefined && !["expired", "unknown"].includes(b.status))
    fail("Investigation state must be unknown or expired.");
  return tx(db, async (c) => {
    const w = await lockedWithdrawal(c, id, account);
    if (["delivered", "failed", "canceled", "returned"].includes(w.status))
      fail("Resolved withdrawal cannot become unknown.", 409);
    if (
      !(
        await c.query(
          "SELECT 1 FROM creator_payout_attempts WHERE withdrawal_id=$1 AND state NOT IN('delivered','failed','canceled','returned')",
          [id],
        )
      ).rows.length
    )
      fail(
        "No provider attempt exists; cancel before preparation instead.",
        409,
      );
    await c.query(
      "UPDATE creator_payout_attempts SET state=$2,updated_at=now() WHERE withdrawal_id=$1 AND state NOT IN('delivered','failed','canceled','returned')",
      [id, target],
    );
    await c.query(
      "UPDATE creator_withdrawals SET status=$2,checker=NULL,updated_at=now() WHERE id=$1",
      [id, target],
    );
    await event(
      c,
      w.user_id,
      actor,
      target,
      { reason, ...(issue ? { recipientIssue: issue } : {}) },
      id,
    );
    return withdrawalDetail(c, id, undefined, account);
  });
}
export async function reconcile(
  db: Database,
  account: string,
  id: string,
  input: unknown,
  actor: string,
) {
  const b = body(input, [
    "observationId",
    "status",
    "providerStatus",
    "providerReference",
    "activityId",
    "activityUrl",
    "sourceUrl",
    "observedAt",
    "recipientMatches",
    "methodId",
    "sendAmountCents",
    "feeCents",
    "taxCents",
    "receiveAmount",
    "receiveCurrency",
    "fundingReturned",
    "recipientReady",
    "evidence",
  ]);
  const obsId = str(b.observationId, "observation ID"),
    status = str(b.status, "status"),
    providerStatus = str(b.providerStatus, "raw provider status"),
    reference = str(b.providerReference, "provider reference"),
    evidence = note(b.evidence, "provider reconciliation evidence", 5000);
  if (
    !["processing", "delivered", "failed", "canceled", "returned"].includes(
      status,
    )
  )
    fail("Unsupported reconciliation status.");
  if (b.recipientMatches !== true)
    fail("Recipient must be verified against snapshot.");
  const sourceUrl = providerSource(b.sourceUrl),
    observedAt = date(b.observedAt, "provider observation");
  const send = integer(
      b.sendAmountCents,
      "actual send amount",
      POLICY.maxWithdrawalCents,
    ),
    fee = integer(b.feeCents, "actual fee", POLICY.maxWithdrawalCents),
    tax = integer(b.taxCents, "actual tax", POLICY.maxWithdrawalCents);
  const activityUrl = b.activityUrl ? safeProviderLink(b.activityUrl) : null;
  return tx(db, async (c) => {
    const w = await lockedWithdrawal(c, id, account);
    const duplicate = (
      await c.query(
        "SELECT evidence FROM creator_payout_events WHERE withdrawal_id=$1 AND action='reconciled' AND evidence->>'observationId'=$2",
        [id, obsId],
      )
    ).rows[0];
    if (duplicate) {
      if (duplicate.evidence.inputHash !== hash(b))
        fail("Observation ID reused for changed evidence.", 409);
      return withdrawalDetail(c, id, undefined, account);
    }
    const a = (
      await c.query(
        "SELECT * FROM creator_payout_attempts WHERE withdrawal_id=$1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (
      !a ||
      !w.quote ||
      ![
        "awaiting_recipient",
        "processing",
        "unknown",
        "expired",
        "delivered",
      ].includes(w.status)
    )
      fail("No released/uncertain attempt to reconcile.", 409);
    if (w.status === "delivered" && !["returned", "delivered"].includes(status))
      fail("Delivered outcome cannot regress.", 409);
    if (
      b.methodId !== w.method_id ||
      b.receiveCurrency !== w.quote.receiveCurrency ||
      send !== w.quote.sendAmountCents ||
      fee > w.quote.feeCents ||
      tax > w.quote.taxCents ||
      send + fee + tax > w.gross_cents
    )
      fail(
        "Provider amounts/method violate the recorded quote; leave reservation and investigate.",
        409,
      );
    const receive = str(b.receiveAmount, "actual receive amount", 40);
    if (!/^\d+(\.\d{1,8})?$/.test(receive) || !/[1-9]/.test(receive))
      fail("Actual recipient amount must be an exact positive decimal.", 409);
    // Older withdrawals may carry genuine exact-quote consent. New withdrawals
    // authorize the USD gross amount; their receive-currency quote is an estimate.
    if (
      w.approved_quote_hash === w.quote.hash &&
      decimalCompare(receive, w.quote.receiveAmount) < 0
    )
      fail(
        "Actual recipient amount is below the legacy creator-approved amount; investigate before reconciliation.",
        409,
      );
    if (a.provider_reference && a.provider_reference !== reference)
      fail("Provider reference differs from existing attempt.", 409);
    const previous = (
      await c.query(
        "SELECT evidence FROM creator_payout_events WHERE withdrawal_id=$1 AND action='reconciled' ORDER BY id DESC LIMIT 1",
        [id],
      )
    ).rows[0]?.evidence;
    if (previous && Date.parse(previous.observedAt) >= Date.parse(observedAt))
      fail("Older provider evidence cannot change state.", 409);
    if (
      ["failed", "canceled", "returned"].includes(status) &&
      b.fundingReturned !== true
    )
      fail(
        "Authoritative funding return required before releasing or crediting funds.",
        409,
      );
    if (status === "returned" && w.status !== "delivered")
      fail("Return adjustment requires a previously delivered payout.", 409);
    const actualTicks = BigInt(send + fee + tax) * 4n;
    if (status === "delivered" && w.status !== "delivered") {
      await ledger(
        c,
        w.user_id,
        "settlement",
        `${id}:settlement`,
        0n,
        -actualTicks,
        actor,
        "Verified provider delivery",
        id,
      );
      if (actualTicks < BigInt(w.gross_cents) * 4n) {
        await walletChange(
          c,
          w.user_id,
          BigInt(w.gross_cents) * 4n - actualTicks,
          `${id}:wallet-unused`,
          "Refund unused withdrawal reservation after verified lower actual cost",
        );
        await ledger(
          c,
          w.user_id,
          "release",
          `${id}:unused`,
          BigInt(w.gross_cents) * 4n - actualTicks,
          -(BigInt(w.gross_cents) * 4n - actualTicks),
          actor,
          "Release unused reservation after lower actual cost",
          id,
        );
      }
    }
    if (status === "failed" || status === "canceled") {
      await walletChange(
        c,
        w.user_id,
        BigInt(w.gross_cents) * 4n,
        `${id}:wallet-release`,
        "Restore coins after authoritative failure/cancellation and full funding return",
      );
      await ledger(
        c,
        w.user_id,
        "release",
        `${id}:release`,
        BigInt(w.gross_cents) * 4n,
        -(BigInt(w.gross_cents) * 4n),
        actor,
        "Authoritative failure/cancellation and funding return",
        id,
      );
    }
    if (status === "returned") {
      const settled = (
        await c.query(
          "SELECT reserved_ticks::text FROM creator_cash_ledger WHERE source_ref=$1",
          [`${id}:settlement`],
        )
      ).rows[0];
      if (!settled) fail("Missing original settlement.", 409);
      await walletChange(
        c,
        w.user_id,
        -BigInt(settled.reserved_ticks),
        `${id}:wallet-return`,
        "Restore coins after authoritative provider return; no automatic repayment",
      );
      await ledger(
        c,
        w.user_id,
        "return",
        `${id}:return`,
        -BigInt(settled.reserved_ticks),
        0n,
        actor,
        "Provider-confirmed return; no automatic repayment",
        id,
      );
    }
    await c.query(
      "UPDATE creator_payout_attempts SET state=$2,provider_reference=$3,activity_id=COALESCE($4,activity_id),updated_at=now() WHERE id=$1",
      [
        a.id,
        status,
        reference,
        b.activityId ? str(b.activityId, "activity ID") : null,
      ],
    );
    await c.query(
      "UPDATE creator_withdrawals SET status=$2,provider_onboarding_status=CASE WHEN $3 THEN 'ready' ELSE provider_onboarding_status END,updated_at=now() WHERE id=$1",
      [id, status, b.recipientReady === true],
    );
    await event(
      c,
      w.user_id,
      actor,
      "reconciled",
      {
        observationId: obsId,
        inputHash: hash(b),
        status,
        providerStatus,
        providerReference: reference,
        activityUrl,
        sourceUrl,
        observedAt,
        sendAmountCents: send,
        feeCents: fee,
        taxCents: tax,
        receiveAmount: receive,
        evidence,
      },
      id,
    );
    return withdrawalDetail(c, id, undefined, account);
  });
}
function decimalCompare(a: string, b: string) {
  const scale = 8;
  const convert = (v: string) => {
    const [i, f = ""] = v.split(".");
    return BigInt(i) * 10n ** BigInt(scale) + BigInt(f.padEnd(scale, "0"));
  };
  const x = convert(a),
    y = convert(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
export async function statement(db: Sql, id: string, uid: number) {
  const w = await withdrawalDetail(db, id, uid);
  const reconciled = (
    await db.query(
      "SELECT evidence FROM creator_payout_events WHERE withdrawal_id=$1 AND action='reconciled' ORDER BY id DESC LIMIT 1",
      [id],
    )
  ).rows[0]?.evidence;
  const lines = [
    "Pulse wallet payout statement",
    `Creator ID: ${uid}`,
    `Recipient: ${[w.recipient.legalFirstName, w.recipient.legalLastName, w.recipient.secondSurname].filter(Boolean).join(" ")}`,
    `Withdrawal: ${w.id}`,
    `Requested: ${new Date(w.createdAt).toISOString()}`,
    `Status: ${w.status}`,
    `Requested gross USD: ${(w.grossCents / 100).toFixed(2)}`,
    "Wallet conversion: 400 coins = USD 1; requested reservation = 6,000 coins",
  ];
  if (w.quote) {
    lines.push(
      "The initial withdrawal request authorizes preparation within the requested gross amount.",
      `Quoted USD send: ${(w.quote.sendAmountCents / 100).toFixed(2)}`,
      `Quoted fee USD: ${(w.quote.feeCents / 100).toFixed(2)}`,
      `Quoted taxes USD: ${(w.quote.taxCents / 100).toFixed(2)}`,
      `Estimated recipient amount from provider quote: ${w.quote.receiveAmount} ${w.quote.receiveCurrency}`,
    );
  }
  if (reconciled)
    lines.push(
      `Provider observation: ${reconciled.observedAt}`,
      `Observed provider reference: ${reconciled.providerReference}`,
      `Observed USD send: ${(reconciled.sendAmountCents / 100).toFixed(2)}`,
      `Observed USD fee: ${(reconciled.feeCents / 100).toFixed(2)}`,
      `Observed USD taxes: ${(reconciled.taxCents / 100).toFixed(2)}`,
      `Observed recipient amount: ${reconciled.receiveAmount} ${w.quote?.receiveCurrency ?? w.route.receiveCurrency}`,
      `Actual USD cost: ${((reconciled.sendAmountCents + reconciled.feeCents + reconciled.taxCents) / 100).toFixed(2)}`,
    );
  lines.push(
    w.status === "delivered"
      ? "Delivery verified from recorded provider evidence."
      : "Payment completion has not been verified.",
    "This is a Pulse wallet withdrawal statement, not an invoice issued by the creator.",
  );
  return lines.join("\n");
}
export async function adminWithdrawalDetail(
  db: Sql,
  id: string,
  account: string,
) {
  const w = await withdrawalDetail(db, id, undefined, account);
  const attempts = (
    await db.query(
      "SELECT * FROM creator_payout_attempts WHERE withdrawal_id=$1 ORDER BY created_at DESC",
      [id],
    )
  ).rows.map((a) => ({
    id: a.id,
    maker: a.maker,
    state: a.state,
    bindingHash: a.binding_hash,
    evidence: a.evidence,
    draftId: a.draft_id,
    providerReference: a.provider_reference,
    activityId: a.activity_id,
    leaseUntil: a.lease_until,
    createdAt: a.created_at,
  }));
  const events = (
    await db.query(
      "SELECT actor,action,evidence,created_at FROM creator_payout_events WHERE withdrawal_id=$1 ORDER BY id",
      [id],
    )
  ).rows.map((e) => ({
    actor: e.actor,
    action: e.action,
    evidence: e.evidence,
    createdAt: e.created_at,
  }));
  const creator = (
    await db.query("SELECT name FROM users WHERE uid=$1", [w.userId])
  ).rows[0];
  const raw = (
    await db.query("SELECT checker FROM creator_withdrawals WHERE id=$1", [id])
  ).rows[0];
  return {
    ...w,
    checker: raw?.checker,
    creatorName: creator?.name,
    attempts,
    events,
    balances: await balances(db, w.userId),
  };
}
export async function cancelUnprepared(db: Database, uid: number, id: string) {
  return tx(db, async (c) => {
    const w = await lockedWithdrawal(c, id, undefined, uid);
    if (w.status === "canceled") return withdrawalDetail(c, id, uid);
    if (
      !["awaiting_quote", "awaiting_confirmation", "requested"].includes(
        w.status,
      ) ||
      (
        await c.query(
          "SELECT 1 FROM creator_payout_attempts WHERE withdrawal_id=$1",
          [id],
        )
      ).rows.length
    )
      fail(
        "An operator attempt exists; cancellation requires provider reconciliation.",
        409,
      );
    await walletChange(
      c,
      uid,
      BigInt(w.gross_cents) * 4n,
      `${id}:wallet-release`,
      "Restore coins after creator canceled before any provider attempt",
    );
    await ledger(
      c,
      uid,
      "release",
      `${id}:release`,
      BigInt(w.gross_cents) * 4n,
      -(BigInt(w.gross_cents) * 4n),
      `creator:${uid}`,
      "Creator canceled before any provider attempt",
      id,
    );
    await c.query(
      "UPDATE creator_withdrawals SET status='canceled',updated_at=now() WHERE id=$1",
      [id],
    );
    await event(
      c,
      uid,
      `creator:${uid}`,
      "canceled_before_preparation",
      {},
      id,
    );
    return withdrawalDetail(c, id, uid);
  });
}
// Final human decision is independent from the maker/checker work. A decline never
// assumes a provider attempt was canceled or that provider funding was returned.
export async function humanDecline(
  db: Database,
  account: string,
  id: string,
  input: unknown,
  actor: string,
) {
  const b = body(input, ["reason"]);
  const reason = note(b.reason, "human decline reason", 5000);
  return tx(db, async (c) => {
    const w = await lockedWithdrawal(c, id, account);
    if (w.status === "canceled")
      return withdrawalDetail(c, id, undefined, account);
    if (["delivered", "failed", "returned"].includes(w.status))
      fail(
        "Resolved payout cannot be declined; reconcile any provider return separately.",
        409,
      );
    const attempted =
      (
        await c.query(
          "SELECT 1 FROM creator_payout_attempts WHERE withdrawal_id=$1",
          [id],
        )
      ).rows.length > 0;
    if (
      !attempted &&
      ["awaiting_quote", "awaiting_confirmation", "requested"].includes(
        w.status,
      )
    ) {
      await walletChange(
        c,
        w.user_id,
        BigInt(w.gross_cents) * 4n,
        `${id}:wallet-release`,
        "Human declined before any provider attempt",
      );
      await ledger(
        c,
        w.user_id,
        "release",
        `${id}:release`,
        BigInt(w.gross_cents) * 4n,
        -(BigInt(w.gross_cents) * 4n),
        actor,
        "Human declined before any provider attempt",
        id,
      );
      await c.query(
        "UPDATE creator_withdrawals SET status='canceled',checker=NULL,updated_at=now() WHERE id=$1",
        [id],
      );
    } else {
      await c.query(
        "UPDATE creator_payout_attempts SET state='unknown',updated_at=now() WHERE withdrawal_id=$1 AND state NOT IN('delivered','failed','canceled','returned')",
        [id],
      );
      await c.query(
        "UPDATE creator_withdrawals SET status='unknown',checker=NULL,updated_at=now() WHERE id=$1",
        [id],
      );
    }
    await event(
      c,
      w.user_id,
      actor,
      "human_declined",
      {
        reason,
        reservationReleased: !attempted,
        requiresProviderCancellation: attempted,
      },
      id,
    );
    return withdrawalDetail(c, id, undefined, account);
  });
}
export async function renewPreparationLease(
  db: Database,
  account: string,
  id: string,
  input: unknown,
  actor: string,
) {
  const b = body(input, ["attemptId", "quoteHash", "evidence"]);
  const evidence = note(b.evidence, "lease renewal evidence");
  return tx(db, async (c) => {
    const w = await lockedWithdrawal(c, id, account);
    const a = (
      await c.query(
        "SELECT * FROM creator_payout_attempts WHERE id=$1 AND withdrawal_id=$2 FOR UPDATE",
        [b.attemptId, id],
      )
    ).rows[0];
    if (
      !a ||
      a.maker !== actor ||
      a.state !== "preparing" ||
      w.status !== "preparing" ||
      a.binding_hash !== binding(w) ||
      b.quoteHash !== w.quote?.hash ||
      Date.parse(a.lease_until) <= Date.now() ||
      Date.parse(w.quote.expiresAt) <= Date.now()
    )
      fail(
        "Preparation lease expired or attempt/quote changed; record unknown and investigate.",
        409,
      );
    await c.query(
      "UPDATE creator_payout_attempts SET lease_until=LEAST(now()+interval '15 minutes',$2::timestamptz),updated_at=now() WHERE id=$1",
      [a.id, w.quote.expiresAt],
    );
    await event(
      c,
      w.user_id,
      actor,
      "preparation_lease_renewed",
      { attemptId: a.id, evidence },
      id,
    );
    return adminWithdrawalDetail(c, id, account);
  });
}
export async function releasePreparationLease(
  db: Database,
  account: string,
  id: string,
  input: unknown,
  actor: string,
) {
  const b = body(input, ["attemptId", "quoteHash", "evidence"]);
  const evidence = note(b.evidence, "lease release evidence");
  return tx(db, async (c) => {
    const w = await lockedWithdrawal(c, id, account);
    const a = (
      await c.query(
        "SELECT * FROM creator_payout_attempts WHERE id=$1 AND withdrawal_id=$2 FOR UPDATE",
        [b.attemptId, id],
      )
    ).rows[0];
    if (
      !a ||
      a.maker !== actor ||
      a.binding_hash !== binding(w) ||
      b.quoteHash !== w.quote?.hash ||
      !["preparing", "unknown"].includes(a.state)
    )
      fail("Preparation attempt does not match this operator and quote.", 409);
    await c.query(
      "UPDATE creator_payout_attempts SET state='unknown',updated_at=now() WHERE id=$1",
      [a.id],
    );
    await c.query(
      "UPDATE creator_withdrawals SET status='unknown',checker=NULL,updated_at=now() WHERE id=$1",
      [id],
    );
    await event(
      c,
      w.user_id,
      actor,
      "preparation_lease_released_unknown",
      { attemptId: a.id, evidence },
      id,
    );
    return adminWithdrawalDetail(c, id, account);
  });
}
