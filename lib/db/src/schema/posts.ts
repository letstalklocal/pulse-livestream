import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id")
    .notNull()
    .references(() => usersTable.uid, { onDelete: "cascade" }),
  imageObjectPath: text("image_object_path").notNull(),
  caption: text("caption").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("posts_owner_created_idx").on(table.ownerUserId, table.createdAt),
]);

export type Post = typeof postsTable.$inferSelect;