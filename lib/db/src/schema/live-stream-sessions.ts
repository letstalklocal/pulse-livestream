import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
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
  category: text("category").notNull(),
  rtcChannelName: text("rtc_channel_name"),
  premiumFreeViewerIds: jsonb("premium_free_viewer_ids").$type<number[]>().notNull().default([]),
  requiredGiftId: text("required_gift_id"),
  requiredGiftName: text("required_gift_name"),
  requiredGiftEmoji: text("required_gift_emoji"),
  requiredGiftCoinCost: integer("required_gift_coin_cost"),
  isPrivate: boolean("is_private").notNull().default(false),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export type LiveStreamSession = typeof liveStreamSessionsTable.$inferSelect;