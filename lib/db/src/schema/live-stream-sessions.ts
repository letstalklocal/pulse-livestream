import { boolean, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** A channel is allocated once, making a live session and its admissions non-reusable. */
export const liveStreamSessionsTable = pgTable("live_stream_sessions", {
  id: serial("id").primaryKey(),
  channelId: text("channel_id").notNull().unique(),
  hostUserId: integer("host_user_id").notNull().references(() => usersTable.uid),
  hostName: text("host_name").notNull(),
  hostAvatarUrl: text("host_avatar_url"),
  hostBackgroundImagePath: text("host_background_image_path"),
  title: text("title").notNull(),
  stickers: jsonb("stickers").$type<Array<{ id: string; kind: "gift" | "pack"; giftId: string; giftRevisionId?: string; packId?: number }>>().notNull().default([]),
  category: text("category").notNull(),
  rtcChannelName: text("rtc_channel_name"),
  premiumFreeViewerIds: jsonb("premium_free_viewer_ids").$type<number[]>().notNull().default([]),
  allowIncognito: boolean("allow_incognito").notNull().default(true),
  requiredGiftId: text("required_gift_id"),
  requiredGiftName: text("required_gift_name"),
  requiredGiftEmoji: text("required_gift_emoji"),
  requiredGiftCoinCost: integer("required_gift_coin_cost"),
  isPrivate: boolean("is_private").notNull().default(false),
  paused: boolean("paused").notNull().default(false),
  totalViewers: integer("total_viewers").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

/** One row per admitted viewer per live, so returns and heartbeats do not inflate the total. */
export const liveStreamViewersTable = pgTable("live_stream_viewers", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => liveStreamSessionsTable.id, { onDelete: "cascade" }),
  viewerUserId: integer("viewer_user_id").notNull().references(() => usersTable.uid, { onDelete: "cascade" }),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("live_stream_viewers_session_user_unique").on(table.sessionId, table.viewerUserId)]);

export type LiveStreamSession = typeof liveStreamSessionsTable.$inferSelect;
