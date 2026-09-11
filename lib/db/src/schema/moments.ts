import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { coinTransactionsTable } from "./coins";
export const momentsTable = pgTable(
  "moments",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => usersTable.uid, { onDelete: "cascade" }),
    giftTransactionId: integer("gift_transaction_id")
      .notNull()
      .references(() => coinTransactionsTable.id, { onDelete: "cascade" }),
    objectPath: text("object_path").notNull(),
    embeddedObjectPath: text("embedded_object_path"),
    status: text("status").notNull().default("uploading"),
    durationMs: integer("duration_ms"),
    captureMode: text("capture_mode"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("moments_gift_transaction_id_key").on(table.giftTransactionId),
    index("moments_owner_created_idx").on(
      table.ownerUserId,
      table.createdAt.desc(),
    ),
    check(
      "moments_status_check",
      sql`${table.status} in ('uploading', 'ready', 'deleted')`,
    ),
  ],
);
