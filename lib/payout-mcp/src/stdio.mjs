import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PayoutBackendClient, createPayoutMcpServer } from "./index.mjs";
try {
  const required = [
    "PULSE_PAYOUT_OPERATOR_TOKEN",
    "PULSE_PAYOUT_ORIGIN",
    "PULSE_PAYOUT_EXPECTED_ENVIRONMENT",
    "PULSE_PAYOUT_EXPECTED_ACCOUNT",
    "PULSE_PAYOUT_EXPECTED_OPERATOR_ID",
    "PULSE_PAYOUT_EXPECTED_ROLE",
  ];
  if (required.some((k) => !process.env[k])) throw new Error();
  const client = new PayoutBackendClient({
    origin: process.env.PULSE_PAYOUT_ORIGIN,
    token: process.env.PULSE_PAYOUT_OPERATOR_TOKEN,
    expected: {
      environment: process.env.PULSE_PAYOUT_EXPECTED_ENVIRONMENT,
      accountKey: process.env.PULSE_PAYOUT_EXPECTED_ACCOUNT,
      operatorId: process.env.PULSE_PAYOUT_EXPECTED_OPERATOR_ID,
      role: process.env.PULSE_PAYOUT_EXPECTED_ROLE,
    },
  });
  const server = await createPayoutMcpServer({ client });
  await server.connect(new StdioServerTransport());
} catch {
  process.stderr.write(
    "Pulse payout MCP startup failed: verify credential, pinned operator scope and service availability.\n",
  );
  process.exitCode = 1;
}
