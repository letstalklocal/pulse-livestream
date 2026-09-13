import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(
  new URL("../../../lib/db/package.json", import.meta.url),
);
const { Pool } = require("pg");
const email = "one.espana@gmail.com";
if (!process.env.CLERK_SECRET_KEY || !process.env.DATABASE_URL)
  throw Error("Clerk and database configuration required.");
const response = await fetch(
  "https://api.clerk.com/v1/users?email_address=" + encodeURIComponent(email),
  { headers: { Authorization: "Bearer " + process.env.CLERK_SECRET_KEY } },
);
if (!response.ok)
  throw Error("Clerk identity lookup failed: " + response.status);
const matches = (await response.json()).filter(
  (u) =>
    !u.banned &&
    !u.locked &&
    u.email_addresses.some(
      (e) =>
        e.email_address.toLowerCase() === email &&
        e.verification?.status === "verified",
    ),
);
if (matches.length !== 1)
  throw Error(
    "Expected exactly one active Clerk account with the approved verified email.",
  );
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query(
    readFileSync(
      new URL(
        "../../../lib/db/migrations/20260913_admin_access.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await client.query("BEGIN");
  await client.query("LOCK TABLE admin_staff IN EXCLUSIVE MODE");
  const existing = await client.query(
    "SELECT clerk_user_id,enabled FROM admin_staff",
  );
  if (existing.rows.length) {
    if (
      !existing.rows.some((r) => r.clerk_user_id === matches[0].id && r.enabled)
    )
      throw Error(
        "Staff already configured; refusing to replace or re-enable access.",
      );
    console.log("Approved admin membership already exists.");
  } else {
    await client.query(
      "INSERT INTO admin_staff(clerk_user_id,role) VALUES($1,'owner')",
      [matches[0].id],
    );
    await client.query(
      "INSERT INTO admin_audit_events(actor_clerk_id,action,target,outcome) VALUES('bootstrap','owner.provision',$1,'allowed')",
      [matches[0].id],
    );
    console.log(
      "Approved verified account bound to owner membership. Mobile records unchanged.",
    );
  }
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await pool.end();
}
