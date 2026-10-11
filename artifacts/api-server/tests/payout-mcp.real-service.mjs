import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../../lib/payout-mcp/package.json", import.meta.url),
);
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

/** Called by the real operator route suite, using its disposable Unix-socket PG. */
export async function runMcpIntegration({
  base,
  maker,
  checker,
  reconciler,
  withdrawalId,
  leaseId,
  quote,
  expectedPendingFirstTimeRecipient,
}) {
  const clients = [];
  const connect = async (credential) => {
    const client = new Client(
      { name: "pulse-isolated-real-service-test", version: "1" },
      { capabilities: {} },
    );
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + "/api/payout-mcp"), {
        requestInit: {
          headers: { Authorization: "Bearer " + credential.token },
        },
      }),
    );
    return client;
  };
  const call = async (client, name, args = {}) => {
    const result = await client.callTool({
      name: "pulse_payout_" + name,
      arguments: args,
    });
    assert(!result.isError, JSON.stringify(result));
    return result.structuredContent ?? JSON.parse(result.content[0].text);
  };
  try {
    for (const [role, credential] of Object.entries({
      maker,
      checker,
      reconciler,
    })) {
      const client = await connect(credential);
      const names = (await client.listTools()).tools.map((t) => t.name);
      assert(
        names.includes(
          "pulse_payout_" +
            (role === "maker"
              ? "quote"
              : role === "checker"
                ? "check"
                : "reconcile"),
        ),
      );
      assert.equal(
        names.includes("pulse_payout_retry_recipient_creation"),
        role === "maker",
      );
      assert.equal(
        names.includes("pulse_payout_retry_unsaved_preparation"),
        role === "maker",
      );
      assert(
        !names.some((n) =>
          /^pulse_payout_(release|decline|enroll|pause|issue|revoke)$/.test(n),
        ),
      );
      const identity = await call(client, "identity");
      assert.equal(identity.operator.id, credential.credential.id);
      assert.equal(identity.operator.role, role);
      assert.equal(identity.accountKey, "operator-business");
      assert.equal(identity.environment, "development");
      assert(!JSON.stringify(identity).includes(credential.token));
      const list = await call(client, "list", { limit: 10 });
      assert(Array.isArray(list.withdrawals));
      for (const withdrawal of list.withdrawals) {
        assert(
          ["first_payout_in_pulse", "previously_paid"].includes(
            withdrawal.recipientPaymentHistory.classification,
          ),
        );
        assert.equal(
          withdrawal.recipientPaymentHistory.requiresProviderVerification,
          true,
        );
      }
      const playbook = await call(client, "playbook", { name: role });
      assert.equal(playbook.autoSendAllowed, false);
      assert.equal(playbook.humanFinalDecisionRequired, true);
      if (withdrawalId) {
        const detail = await call(client, "get", { id: withdrawalId });
        assert.equal(detail.id, withdrawalId);
        if (expectedPendingFirstTimeRecipient !== undefined)
          assert.equal(
            detail.pendingFirstTimeRecipient,
            expectedPendingFirstTimeRecipient,
          );
        assert(
          ["first_payout_in_pulse", "previously_paid"].includes(
            detail.recipientPaymentHistory.classification,
          ),
        );
        assert.equal(
          detail.recipientPaymentHistory.requiresProviderVerification,
          true,
        );
      }
      const forbidden = await client.callTool({
        name: "pulse_payout_release",
        arguments: {},
      });
      assert(forbidden.isError);
    }
    const makerClient = clients[0];
    if (leaseId && quote && withdrawalId) {
      const quoted = await call(makerClient, "quote", {
        id: withdrawalId,
        leaseId,
        data: quote,
      });
      assert.equal(quoted.quote.sendAmountCents, 1401);
      assert.equal(quoted.quote.feeCents, 99);
    } else if (!leaseId) {
      const lease = await call(makerClient, "browser_lease_acquire", {
        idempotencyKey: "mcp-real-fixture",
        durationSeconds: 60,
      });
      assert.equal(lease.operatorId, maker.credential.id);
      const health = await call(makerClient, "heartbeat", {
        leaseId: lease.leaseId,
      });
      assert.equal(health.ok, true);
      const renewed = await call(makerClient, "browser_lease_renew", {
        leaseId: lease.leaseId,
        durationSeconds: 60,
      });
      assert.equal(renewed.leaseId, lease.leaseId);
      const released = await call(makerClient, "browser_lease_release", {
        leaseId: lease.leaseId,
        reason:
          "Complete isolated SDK integration fixture; no provider actions.",
      });
      assert.equal(released.released, true);
    }
    console.log(
      "PASS real MCP SDK against actual operator routes + isolated PostgreSQL: scoped identity/list/get/playbooks, real lease/quote and no human APIs.",
    );
  } finally {
    await Promise.all(clients.map((client) => client.close()));
  }
}

/** Runs the real Maker tool against the real handler and isolated test DB. */
export async function runMakerRetryMcp({
  base,
  maker,
  id,
  leaseId,
  data,
  expectedRejection,
}) {
  const client = new Client(
    { name: "pulse-maker-retry-fixture", version: "1" },
    { capabilities: {} },
  );
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + "/api/payout-mcp"), {
        requestInit: { headers: { Authorization: "Bearer " + maker.token } },
      }),
    );
    const identity = await client.callTool({
      name: "pulse_payout_identity",
      arguments: {},
    });
    assert.equal(identity.structuredContent.workflowRevision, "2026-10-11.4");
    const result = await client.callTool({
      name: "pulse_payout_retry_recipient_creation",
      arguments: { id, leaseId, data },
    });
    if (expectedRejection) {
      assert(result.isError);
      assert.equal(result.structuredContent.code, expectedRejection);
      assert.equal(result.structuredContent.httpStatus, 409);
      assert(!JSON.stringify(result).includes(maker.token));
      return { status: 409, body: result.structuredContent };
    }
    assert(!result.isError, JSON.stringify(result));
    return {
      status: 200,
      body: result.structuredContent ?? JSON.parse(result.content[0].text),
    };
  } finally {
    await client.close();
  }
}

// Keep one SDK session for a continuous browser run rather than reconnecting
// for every checkpoint; the real transport rate limit remains enabled.
export async function connectMakerPreparationMcp({ base, maker }) {
  const client = new Client(
    { name: "pulse-continuous-preparation-fixture", version: "1" },
    { capabilities: {} },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(base + "/api/payout-mcp"), {
      requestInit: { headers: { Authorization: "Bearer " + maker.token } },
    }),
  );
  return client;
}

// Exercise the actual public Maker tool schema and bridge, not a mocked domain call.
export async function callMakerPreparationMcp({
  base,
  maker,
  id,
  leaseId,
  tool,
  data,
  client: sharedClient,
}) {
  const client =
    sharedClient ?? (await connectMakerPreparationMcp({ base, maker }));
  try {
    const result = await client.callTool({
      name: "pulse_payout_" + tool,
      arguments: tool === "unknown" ? { id, data } : { id, leaseId, data },
    });
    let payload = result.structuredContent;
    if (!payload) {
      try {
        payload = JSON.parse(result.content[0].text);
      } catch {
        assert(result.isError);
        payload = { code: "invalid_request", httpStatus: 400 };
      }
    }
    assert(!JSON.stringify(result).includes(maker.token));
    return {
      status: result.isError ? (payload.httpStatus ?? 400) : 200,
      body: payload,
    };
  } catch (error) {
    throw new Error(
      `Isolated Maker MCP ${tool} failed with HTTP ${Number(error.code) || "unknown"}`,
      { cause: error },
    );
  } finally {
    if (!sharedClient) await client.close();
  }
}
