import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { pushSchema } from "drizzle-kit/api";
import { giftCatalogDataMigrationsTable } from "../src/schema/index";
import { ensureGiftMigrationMarker, markerSchemaUrl } from "../migrations/20261007_development_gift_catalog.mjs";

// Use a disposable PostgreSQL server: never synchronize the workspace database.
const directory = mkdtempSync(join(tmpdir(), "pulse-gift-marker-schema-"));
let started = false;
let pool: Pool | undefined;
try {
  execFileSync("initdb", ["-D", join(directory, "data"), "-A", "trust", "-U", "schema_test", "--no-locale"], { stdio: "pipe" });
  execFileSync("pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -h '' -p 5432`, "-w", "start"], { stdio: "pipe" });
  started = true;
  pool = new Pool({ connectionString: `postgresql://schema_test@localhost/postgres?host=${encodeURIComponent(directory)}` });
  await pool.query(readFileSync(markerSchemaUrl, "utf8"));
  await pool.query("INSERT INTO gift_catalog_data_migrations(id,snapshot_sha256,previous_catalog) VALUES('completed-import','checksum','{\"gifts\":[{\"id\":\"existing\"}]}')");
  const before = (await pool.query("SELECT * FROM gift_catalog_data_migrations")).rows;
  const database = drizzle(pool);
  const missing = await pushSchema({}, database, ["public"], ["gift_catalog_data_migrations"]);
  assert.ok(missing.statementsToExecute.some(sql => /DROP TABLE.*gift_catalog_data_migrations/.test(sql)), "reproduce the deployment drop when the marker is unregistered");
  await pool.query("CREATE DATABASE development_fixture");
  const development = new Pool({ connectionString: `postgresql://schema_test@localhost/development_fixture?host=${encodeURIComponent(directory)}` });
  try {
    assert.equal((await development.query("SELECT to_regclass('gift_catalog_data_migrations') AS name")).rows[0].name, null, "reproduce the missing live development table despite its code definition");
    await ensureGiftMigrationMarker(development);
    await ensureGiftMigrationMarker(development);
    const columns = "SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='gift_catalog_data_migrations' ORDER BY ordinal_position";
    assert.deepEqual((await development.query(columns)).rows, (await pool.query(columns)).rows, "live development and production marker schemas match");
    assert.equal((await development.query("SELECT count(*)::integer AS count FROM gift_catalog_data_migrations")).rows[0].count, 0, "development never fabricates import completion");
    assert.deepEqual((await pool.query("SELECT * FROM gift_catalog_data_migrations")).rows, before, "development schema alignment preserves the production fixture completion row");
  } finally { await development.end(); }
  for (let deployment = 0; deployment < 2; deployment++) {
    const plan = await pushSchema({ giftCatalogDataMigrationsTable }, database, ["public"], ["gift_catalog_data_migrations"]);
    assert.deepEqual(plan.statementsToExecute, [], "registered schema matches the existing production table on repeated deployments");
    assert.equal(plan.hasDataLoss, false);
    await plan.apply();
    assert.deepEqual((await pool.query("SELECT * FROM gift_catalog_data_migrations")).rows, before, "completion marker and recovery snapshot survive schema synchronization");
  }
  console.log("PASS: deployment drop and missing live development table reproduced; schema-only startup aligns live marker schemas without completion rows, and repeated schema syncs preserve production completion/recovery records.");
} finally {
  await pool?.end();
  if (started) execFileSync("pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
}
