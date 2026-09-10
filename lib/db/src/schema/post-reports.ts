import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { postsTable } from "./posts";
import { usersTable } from "./users";

export const postReportsTable = pgTable("post_reports", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").references(() => postsTable.id, { onDelete: "set null" }),
  reportedPostId: integer("reported_post_id").notNull(),
  ownerUserId: integer("owner_user_id").references(() => usersTable.uid, { onDelete: "set null" }),
  reporterUserId: integer("reporter_user_id").references(() => usersTable.uid, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  details: text("details").notNull().default(""),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("post_reports_post_reporter_idx").on(table.reportedPostId, table.reporterUserId),
  index("post_reports_status_created_idx").on(table.status, table.createdAt),
]);
