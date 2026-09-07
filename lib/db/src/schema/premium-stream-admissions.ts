import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { coinTransactionsTable } from "./coins";
import { liveStreamSessionsTable } from "./live-stream-sessions";
import { usersTable } from "./users";

/** Durable proof that a viewer paid to enter a particular Premium live stream. */
export const premiumStreamAdmissionsTable = pgTable("premium_stream_admissions", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => liveStreamSessionsTable.id),
  channelId: text("channel_id").notNull(),
  viewerUserId: integer("viewer_user_id").notNull().references(() => usersTable.uid),
  hostUserId: integer("host_user_id").notNull().references(() => usersTable.uid),
  giftId: text("gift_id").notNull(),
  giftName: text("gift_name").notNull(),
  giftEmoji: text("gift_emoji").notNull(),
  amount: integer("amount").notNull(),
  transactionId: integer("transaction_id").notNull().references(() => coinTransactionsTable.id),
  idempotencyKey: text("idempotency_key").notNull(),
  admittedAt: timestamp("admitted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("premium_stream_admissions_session_viewer_idx").on(table.sessionId, table.viewerUserId),
  uniqueIndex("premium_stream_admissions_idempotency_key_idx").on(table.idempotencyKey),
]);

export type PremiumStreamAdmission = typeof premiumStreamAdmissionsTable.$inferSelect;