import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { pushSchema } from "drizzle-kit/api";
import { giftCatalogDataMigrationsTable } from "../src/schema/index";

// Use a disposable PostgreSQL server: never synchronize the workspace database.
const directory = mkdtempSync(join(tmpdir(), "pulse-gift-marker-schema-"));
let started = false;
let pool: Pool | undefined;
try {
  execFileSync("initdb", ["-D", join(directory, "data"), "-A", "trust", "-U", "schema_test", "--no-locale"], { stdio: "pipe" });
  execFileSync("pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -h '' -p 5432`, "-w", "start"], { stdio: "pipe" });
  started = true;
  pool = new Pool({ connectionString: `postgresql://schema_test@localhost/postgres?host=${encodeURIComponent(directory)}` });
  const migration = readFileSync(new URL("../migrations/20261007_development_gift_catalog.mjs", import.meta.url), "utf8");
  const createTable = migration.match(/CREATE TABLE IF NOT EXISTS gift_catalog_data_migrations \([\s\S]*?\)`/);
  assert.ok(createTable, "exercise the actual production migration's table definition");
  await pool.query(createTable[0].slice(0, -1));
  await pool.query("INSERT INTO gift_catalog_data_migrations(id,snapshot_sha256,previous_catalog) VALUES('completed-import','checksum','{\"gifts\":[{\"id\":\"existing\"}]}')");
  const before = (await pool.query("SELECT * FROM gift_catalog_data_migrations")).rows;
  const database = drizzle(pool);
  const missing = await pushSchema({}, database, ["public"], ["gift_catalog_data_migrations"]);
  assert.ok(missing.statementsToExecute.some(sql => /DROP TABLE.*gift_catalog_data_migrations/.test(sql)), "reproduce the deployment drop when the marker is unregistered");
  for (let deployment = 0; deployment < 2; deployment++) {
    const plan = await pushSchema({ giftCatalogDataMigrationsTable }, database, ["public"], ["gift_catalog_data_migrations"]);
    assert.deepEqual(plan.statementsToExecute, [], "registered schema matches the existing production table on repeated deployments");
    assert.equal(plan.hasDataLoss, false);
    await plan.apply();
    assert.deepEqual((await pool.query("SELECT * FROM gift_catalog_data_migrations")).rows, before, "completion marker and recovery snapshot survive schema synchronization");
  }
  console.log("PASS: deployment drop reproduced; registered gift migration table produces no SQL on repeated schema syncs and preserves its completion marker and recovery snapshot.");
} finally {
  await pool?.end();
  if (started) execFileSync("pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
}
