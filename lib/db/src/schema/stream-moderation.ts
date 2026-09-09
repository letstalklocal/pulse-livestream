import { boolean, integer, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { liveStreamSessionsTable } from "./live-stream-sessions";

export const streamModerationTable = pgTable("stream_moderation", {
  sessionId: integer("session_id").notNull().references(() => liveStreamSessionsTable.id, { onDelete: "cascade" }),
  viewerUserId: integer("viewer_user_id").notNull().references(() => usersTable.uid, { onDelete: "cascade" }),
  muted: boolean("muted").notNull().default(false),
  removed: boolean("removed").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.sessionId, table.viewerUserId] })]);

export const creatorBlocksTable = pgTable("creator_blocks", {
  hostUserId: integer("host_user_id").notNull().references(() => usersTable.uid, { onDelete: "cascade" }),
  viewerUserId: integer("viewer_user_id").notNull().references(() => usersTable.uid, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.hostUserId, table.viewerUserId] })]);

export const streamReportsTable = pgTable("stream_reports", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => liveStreamSessionsTable.id),
  reporterUserId: integer("reporter_user_id").notNull().references(() => usersTable.uid),
  reason: text("reason").notNull(),
  details: text("details").notNull().default(""),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("stream_reports_session_reporter_idx").on(table.sessionId, table.reporterUserId)]);
