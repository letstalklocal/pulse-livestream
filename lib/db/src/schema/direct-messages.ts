import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const directMessagesTable = pgTable(
  "direct_messages",
  {
    id: serial("id").primaryKey(),
    fromUserId: integer("from_user_id")
      .notNull()
      .references(() => usersTable.uid, { onDelete: "cascade" }),
    toUserId: integer("to_user_id")
      .notNull()
      .references(() => usersTable.uid, { onDelete: "cascade" }),
    text: text("text").notNull(),
    kind: text("kind").notNull().default("text"),
    mediaPackId: integer("media_pack_id"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    readAt: timestamp("read_at"),
  },
  (table) => [
    index("direct_messages_sender_idx").on(table.fromUserId, table.createdAt),
    index("direct_messages_recipient_idx").on(table.toUserId, table.createdAt),
    uniqueIndex("direct_messages_idempotency_key_idx").on(table.idempotencyKey),
  ],
);

export type DirectMessage = typeof directMessagesTable.$inferSelect;