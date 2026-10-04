import { Router, json, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import {
  AdapterError,
  PayoutBackendClient,
  createPayoutMcpServer,
  StreamableHTTPServerTransport,
  validCredential,
} from "@workspace/payout-mcp";

/** Stateless service-authenticated MCP. Mounted before Clerk; no browser session auth. */
export function createPayoutMcpRouter(
  options: {
    backendOrigin?: string;
    allowedOrigins?: string[];
    timeoutMs?: number;
  } = {},
) {
  const router = Router();
  const buckets = new Map<string, { count: number; until: number }>();
  let active = 0;
  const origins = new Set(
    options.allowedOrigins ??
      (process.env.PULSE_PAYOUT_MCP_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
  );
  const fail = (res: Response, status: number, message: string) =>
    res.status(status).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: status === 401 ? -32001 : -32000, message },
    });
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      fail(res, 405, "Only stateless MCP POST requests are supported.");
      return;
    }
    const origin = req.get("origin");
    if (origin && !origins.has(origin)) {
      fail(res, 403, "Origin is not permitted.");
      return;
    }
    const bearer = /^Bearer (pulse_op_[a-f0-9]{64})$/.exec(
      req.get("authorization") ?? "",
    );
    if (!bearer || !validCredential(bearer[1])) {
      fail(res, 401, "Operator authentication required.");
      return;
    }
    // Defense in depth if a caller mounts this after a larger global parser.
    // The production mount must precede global parsing to bound chunked raw bytes.
    const length = req.get("content-length");
    if (length && /^\d+$/.test(length) && Number(length) > 32768) {
      fail(res, 413, "MCP request body is too large.");
      return;
    }
    const key = createHash("sha256").update(bearer[1]).digest("hex");
    const now = Date.now();
    if (buckets.size > 10000)
      for (const [k, v] of buckets) if (v.until <= now) buckets.delete(k);
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= now) {
      bucket = { count: 0, until: now + 60000 };
      buckets.set(key, bucket);
    }
    if (++bucket.count > 120 || active >= 30 || buckets.size > 10000) {
      fail(res, 429, "Operator request limit exceeded.");
      return;
    }
    res.locals.operatorToken = bearer[1];
    next();
  });
  router.use(json({ limit: "32kb", strict: true }));
  router.post("/", async (req: Request, res: Response) => {
    if (req.body && Buffer.byteLength(JSON.stringify(req.body)) > 32768) {
      fail(res, 413, "MCP request body is too large.");
      return;
    }
    if (
      !req.body ||
      Array.isArray(req.body) ||
      req.body.jsonrpc !== "2.0" ||
      typeof req.body.method !== "string" ||
      req.body.method.length > 100 ||
      (typeof req.body.id === "string" &&
        (req.body.id.length > 160 || validCredential(req.body.id)))
    ) {
      fail(res, 400, "Invalid MCP request.");
      return;
    }
    active++;
    let server: Awaited<ReturnType<typeof createPayoutMcpServer>> | undefined;
    let transport: StreamableHTTPServerTransport | undefined;
    const abort = new AbortController();
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      active--;
      delete res.locals.operatorToken;
      abort.abort();
      void transport?.close();
      void server?.close();
    };
    res.once("close", cleanup);
    try {
      const port = Number(process.env.PORT ?? 8080);
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new AdapterError("unavailable");
      const client = new PayoutBackendClient({
        origin: options.backendOrigin ?? `http://127.0.0.1:${port}`,
        token: res.locals.operatorToken,
        timeoutMs: options.timeoutMs,
        expected: {
          environment:
            process.env.NODE_ENV === "production"
              ? "production"
              : "development",
          ...(process.env.PULSE_PAYOUT_CATALOG_ACCOUNT
            ? { accountKey: process.env.PULSE_PAYOUT_CATALOG_ACCOUNT }
            : process.env.NODE_ENV === "development"
              ? { accountKey: "development-remitly-business" }
              : {}),
        },
      });
      // Authenticate initialize, notifications, list and calls, including revoked credentials.
      const deadline = AbortSignal.any([
        abort.signal,
        AbortSignal.timeout(options.timeoutMs ?? 10000),
      ]);
      const identity = await client.identity(deadline);
      server = await createPayoutMcpServer({
        client,
        identity,
        signal: deadline,
      });
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        const e =
          error instanceof AdapterError
            ? error
            : new AdapterError("unavailable");
        fail(res, e.status, e.message);
      }
    } finally {
      if (res.writableEnded) cleanup();
    }
  });
  router.use((error: unknown, _req: Request, res: Response, _next: unknown) => {
    const status =
      typeof error === "object" &&
      error &&
      "status" in error &&
      error.status === 413
        ? 413
        : 400;
    if (!res.headersSent)
      fail(
        res,
        status,
        status === 413
          ? "MCP request body is too large."
          : "Invalid MCP request body.",
      );
  });
  return router;
}
export default createPayoutMcpRouter();
