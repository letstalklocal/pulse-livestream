import { pgTable, text, integer, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { directMessagesTable } from "./direct-messages";
import { coinTransactionsTable } from "./coins";

export const dmGiftCombosTable = pgTable("dm_gift_combos", {
  id: text("id").primaryKey(),
  senderId: integer("sender_id").notNull().references(() => usersTable.uid),
  recipientId: integer("recipient_id").notNull().references(() => usersTable.uid),
  giftId: text("gift_id").notNull(),
  count: integer("count").notNull(),
  totalCoins: integer("total_coins").notNull(),
  lastPaidAt: timestamp("last_paid_at").notNull(),
  closedAt: timestamp("closed_at"),
  messageId: integer("message_id").notNull().references(() => directMessagesTable.id),
}, table => [index("dm_gift_combos_pair_idx").on(table.senderId, table.recipientId, table.lastPaidAt)]);

export const dmGiftComboPaymentsTable = pgTable("dm_gift_combo_payments", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  comboId: text("combo_id").notNull().references(() => dmGiftCombosTable.id),
  transactionId: integer("transaction_id").notNull().references(() => coinTransactionsTable.id),
  count: integer("count").notNull(),
});

// Durable future-effect events. No reward/effect is activated by recording one.
export const dmGiftComboMilestonesTable = pgTable("dm_gift_combo_milestones", {
  comboId: text("combo_id").notNull().references(() => dmGiftCombosTable.id),
  count: integer("count").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.comboId, table.count] })]);
