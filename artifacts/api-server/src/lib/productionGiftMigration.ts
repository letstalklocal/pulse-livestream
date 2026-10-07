import { readFile } from "node:fs/promises";
import { pool } from "@workspace/db";
import { objectStorageClient } from "./objectStorage";
import { logger } from "./logger";

/** Build packages these files beside index.mjs; do not depend on workspace paths in production. */
export async function runProductionGiftMigration() {
  if (process.env.NODE_ENV !== "production" && process.env.REPLIT_DEPLOYMENT !== "1") return;
  const directory = new URL("./gift-migrations/", import.meta.url);
  const migration = await import(new URL("20261007_development_gift_catalog.mjs", directory).href);
  const source = JSON.parse(await readFile(new URL("20261007_development_gift_catalog.json", directory), "utf8"));
  logger.info("Checking one-time production gift catalog migration");
  const result = await migration.runProductionGiftMigration({
    env: process.env, pool, storage: objectStorageClient, source,
    readSchema: (name: string) => readFile(new URL(name, directory), "utf8"),
  });
  logger.info(result, result.alreadyApplied ? "Gift catalog migration already completed; skipping" : "Gift catalog migration completed");
}
