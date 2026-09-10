import { createRequire } from "node:module";
const { Pool } = createRequire(
  new URL("../../../lib/db/package.json", import.meta.url),
)("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const { rows } = await pool.query(`
    SELECT r.id, r.user_id, u.clerk_id, u.name, r.reason, r.requested_at,
      COALESCE(c.balance, 0) AS current_coin_balance,
      COALESCE(c.balance, 0) <> 0 AS blocked_by_coins
    FROM account_deletion_requests r
    JOIN users u ON u.uid = r.user_id
    LEFT JOIN coin_balances c ON c.user_id = r.user_id
    WHERE r.status = 'pending'
    ORDER BY r.requested_at, r.id
  `);
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await pool.end();
}
