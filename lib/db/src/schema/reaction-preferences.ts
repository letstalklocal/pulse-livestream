import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
export const reactionPreferencesTable = pgTable("reaction_preferences", {
  userId: integer("user_id").primaryKey().references(() => usersTable.uid, { onDelete: "cascade" }),
  emojis: text("emojis").array().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
