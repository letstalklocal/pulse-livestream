import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
export const privacyPreferencesTable = pgTable("privacy_preferences", {
  userId: integer("user_id").primaryKey().references(() => usersTable.uid, { onDelete: "cascade" }),
  hideLocation: boolean("hide_location").notNull().default(false),
  partyInvites: text("party_invites").$type<"everyone" | "friends">().notNull().default("everyone"),
  postsVisibility: text("posts_visibility").$type<"everyone" | "friends">().notNull().default("everyone"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
