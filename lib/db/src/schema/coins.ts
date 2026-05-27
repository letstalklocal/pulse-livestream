import { pgTable, integer, text, timestamp, serial } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

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
  channelId:   text("channel_id"),
  description: text("description").notNull().default(""),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

export type CoinBalance     = typeof coinBalancesTable.$inferSelect;
export type CoinTransaction = typeof coinTransactionsTable.$inferSelect;
