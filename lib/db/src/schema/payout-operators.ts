import {
  pgTable,
  text,
  timestamp,
  integer,
  bigint,
  bigserial,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
export const payoutOperatorCredentialsTable = pgTable(
  "payout_operator_credentials",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    environment: text("environment").notNull(),
    accountKey: text("account_key").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: text("created_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    rateWindow: timestamp("rate_window", { withTimezone: true }),
    requestCount: integer("request_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
export const payoutOperatorBrowserLeasesTable = pgTable(
  "payout_operator_browser_leases",
  {
    id: text("id").primaryKey(),
    credentialId: text("credential_id")
      .notNull()
      .references(() => payoutOperatorCredentialsTable.id),
    environment: text("environment").notNull(),
    accountKey: text("account_key").notNull(),
    resource: text("resource").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    fencingToken: bigint("fencing_token", { mode: "bigint" }).notNull(),
    state: text("state").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("payout_operator_browser_nonce_idx").on(
      t.credentialId,
      t.idempotencyKey,
    ),
  ],
);
export const payoutOperatorEventsTable = pgTable("payout_operator_events", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  environment: text("environment").notNull(),
  accountKey: text("account_key").notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target"),
  metadata: jsonb("metadata").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
