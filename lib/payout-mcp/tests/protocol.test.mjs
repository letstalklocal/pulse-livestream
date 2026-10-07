import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import { readFile, unlink } from "node:fs/promises";
import { build } from "esbuild";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { PayoutBackendClient } from "../src/index.mjs";
const require = createRequire(
  new URL("../../../artifacts/api-server/package.json", import.meta.url),
);
const express = require("express");
const out = new URL(
  "../../../artifacts/api-server/.payout-mcp-test.mjs",
  import.meta.url,
);
await build({
  entryPoints: [
    new URL(
      "../../../artifacts/api-server/src/routes/payout-mcp.ts",
      import.meta.url,
    ).pathname,
  ],
  outfile: out.pathname,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const { createPayoutMcpRouter } = await import(out.href);
const token = "pulse_op_" + "a".repeat(64);
const preflight = JSON.parse(await readFile(new URL("../playbooks/preflight.json", import.meta.url), "utf8"));
let role = "maker",
  revoked = false;
const calls = [];
const backend = express();
backend.use(express.json());
backend.use((req, res, next) => {
  calls.push({ path: req.path, method: req.method, body: req.body });
  if (revoked || req.get("authorization") !== `Bearer ${token}`) {
    res.status(401).json({ error: token });
    return;
  }
  next();
});
backend.get("/api/payout-operator/identity", (_req, res) =>
  res.json({
    environment: "development",
    accountKey: "test",
    operator: { id: "op1", name: "Test", role },
    policy: {},
    capabilities: [],
    playbookVersion: "2026-10-04.1",
    workflowRevision: preflight.workflowRevision,
  }),
);
backend.get("/api/payout-operator/playbooks/preflight", (_req, res) => res.json(preflight));
backend.post("/api/payout-operator/withdrawals/w1/prepare", (_req, res) => res.json({ status: "preparing", quoteHash: "b".repeat(64) }));
backend.get("/api/payout-operator/withdrawals", (_req, res) =>
  res.json({
    withdrawals: [],
    truncated: false,
    credential: token,
    note: token,
  }),
);
backend.post("/api/payout-operator/withdrawals/w1/unknown", (_req, res) =>
  res.status(409).json({ error: "private recipient " + token }),
);
const listen = (app) =>
  new Promise((resolve) => {
    const s = http.createServer(app).listen(0, "127.0.0.1", () => resolve(s));
  });
const b = await listen(backend);
const origin = `http://127.0.0.1:${b.address().port}`;
const app = express();
app.use(
  "/api/preparsed-mcp",
  express.json({ limit: "64kb" }),
  createPayoutMcpRouter({ backendOrigin: origin }),
);
app.use(
  "/api/payout-mcp",
  createPayoutMcpRouter({
    backendOrigin: origin,
    allowedOrigins: ["https://allowed.test"],
  }),
);
const a = await listen(app);
const url = new URL(`http://127.0.0.1:${a.address().port}/api/payout-mcp`);
const clients = [];
async function connect() {
  const client = new Client(
    { name: "fixture", version: "1" },
    { capabilities: {} },
  );
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  return client;
}
try {
  const client = await connect();
  const makerTools = (await client.listTools()).tools;
  let names = makerTools.map((t) => t.name);
  const prepareTool = makerTools.find(tool => tool.name === "pulse_payout_prepare");
  assert(prepareTool);
  assert(!/requires.*creator[- ]approved/i.test(prepareTool.description), "tool metadata must not resurrect the removed second approval gate");
  assert.deepEqual(prepareTool.inputSchema.properties.data.required.sort(), ["evidence", "quoteHash"]);
  const currentIdentity = await client.callTool({ name: "pulse_payout_identity", arguments: {} });
  assert.equal(currentIdentity.structuredContent.playbookVersion, "2026-10-04.1");
  assert.equal(currentIdentity.structuredContent.workflowRevision, preflight.workflowRevision);
  const currentPlaybook = await client.callTool({ name: "pulse_payout_playbook", arguments: { name: "preflight" } });
  assert.equal(currentPlaybook.structuredContent.version, currentIdentity.structuredContent.playbookVersion);
  assert.equal(currentPlaybook.structuredContent.workflowRevision, "2026-10-07.1");
  assert.equal(currentPlaybook.structuredContent.humanFinalDecisionRequired, true);
  assert.equal(currentPlaybook.structuredContent.autoSendAllowed, false);
  const prepared = await client.callTool({ name: "pulse_payout_prepare", arguments: { id: "w1", leaseId: "lease1", data: { quoteHash: "b".repeat(64), evidence: "Current signed-in quote matches the initial requested route and gross bound" } } });
  assert.equal(prepared.structuredContent.status, "preparing");
  assert.equal(calls.filter(call => call.path.endsWith("/prepare")).length, 1);
  assert(!calls.some(call => call.path.includes("approve-quote")), "prepare requires a current quote binding, not a creator approval operation");
  assert(names.includes("pulse_payout_prepare"));
  assert(!names.includes("pulse_payout_check"));
  assert(
    !names.some((n) =>
      /decline|enroll|credential|human|^pulse_payout_release$/.test(n),
    ),
  );
  const list = await client.callTool({
    name: "pulse_payout_list",
    arguments: { limit: 100 },
  });
  assert(!JSON.stringify(list).includes(token));
  assert(!("credential" in list.structuredContent));
  const before = calls.length;
  const invalid = await client.callTool({
    name: "pulse_payout_list",
    arguments: { limit: 10, url: "https://evil.test" },
  });
  assert(invalid.isError);
  const rejectedLiteral = await client.callTool({
    name: "pulse_payout_playbook",
    arguments: { name: token },
  });
  assert(rejectedLiteral.isError);
  assert(!JSON.stringify(rejectedLiteral).includes(token));
  const rejectedName = await client.callTool({ name: token, arguments: {} });
  assert(rejectedName.isError);
  assert(!JSON.stringify(rejectedName).includes(token));
  assert.equal(
    calls.slice(before).filter((c) => c.path.includes("withdrawals")).length,
    0,
  );
  const error = await client.callTool({
    name: "pulse_payout_unknown",
    arguments: { id: "w1", data: { reason: "Investigate" } },
  });
  assert(error.isError);
  assert(!JSON.stringify(error).includes("private recipient"));
  assert.equal(calls.filter((c) => c.path.endsWith("/unknown")).length, 1);
  revoked = true;
  await assert.rejects(client.listTools());
  revoked = false;
  role = "checker";
  const checker = await connect();
  names = (await checker.listTools()).tools.map((t) => t.name);
  assert(names.includes("pulse_payout_check"));
  assert(!names.includes("pulse_payout_prepare"));
  role = "reconciler";
  const reconciler = await connect();
  names = (await reconciler.listTools()).tools.map((t) => t.name);
  assert(names.includes("pulse_payout_reconcile"));
  assert(!names.includes("pulse_payout_check"));
  const request = (headers, body) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  assert.equal((await request({}, {})).status, 401);
  const credentialId = await request(
    { Authorization: `Bearer ${token}` },
    { jsonrpc: "2.0", id: token, method: "tools/list" },
  );
  assert.equal(credentialId.status, 400);
  assert(!(await credentialId.text()).includes(token));
  assert.equal(
    (
      await request(
        { Authorization: `Bearer ${token}`, Origin: "https://evil.test" },
        {},
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        { Authorization: `Bearer ${token}` },
        {
          jsonrpc: "2.0",
          method: "tools/list",
          params: { blob: "x".repeat(40000) },
        },
      )
    ).status,
    413,
  );
  const largeParsed = JSON.stringify({
    jsonrpc: "2.0",
    method: "tools/list",
    params: { blob: "x".repeat(40000) },
  });
  const chunked = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(largeParsed));
      controller.close();
    },
  });
  const preparsed = await fetch(new URL("/api/preparsed-mcp", url), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: chunked,
    duplex: "half",
  });
  assert.equal(preparsed.status, 413);
  const slow = http
    .createServer((_req, res) => setTimeout(() => res.end("{}"), 100))
    .listen(0, "127.0.0.1");
  await new Promise((r) => slow.once("listening", r));
  const timed = new PayoutBackendClient({
    origin: `http://127.0.0.1:${slow.address().port}`,
    token,
    timeoutMs: 20,
  });
  await assert.rejects(
    timed.request("/identity"),
    (e) => e.code === "unavailable",
  );
  await assert.rejects(
    timed.request("/heartbeat", {}),
    (e) => e.code === "uncertain",
  );
  slow.closeAllConnections();
  await new Promise((r) => slow.close(r));
  const mismatch = new PayoutBackendClient({
    origin,
    token,
    expected: { accountKey: "wrong" },
  });
  await assert.rejects(mismatch.identity(), (e) => e.code === "forbidden");
  let attempts = 0;
  const bounded = new PayoutBackendClient({
    origin,
    token,
    maxResponseBytes: 16,
    fetchImpl: async () => {
      attempts++;
      return new Response(JSON.stringify({ secret: "x".repeat(100) }));
    },
  });
  await assert.rejects(
    bounded.request("/heartbeat", {}),
    (e) => e.code === "uncertain",
  );
  assert.equal(attempts, 1);
  await assert.rejects(
    bounded.request("/../../admin-data/withdrawals"),
    (e) => e.code === "forbidden",
  );
  assert.equal(attempts, 1);
  const redirect = http
    .createServer((_req, res) => {
      res.writeHead(302, {
        Location: origin + "/api/payout-operator/identity",
      });
      res.end();
    })
    .listen(0, "127.0.0.1");
  await new Promise((r) => redirect.once("listening", r));
  const redirected = new PayoutBackendClient({
    origin: `http://127.0.0.1:${redirect.address().port}`,
    token,
  });
  const prior = calls.length;
  await assert.rejects(redirected.identity());
  assert.equal(calls.length, prior);
  redirect.closeAllConnections();
  await new Promise((r) => redirect.close(r));
  console.log(
    "PASS real SDK initialize/list/call, scoped tools, strict inputs, auth revocation, redaction, request bounds, deadline and no mutation retries.",
  );
} finally {
  await Promise.all(clients.map((c) => c.close()));
  a.closeAllConnections();
  b.closeAllConnections();
  await Promise.all([
    new Promise((r) => a.close(r)),
    new Promise((r) => b.close(r)),
  ]);
  await unlink(out);
}
