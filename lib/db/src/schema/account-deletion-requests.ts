import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Reports for manual review. Creating a report never deletes or disables an account.
export const accountDeletionRequestsTable = pgTable(
  "account_deletion_requests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.uid),
    status: text("status").notNull().default("pending"),
    reason: text("reason").notNull().default(""),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNotes: text("review_notes").notNull().default(""),
  },
  (table) => [
    uniqueIndex("account_deletion_requests_pending_user_idx")
      .on(table.userId)
      .where(sql`${table.status} = 'pending'`),
    index("account_deletion_requests_status_date_idx").on(
      table.status,
      table.requestedAt,
    ),
    check(
      "account_deletion_requests_status_check",
      sql`${table.status} in ('pending', 'cancelled', 'rejected', 'completed')`,
    ),
  ],
);
