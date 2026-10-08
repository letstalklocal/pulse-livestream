import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// SDK validation errors can include rejected literal values or unknown tool names.
// Keep those outside the protocol response; callbacks supply safe operational errors.
class SafeMcpServer extends McpServer {
  createToolError() {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "Tool request rejected. Verify the registered schema, operator role and payout state.",
        },
      ],
    };
  }
}

export class AdapterError extends Error {
  constructor(code, status = 503) {
    super(
      code === "unauthorized"
        ? "Operator authentication required."
        : code === "forbidden"
          ? "Operator scope is not permitted."
          : code === "uncertain"
            ? "Operation outcome is uncertain. Inspect the payout and provider history before retrying."
            : "Payout operator service unavailable or request rejected.",
    );
    this.code = code;
    this.status = status;
  }
}
const tokenPattern = /^pulse_op_[a-f0-9]{64}$/;
export function validCredential(value) {
  return typeof value === "string" && tokenPattern.test(value);
}
export function redact(value) {
  if (typeof value === "string")
    return value.replace(/pulse_op_[a-f0-9]{64}/g, "[redacted]");
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/^(authorization|credential|secret|password|accessToken|refreshToken)$/i.test(
              key,
            ),
        )
        .map(([key, v]) => [key, redact(v)]),
    );
  return value;
}
export class PayoutBackendClient {
  constructor({
    origin,
    token,
    expected,
    timeoutMs = 10000,
    maxResponseBytes = 1048576,
    fetchImpl = fetch,
  }) {
    const url = new URL(origin);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "") ||
      !["https:", "http:"].includes(url.protocol) ||
      (url.protocol === "http:" &&
        !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) ||
      !validCredential(token)
    )
      throw new AdapterError("forbidden", 403);
    this.base = url.origin + "/api/payout-operator";
    this.token = token;
    this.expected = expected;
    this.timeoutMs = timeoutMs;
    this.maxResponseBytes = maxResponseBytes;
    this.fetchImpl = fetchImpl;
  }
  async request(path, data, signal) {
    // Only the operator API contract is reachable, including from future callers.
    const read =
      /^\/(?:identity|withdrawals(?:\?limit=(?:[1-9]\d?|100)|\/[A-Za-z0-9_-]{1,160})?|playbooks\/(?:preflight|maker|checker|reconciler|recover))$/;
    const write =
      /^\/(?:browser-lease\/(?:acquire|renew|release)|heartbeat|withdrawals\/[A-Za-z0-9_-]{1,160}\/(?:quote|prepare|preparation|check|reconcile|unknown|lease\/(?:renew|release)))$/;
    if (
      typeof path !== "string" ||
      !(data === undefined ? read : write).test(path)
    )
      throw new AdapterError("forbidden", 403);
    const timer = AbortSignal.timeout(this.timeoutMs);
    const abort = signal ? AbortSignal.any([signal, timer]) : timer;
    let response;
    try {
      const body = data === undefined ? undefined : JSON.stringify(data);
      if (body && Buffer.byteLength(body) > 32768)
        throw new AdapterError("rejected", 400);
      response = await this.fetchImpl(this.base + path, {
        method: body ? "POST" : "GET",
        body,
        signal: abort,
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new AdapterError(
          response.status === 401
            ? "unauthorized"
            : response.status === 403
              ? "forbidden"
              : data !== undefined && response.status >= 500
                ? "uncertain"
                : "rejected",
          response.status === 401 ? 401 : response.status === 403 ? 403 : 503,
        );
      }
      if (
        Number(response.headers.get("content-length")) > this.maxResponseBytes
      ) {
        await response.body?.cancel();
        throw new AdapterError(data === undefined ? "rejected" : "uncertain");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new AdapterError("rejected");
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > this.maxResponseBytes) {
          await reader.cancel();
          throw new AdapterError(data === undefined ? "rejected" : "uncertain");
        }
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError(data === undefined ? "unavailable" : "uncertain");
    }
  }
  async identity(signal) {
    const identity = await this.request("/identity", undefined, signal);
    if (
      !identity ||
      !["development", "production"].includes(identity.environment) ||
      typeof identity.accountKey !== "string" ||
      !identity.accountKey ||
      identity.accountKey.length > 200 ||
      typeof identity.operator?.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,160}$/.test(identity.operator.id) ||
      !["maker", "checker", "reconciler"].includes(identity.operator?.role)
    )
      throw new AdapterError("forbidden", 403);
    for (const [key, value] of Object.entries(this.expected ?? {})) {
      const actual =
        key === "role"
          ? identity.operator.role
          : key === "operatorId"
            ? identity.operator.id
            : key === "accountKey"
              ? identity.accountKey
              : identity.environment;
      if (value !== actual) throw new AdapterError("forbidden", 403);
    }
    return identity;
  }
}
const id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const note = z
  .string()
  .min(1)
  .max(5000)
  .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
const timestamp = z.string().datetime({ offset: false });
const cents = z.number().int().min(0).max(50000);
const sourceUrl = z.enum([
  "https://www.remitly.com/us/en/homepage",
  "https://www.remitly.com/us/en/transfer/send",
]);
const money = z
  .string()
  .max(40)
  .regex(/^\d+(?:\.\d{1,8})?$/)
  .refine((v) => Number(v) > 0);
const currency = z.string().regex(/^[A-Z]{3}$/);
const providerLabel = z
  .string()
  .min(1)
  .max(200)
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v));
const binding = {
  attemptId: id,
  quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
  evidence: note,
};
const quote = z
  .object({
    methodId: id,
    sendAmountCents: cents.min(1),
    feeCents: cents,
    taxCents: cents,
    promotionalDiscountCents: cents,
    receiveAmount: money,
    receiveCurrency: currency,
    fundingMethod: z.literal("debit_card"),
    providerMinimumSendCents: cents,
    source: z.literal("signed_in_remitly_business"),
    sourceUrl,
    observedAt: timestamp,
    expiresAt: timestamp,
    evidence: note,
  })
  .strict();
const preparation = z
  .object({
    ...binding,
    draftId: providerLabel.optional(),
    reviewUrl: z.string().url().max(2000).optional(),
    deadline: timestamp,
    oneTime: z.literal(true),
    autoSend: z.literal(false),
    recipientMatches: z.literal(true),
    amountsMatch: z.literal(true),
    historyInspected: z.literal(true),
    historyCoverage: note.refine((v) => v.length <= 2000),
    kind: z.enum(["first_time_link", "scheduled"]),
  })
  .strict();
const check = z
  .object({
    ...binding,
    recipientMatches: z.boolean(),
    amountsMatch: z.boolean(),
    reservationMatches: z.boolean(),
    historyInspected: z.boolean(),
    historyCoverage: note.refine((v) => v.length <= 2000),
    oneTime: z.boolean(),
    autoSend: z.literal(false),
  })
  .strict();
const reconcile = z
  .object({
    observationId: id,
    status: z.enum([
      "processing",
      "delivered",
      "failed",
      "canceled",
      "returned",
    ]),
    providerStatus: providerLabel,
    providerReference: providerLabel,
    activityId: providerLabel.optional(),
    activityUrl: z.string().url().max(2000).optional(),
    sourceUrl,
    observedAt: timestamp,
    recipientMatches: z.literal(true),
    methodId: id,
    sendAmountCents: cents.min(1),
    feeCents: cents,
    taxCents: cents,
    receiveAmount: money,
    receiveCurrency: currency,
    fundingReturned: z.boolean(),
    recipientReady: z.boolean(),
    evidence: note,
  })
  .strict();

export async function createPayoutMcpServer({ client, identity, signal }) {
  const principal = identity ?? (await client.identity(signal));
  const server = new SafeMcpServer(
    { name: "pulse-payout-operator", version: "1.0.0" },
    {
      instructions:
        "Operate only the authorized Pulse payout queue using the versioned playbooks. Never send payments or issue recipient links. Humans make the final payout decision and manually send in Remitly. Unknown outcomes retain reservations; inspect provider history before retrying.",
    },
  );
  const tool = (name, description, schema, run, readOnly = false) =>
    server.registerTool(
      "pulse_payout_" + name,
      {
        description,
        inputSchema: schema,
        annotations: {
          readOnlyHint: readOnly,
          destructiveHint: !readOnly,
          idempotentHint: readOnly,
          openWorldHint: false,
        },
      },
      async (args, extra) => {
        try {
          const deadline = AbortSignal.any([
            extra.signal,
            AbortSignal.timeout(client.timeoutMs),
            ...(signal ? [signal] : []),
          ]);
          const current = await client.identity(deadline);
          if (
            current.operator.id !== principal.operator.id ||
            current.operator.role !== principal.operator.role ||
            current.environment !== principal.environment ||
            current.accountKey !== principal.accountKey
          )
            throw new AdapterError("forbidden", 403);
          const result = redact(await run(args, deadline));
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            ...(result && typeof result === "object" && !Array.isArray(result)
              ? { structuredContent: result }
              : {}),
          };
        } catch (e) {
          const error =
            e instanceof AdapterError ? e : new AdapterError("unavailable");
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: error.message,
                  code: error.code,
                }),
              },
            ],
          };
        }
      },
    );
  const empty = z.object({}).strict();
  tool(
    "identity",
    "Read authenticated operator scope and safety policy.",
    empty,
    (_, s) => client.identity(s),
    true,
  );
  tool(
    "list",
    "List authorized payouts; truncation requires investigation, not assumptions.",
    z.object({ limit: z.number().int().min(1).max(100).optional() }).strict(),
    (a, s) =>
      client.request("/withdrawals?limit=" + (a.limit ?? 100), undefined, s),
    true,
  );
  tool(
    "get",
    "Read an authorized payout and its recorded evidence.",
    z.object({ id }).strict(),
    (a, s) =>
      client.request("/withdrawals/" + encodeURIComponent(a.id), undefined, s),
    true,
  );
  tool(
    "playbook",
    "Read authoritative versioned instructions for this role.",
    z
      .object({
        name: z.enum(["preflight", "recover", principal.operator.role]),
      })
      .strict(),
    (a, s) => client.request("/playbooks/" + a.name, undefined, s),
    true,
  );
  tool(
    "browser_lease_acquire",
    "Acquire exclusive fenced Remitly browser access. Never work without this lease.",
    z
      .object({
        idempotencyKey: id,
        durationSeconds: z.number().int().min(30).max(900).optional(),
      })
      .strict(),
    (a, s) => client.request("/browser-lease/acquire", a, s),
  );
  tool(
    "browser_lease_renew",
    "Renew the same fenced browser lease.",
    z
      .object({
        leaseId: id,
        durationSeconds: z.number().int().min(30).max(900).optional(),
      })
      .strict(),
    (a, s) => client.request("/browser-lease/renew", a, s),
  );
  tool(
    "browser_lease_release",
    "Release browser exclusivity; this does not cancel a provider transfer.",
    z.object({ leaseId: id, reason: note }).strict(),
    (a, s) => client.request("/browser-lease/release", a, s),
  );
  tool(
    "heartbeat",
    "Read operator health and optional owned browser lease.",
    z.object({ leaseId: id.optional() }).strict(),
    (a, s) => client.request("/heartbeat", a, s),
    true,
  );
  const mutation = (name, action, data, description) =>
    tool(
      name,
      description,
      z.object({ id, leaseId: id, data }).strict(),
      (a, s) =>
        client.request(
          "/withdrawals/" + encodeURIComponent(a.id) + "/" + action,
          { leaseId: a.leaseId, data: a.data },
          s,
        ),
    );
  if (principal.operator.role === "maker") {
    mutation(
      "quote",
      "quote",
      quote,
      "Record an actual signed-in Remitly quote. Never fabricate or interpolate fees.",
    );
    mutation(
      "prepare",
      "prepare",
      z.object({ quoteHash: binding.quoteHash, evidence: note }).strict(),
      "Claim durable preparation before any provider action; requires a current provider quote within the submitted withdrawal bounds.",
    );
    mutation(
      "record_preparation",
      "preparation",
      preparation,
      "Record inspected non-sending preparation. First-time link is a plan only; humans issue the link.",
    );
    mutation(
      "preparation_lease_renew",
      "lease/renew",
      z.object(binding).strict(),
      "Renew owned preparation lease with the same binding.",
    );
    mutation(
      "preparation_lease_release",
      "lease/release",
      z.object(binding).strict(),
      "Release preparation ownership; uncertain outcomes remain reserved for investigation.",
    );
  }
  if (principal.operator.role === "checker")
    mutation(
      "check",
      "check",
      check,
      "Independently inspect another maker preparation. A check never approves or sends payment.",
    );
  if (principal.operator.role === "reconciler")
    mutation(
      "reconcile",
      "reconcile",
      reconcile,
      "Record actual matching Remitly activity evidence; internal approval is not delivery evidence.",
    );
  if (["maker", "reconciler"].includes(principal.operator.role))
    tool(
      "unknown",
      "Mark unknown or expired without releasing reserved funds.",
      z
        .object({
          id,
          data: z
            .object({
              reason: note,
              status: z.enum(["unknown", "expired"]).optional(),
              recipientIssue: z
                .object({
                  code: z.literal("recipient_validation_failed"),
                  fields: z
                    .array(z.enum(["phone", "email", "name", "other"]))
                    .min(1)
                    .max(4)
                    .refine((fields) => new Set(fields).size === fields.length),
                })
                .strict()
                .optional(),
            })
            .strict(),
        })
        .strict(),
      (a, s) =>
        client.request(
          "/withdrawals/" + encodeURIComponent(a.id) + "/unknown",
          { data: a.data },
          s,
        ),
    );
  return server;
}
