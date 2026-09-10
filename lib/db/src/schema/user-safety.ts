import { integer, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { directMessagesTable } from "./direct-messages";
export const userBlocksTable = pgTable("user_blocks", {
  blockerUserId: integer("blocker_user_id").notNull().references(() => usersTable.uid, { onDelete: "cascade" }),
  blockedUserId: integer("blocked_user_id").notNull().references(() => usersTable.uid, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.blockerUserId, t.blockedUserId] })]);
export const userReportsTable = pgTable("user_reports", {
  id: serial("id").primaryKey(),
  reporterUserId: integer("reporter_user_id").references(() => usersTable.uid, { onDelete: "set null" }),
  reportedUserId: integer("reported_user_id").references(() => usersTable.uid, { onDelete: "set null" }),
  reportedUid: integer("reported_uid").notNull(),
  messageId: integer("message_id").references(() => directMessagesTable.id, { onDelete: "set null" }),
  reference: text("reference").notNull(),
  source: text("source").notNull(),
  reason: text("reason").notNull(),
  details: text("details").notNull().default(""),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("user_reports_identity_idx").on(t.reporterUserId, t.reportedUid, t.reference)]);
