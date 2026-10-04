import {
  pgTable,
  integer,
  text,
  timestamp,
  boolean,
  jsonb,
  bigserial,
  bigint,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
export const creatorCashAccountsTable = pgTable("creator_cash_accounts", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => usersTable.uid),
  enabled: boolean("enabled").notNull().default(true),
  repeatAllowed: boolean("repeat_allowed").notNull().default(false),
  enrolledBy: text("enrolled_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const creatorCashLedgerTable = pgTable("creator_cash_ledger", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => creatorCashAccountsTable.userId),
  kind: text("kind").notNull(),
  sourceRef: text("source_ref").notNull().unique(),
  availableTicks: bigint("available_ticks", { mode: "bigint" })
    .notNull()
    .default(0n),
  reservedTicks: bigint("reserved_ticks", { mode: "bigint" })
    .notNull()
    .default(0n),
  availableAt: timestamp("available_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  withdrawalId: text("withdrawal_id"),
  actor: text("actor").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const creatorPayoutRecipientsTable = pgTable(
  "creator_payout_recipients",
  {
    userId: integer("user_id")
      .primaryKey()
      .references(() => usersTable.uid),
    data: jsonb("data").notNull(),
    revision: integer("revision").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
export const creatorWithdrawalsTable = pgTable(
  "creator_withdrawals",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => creatorCashAccountsTable.userId),
    accountKey: text("account_key").notNull(),
    methodId: text("method_id").notNull(),
    grossCents: integer("gross_cents").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    recipient: jsonb("recipient").notNull(),
    route: jsonb("route").notNull(),
    status: text("status").notNull().default("awaiting_quote"),
    quote: jsonb("quote"),
    approvedQuoteHash: text("approved_quote_hash"),
    checker: jsonb("checker"),
    providerOnboardingStatus: text("provider_onboarding_status")
      .notNull()
      .default("pending"),
    providerLink: text("provider_link"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("creator_withdrawals_idempotency_idx").on(
      t.userId,
      t.idempotencyKey,
    ),
  ],
);
export const creatorPayoutAttemptsTable = pgTable("creator_payout_attempts", {
  id: text("id").primaryKey(),
  withdrawalId: text("withdrawal_id")
    .notNull()
    .references(() => creatorWithdrawalsTable.id),
  accountKey: text("account_key").notNull(),
  maker: text("maker").notNull(),
  state: text("state").notNull(),
  bindingHash: text("binding_hash").notNull(),
  evidence: jsonb("evidence"),
  draftId: text("draft_id"),
  providerReference: text("provider_reference"),
  activityId: text("activity_id"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const creatorPayoutEventsTable = pgTable("creator_payout_events", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  withdrawalId: text("withdrawal_id").references(
    () => creatorWithdrawalsTable.id,
  ),
  userId: integer("user_id"),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  evidence: jsonb("evidence").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const creatorPayoutSettingsTable = pgTable("creator_payout_settings", {
  id: integer("id").primaryKey(),
  preparationPaused: boolean("preparation_paused").notNull().default(false),
});
