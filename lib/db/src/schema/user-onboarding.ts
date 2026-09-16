import { date, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Private signup declarations. Never join these fields into public profiles.
export const userOnboardingTable = pgTable("user_onboarding", {
  userId: integer("user_id").primaryKey().references(() => usersTable.uid, { onDelete: "cascade" }),
  dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
  termsVersion: text("terms_version").notNull(),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }).notNull().defaultNow(),
});
