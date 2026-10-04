// Public configuration tests only. No database connection, writes or real auth credentials.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = `${root}/tests/.admin-auth-config-${randomUUID()}.cjs`;
const previous = Object.fromEntries(
  ["NODE_ENV", "DATABASE_URL", "CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"].map(
    (key) => [key, process.env[key]],
  ),
);
let server,
  pool,
  queries = 0;
try {
  await build({
    stdin: {
      contents: `import express from 'express';import router,{adminAuthConfig} from './src/routes/admin';export {adminAuthConfig};export {pool} from '@workspace/db';export {GetAdminAuthConfigResponse} from '@workspace/api-zod';export function testApp(){const app=express();app.use('/admin-data',router);return app;}`,
      resolveDir: root,
    },
    outfile: out,
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["pg-native"],
    logLevel: "silent",
  });
  process.env.DATABASE_URL =
    "postgresql://unused:unused@127.0.0.1:9/admin_config_no_connection";
  process.env.CLERK_SECRET_KEY = "private-server-only-test-marker";
  const runtime = createRequire(import.meta.url)(out);
  pool = runtime.pool;
  pool.query = async () => {
    queries++;
    throw new Error(
      "Database access is forbidden in this public configuration test.",
    );
  };
  server = runtime.testApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/admin-data/config`;
  const key = (mode, host) =>
    `pk_${mode}_${Buffer.from(`${host}$`).toString("base64").replace(/=+$/g, "")}`;
  const read = async () => {
    const response = await fetch(url);
    return {
      status: response.status,
      headers: response.headers,
      body: await response.json(),
    };
  };
  process.env.NODE_ENV = "production";
  process.env.CLERK_PUBLISHABLE_KEY = key(
    "live",
    "clerk.chimbalivestream.replit.app",
  );
  const production = await read();
  assert.equal(production.status, 200);
  assert.deepEqual(production.body, {
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    frontendApi: "https://clerk.chimbalivestream.replit.app",
    proxyUrl: "/api/__clerk",
  });
  assert.deepEqual(
    runtime.GetAdminAuthConfigResponse.parse(production.body),
    production.body,
  );
  assert.equal(production.headers.get("cache-control"), "no-store");
  assert.equal(production.headers.get("x-content-type-options"), "nosniff");
  assert.equal(
    JSON.stringify(production.body).includes(process.env.CLERK_SECRET_KEY),
    false,
  );
  process.env.NODE_ENV = "development";
  process.env.CLERK_PUBLISHABLE_KEY = key(
    "test",
    "primary-blowfish-79.clerk.accounts.dev",
  );
  const development = await read();
  assert.equal(development.status, 200);
  assert.deepEqual(development.body, {
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    frontendApi: "https://primary-blowfish-79.clerk.accounts.dev",
  });
  assert.deepEqual(
    runtime.GetAdminAuthConfigResponse.parse(development.body),
    development.body,
  );
  for (const invalid of [
    "",
    "sk_live_server_secret_fixture",
    "pk_live_invalid!",
    key("live", "bad/host"),
    key("live", "localhost"),
  ]) {
    process.env.CLERK_PUBLISHABLE_KEY = invalid;
    assert.throws(() => runtime.adminAuthConfig(), /Clerk unavailable/);
    const failure = await read();
    assert.equal(failure.status, 503);
    assert.deepEqual(failure.body, {
      error: "Admin sign-in is not configured.",
    });
    assert.equal(
      JSON.stringify(failure.body).includes(process.env.CLERK_SECRET_KEY),
      false,
    );
    assert.equal(Object.hasOwn(failure.body, "publishableKey"), false);
  }
  assert.equal(queries, 0);
  console.log(
    "Public admin auth config passed: production same-origin proxy, development direct host, invalid-key 503, headers and secret isolation; no database access.",
  );
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool?.end();
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    unlinkSync(out);
  } catch {}
}
