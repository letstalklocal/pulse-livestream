import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
export const messagePreferencesTable = pgTable("message_preferences", {
  userId: integer("user_id").primaryKey().references(() => usersTable.uid, { onDelete: "cascade" }),
  lastSeenOnline: boolean("last_seen_online").notNull().default(true),
  readReceipts: boolean("read_receipts").notNull().default(true),
  giftToOpenChat: boolean("gift_to_open_chat").notNull().default(true),
  requiredGiftId: text("required_gift_id").notNull().default("rose"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
});
