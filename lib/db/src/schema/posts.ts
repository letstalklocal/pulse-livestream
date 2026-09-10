import { index, integer, pgTable, serial, text, timestamp, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";
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

export const postReactionsTable = pgTable("post_reactions", {
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.uid, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.postId, table.userId, table.kind] }), index("post_reactions_user_kind_idx").on(table.userId, table.kind)]);

export const postCommentsTable = pgTable("post_comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.uid, { onDelete: "cascade" }),
  text: text("text").notNull(),
  requestId: text("request_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("post_comments_post_id_idx").on(table.postId, table.id), uniqueIndex("post_comments_request_idx").on(table.userId, table.requestId)]);
