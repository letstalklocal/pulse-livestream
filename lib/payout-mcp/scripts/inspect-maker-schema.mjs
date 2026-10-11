#!/usr/bin/env node
// Inspect this checkout's emitted Maker schemas without credentials or API calls.
// This is not a check of the already-running Mac bridge or production backend.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPayoutMcpServer } from "../src/index.mjs";

const source = new URL("../src/index.mjs", import.meta.url);
const makerPlaybook = JSON.parse(
  await readFile(new URL("../playbooks/maker.json", import.meta.url), "utf8"),
);
const identity = {
  environment: "development",
  accountKey: "offline-schema-inspection",
  operator: {
    id: "offline_schema_inspection",
    name: "Offline schema inspection",
    role: "maker",
  },
};
const server = await createPayoutMcpServer({
  identity,
  client: {
    timeoutMs: 10000,
    identity: async () => identity,
    request: async () => {
      throw new Error("Offline inspection cannot call a payout endpoint.");
    },
  },
});
const client = new Client(
  { name: "pulse-offline-schema-inspection", version: "1" },
  { capabilities: {} },
);
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
try {
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const listed = (await client.listTools()).tools;
  const tools = [
    "prepare",
    "record_preparation",
    "preparation_lease_renew",
    "preparation_lease_release",
    "retry_unsaved_preparation",
  ].map((name) => {
    const tool = listed.find((item) => item.name === `pulse_payout_${name}`);
    const data = tool?.inputSchema?.properties?.data;
    const branches = data?.anyOf ?? data?.oneOf ?? [data];
    return {
      name: `pulse_payout_${name}`,
      present: !!tool,
      required: data?.required ?? [],
      quoteHashRequired: data?.required?.includes("quoteHash") ?? false,
      preparationHashSupported: branches.some(
        (b) => !!b?.properties?.preparationHash,
      ),
      finalQuoteSupported: branches.some((b) => !!b?.properties?.quote),
      savedDraftRecoverySupported: branches.some(
        (b) => !!b?.properties?.recovery,
      ),
      cardVerificationHandoffSupported: branches.some(
        (branch) =>
          branch?.properties?.kind?.const === "card_verification" &&
          !!branch?.properties?.cardVerificationRequired &&
          !!branch?.properties?.draftSaved &&
          !branch?.required?.includes("quote") &&
          !branch?.required?.includes("deadline"),
      ),
      unsavedRecoverySupported:
        name === "retry_unsaved_preparation" &&
        branches.every(
          (branch) =>
            !!branch?.properties?.expectedVersion &&
            !!branch?.properties?.noDraftSaved,
        ),
      savedRecipientReuseSupported:
        name === "retry_unsaved_preparation" &&
        branches.some(
          (branch) =>
            branch?.properties?.noRecipientSaved?.const === false &&
            !!branch?.properties?.reuseSavedRecipient &&
            !!branch?.properties?.recipientMatches,
        ),
      savedFirstTimeDraftSupported: branches.some(
        (branch) =>
          !!branch?.properties?.kind?.enum?.includes("first_time_draft") &&
          ["draftSaved", "draftReopened", "noPriorTransfer"].every(
            (field) => !!branch?.properties?.[field],
          ),
      ),
    };
  });
  const continuousPreparationSupported = tools
    .slice(0, 4)
    .every(
      (tool, index) =>
        tool.present &&
        !tool.quoteHashRequired &&
        (index === 0 || tool.preparationHashSupported) &&
        (index !== 1 || tool.finalQuoteSupported),
    );
  console.log(
    JSON.stringify(
      {
        inspection: "offline-checkout-only",
        sourcePath: fileURLToPath(source),
        sourceSha256: createHash("sha256")
          .update(await readFile(source))
          .digest("hex"),
        workflowRevision: makerPlaybook.workflowRevision,
        continuousPreparationSupported,
        savedFirstTimeDraftSupported:
          tools[1]?.savedFirstTimeDraftSupported === true,
        savedDraftRecoverySupported:
          tools[1]?.savedDraftRecoverySupported === true,
        unsavedRecoverySupported: tools[4]?.unsavedRecoverySupported === true,
        savedRecipientReuseSupported:
          tools[4]?.savedRecipientReuseSupported === true,
        cardVerificationHandoffSupported:
          tools[1]?.cardVerificationHandoffSupported === true,
        tools,
      },
      null,
      2,
    ),
  );
  if (!continuousPreparationSupported) process.exitCode = 1;
} finally {
  await client.close();
  await server.close();
}
