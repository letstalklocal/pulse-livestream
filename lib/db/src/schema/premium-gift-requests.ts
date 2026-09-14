import { sql } from "drizzle-orm";
import {
  index,
  uniqueIndex,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { liveStreamSessionsTable } from "./live-stream-sessions";
import { usersTable } from "./users";
import { coinTransactionsTable } from "./coins";

export const premiumGiftRequestsTable = pgTable(
  "premium_gift_requests",
  {
    id: text("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => liveStreamSessionsTable.id),
    giftId: text("gift_id").notNull(),
    giftName: text("gift_name").notNull(),
    giftEmoji: text("gift_emoji").notNull(),
    coinCost: integer("coin_cost").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => [
    index("premium_gift_requests_session_idx").on(table.sessionId),
    uniqueIndex("premium_gift_requests_active_idx")
      .on(table.sessionId)
      .where(sql`${table.settledAt} IS NULL`),
  ],
);

export const premiumGiftViewersTable = pgTable(
  "premium_gift_viewers",
  {
    requestId: text("request_id")
      .notNull()
      .references(() => premiumGiftRequestsTable.id),
    viewerUserId: integer("viewer_user_id")
      .notNull()
      .references(() => usersTable.uid),
    transactionId: integer("transaction_id").references(
      () => coinTransactionsTable.id,
    ),
    waivedAt: timestamp("waived_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.requestId, table.viewerUserId] }),
    index("premium_gift_viewers_user_idx").on(table.viewerUserId),
  ],
);

/** Rule IDs are needed to honor the host's existing Allow Back action. */
export const liveViewerBansTable = pgTable(
  "live_viewer_bans",
  {
    id: text("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => liveStreamSessionsTable.id),
    viewerUserId: integer("viewer_user_id")
      .notNull()
      .references(() => usersTable.uid),
    rtcChannelName: text("rtc_channel_name").notNull(),
    ruleId: integer("rule_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("live_viewer_bans_session_user_idx").on(
      table.sessionId,
      table.viewerUserId,
    ),
  ],
);
