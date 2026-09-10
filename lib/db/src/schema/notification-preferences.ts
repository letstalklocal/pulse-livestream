import { integer, jsonb, pgTable, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
export const notificationPreferencesTable = pgTable(
  "notification_preferences",
  {
    userId: integer("user_id")
      .primaryKey()
      .references(() => usersTable.uid, { onDelete: "cascade" }),
    preferences: jsonb("preferences")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
