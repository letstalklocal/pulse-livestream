#!/usr/bin/env node
// No migration or payment side effects. Writes require both an explicit account and --apply.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const require = createRequire(import.meta.url);
require("tsx/cjs");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { normalizeResearch, importResearch } = require(
  resolve(root, "artifacts/api-server/src/lib/payoutCatalog.ts"),
);
const args = process.argv.slice(2);
const allowed = new Set([
  "--file",
  "--account",
  "--apply",
  "--dry-run",
  "--help",
]);
if (args.includes("--help")) {
  console.log(
    "node scripts/import-payout-research.mjs --file <research.json> --account <signed-in-account-alias> [--apply]\nDefault: validation-only dry run. DATABASE_URL is required only for --apply. No production deployment or payment occurs.",
  );
  process.exit(0);
}
let file = resolve(
    root,
    "artifacts/api-server/src/config/remitly-research-20261004.json",
  ),
  account,
  apply = false;
try {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!allowed.has(arg)) throw new Error(`Unknown argument: ${arg}`);
    if (arg === "--file" || arg === "--account") {
      const value = args[++i];
      if (!value || value.startsWith("--"))
        throw new Error(`${arg} requires a value.`);
      if (arg === "--file") file = resolve(value);
      else account = value;
    } else if (arg === "--apply") apply = true;
    else if (arg === "--dry-run") apply = false;
  }
  if (!account)
    throw new Error(
      "--account is required; identify the observed signed-in Remitly Business account scope.",
    );
  const raw = await readFile(file, "utf8");
  if (Buffer.byteLength(raw) > 250000)
    throw new Error("Research file is too large.");
  const research = JSON.parse(raw);
  if (!apply) {
    const data = normalizeResearch(research, account);
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          providerId: data.providerId,
          countries: data.countries.length,
          methods: data.methods.length,
          observations: data.observations.length,
        },
        null,
        2,
      ),
    );
  } else {
    if (!process.env.DATABASE_URL)
      throw new Error("DATABASE_URL is required for --apply.");
    const { Pool } = createRequire(
      pathToFileURL(resolve(root, "lib/db/package.json")),
    )("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      console.log(
        JSON.stringify(
          await importResearch(pool, research, account, "research_import_cli"),
          null,
          2,
        ),
      );
    } finally {
      await pool.end();
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Import failed.");
  process.exitCode = 1;
}
