import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Kept separate from users: public profile serializers must never expose preferences or provider data.
export const identityVerificationsTable = pgTable("identity_verifications", {
  userId: integer("user_id").primaryKey().references(() => usersTable.uid, { onDelete: "cascade" }),
  reference: uuid("reference").notNull().unique(),
  status: text("status").notNull().default("not_started"),
  isVerified: boolean("is_verified").notNull().default(false),
  environment: text("environment").notNull(),
  sessionId: text("session_id").unique(),
  sessionUrl: text("session_url"),
  workflowId: text("workflow_id"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  matureContentEnabled: boolean("mature_content_enabled").notNull().default(false),
  preferenceUpdatedAt: timestamp("preference_updated_at", { withTimezone: true }),
  preferenceVersion: text("preference_version"),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  consentVersion: text("consent_version"),
  attempts: integer("attempts").notNull().default(0),
  attemptWindowAt: timestamp("attempt_window_at", { withTimezone: true }).defaultNow().notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const verificationWebSessionsTable = pgTable("verification_web_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.uid, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
