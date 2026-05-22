import { pgTable, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const followsTable = pgTable(
  "follows",
  {
    followerId: integer("follower_id")
      .notNull()
      .references(() => usersTable.uid),
    followedId: integer("followed_id")
      .notNull()
      .references(() => usersTable.uid),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followedId] })],
);

export type Follow = typeof followsTable.$inferSelect;
