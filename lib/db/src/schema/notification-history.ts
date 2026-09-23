import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
export const notificationHistoryTable = pgTable(
  "notification_history",
  {
    id: serial("id").primaryKey(),
    recipientUserId: integer("recipient_user_id")
      .notNull()
      .references(() => usersTable.uid, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    actorUserId: integer("actor_user_id").references(() => usersTable.uid, {
      onDelete: "set null",
    }),
    category: text("category").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    route: text("route").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    unique().on(table.recipientUserId, table.sourceKey),
    index("notification_history_recipient_id").on(
      table.recipientUserId,
      table.id,
    ),
  ],
);
