import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const directMessagesTable = pgTable("direct_messages", {
  id:         serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull().references(() => usersTable.uid),
  toUserId:   integer("to_user_id").notNull().references(() => usersTable.uid),
  text:       text("text").notNull(),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
  readAt:     timestamp("read_at"),
});

export type DirectMessage = typeof directMessagesTable.$inferSelect;
