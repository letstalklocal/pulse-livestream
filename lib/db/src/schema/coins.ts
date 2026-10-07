import { pgTable, integer, text, timestamp, serial, uniqueIndex, index, primaryKey, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { liveBattlesTable } from "./live-parties";

export const coinBalancesTable = pgTable("coin_balances", {
  userId:    integer("user_id").primaryKey().references(() => usersTable.uid),
  balance:   integer("balance").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const coinTransactionsTable = pgTable("coin_transactions", {
  id:          serial("id").primaryKey(),
  // Unified sender/receiver columns — both set for gifts, only toUserId set for grants
  fromUserId:  integer("from_user_id").references(() => usersTable.uid),
  toUserId:    integer("to_user_id").references(() => usersTable.uid),
  amount:      integer("amount").notNull(),
  type:        text("type").notNull(), // "gift" | "grant"
  giftName:    text("gift_name"),
  // Purchase-time catalog metadata, never reinterpreted using today's price/art.
  giftSnapshot: jsonb("gift_snapshot").$type<Record<string, unknown>>(),
  channelId:   text("channel_id"),
  battleId: text("battle_id").references(() => liveBattlesTable.id),
  description: text("description").notNull().default(""),
  idempotencyKey: text("idempotency_key"),
  balanceAfter: integer("balance_after"),
  giftComboId: text("gift_combo_id"),
  giftComboCount: integer("gift_combo_count"),
  giftComboTotalCoins: integer("gift_combo_total_coins"),
  giftComboClosedAt: timestamp("gift_combo_closed_at"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("coin_transactions_idempotency_key_idx").on(table.idempotencyKey),
  index("coin_transactions_live_combo_idx").on(table.fromUserId, table.channelId, table.toUserId, table.createdAt, table.id),
]);

export const liveGiftComboMilestonesTable = pgTable("live_gift_combo_milestones", {
  comboId: text("combo_id").notNull(),
  count: integer("count").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.comboId, table.count] })]);

export type CoinBalance     = typeof coinBalancesTable.$inferSelect;
export type CoinTransaction = typeof coinTransactionsTable.$inferSelect;
