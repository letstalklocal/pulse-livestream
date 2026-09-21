import {
  pgTable,
  uuid,
  integer,
  text,
  jsonb,
  timestamp,
  boolean,
  bigserial,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { coinTransactionsTable } from "./coins";
export const creatorVideosTable = pgTable(
  "creator_videos",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => usersTable.uid, { onDelete: "cascade" }),
    bunnyId: text("bunny_id").notNull().unique(),
    filename: text("filename").notNull(),
    status: text("status").notNull().default("uploading"),
    playbackUrl: text("playback_url"),
    thumbnailUrl: text("thumbnail_url"),
    durationSeconds: integer("duration_seconds"),
    stickers: jsonb("stickers").$type<{ id: string; kind: "gift" | "pack"; giftId: string; packId?: number }[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("creator_videos_owner_idx").on(t.ownerUserId, t.createdAt)],
);
export const creatorVideoSettingsTable = pgTable("creator_video_settings", {
  ownerUserId: integer("owner_user_id")
    .primaryKey()
    .references(() => usersTable.uid, { onDelete: "cascade" }),
  selectedVideoId: uuid("selected_video_id").references(
    () => creatorVideosTable.id,
    { onDelete: "set null" },
  ),
  pendingVideoId: uuid("pending_video_id").references(
    () => creatorVideosTable.id,
    { onDelete: "set null" },
  ),
  enabled: boolean("enabled").notNull().default(false),
});
export const creatorVideoViewsTable = pgTable(
  "creator_video_views",
  {
    id: uuid("id").primaryKey(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => creatorVideosTable.id, { onDelete: "cascade" }),
    viewerUserId: integer("viewer_user_id")
      .notNull()
      .references(() => usersTable.uid, { onDelete: "cascade" }),
    watchedSeconds: integer("watched_seconds").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("creator_video_views_video_idx").on(t.videoId, t.lastSeenAt)],
);
export const creatorVideoGiftsTable = pgTable(
  "creator_video_gifts",
  {
    transactionId: integer("transaction_id")
      .primaryKey()
      .references(() => coinTransactionsTable.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => creatorVideosTable.id, { onDelete: "cascade" }),
  },
  (t) => [index("creator_video_gifts_video_idx").on(t.videoId)],
);
export const creatorVideoChatTable = pgTable(
  "creator_video_chat",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => creatorVideosTable.id, { onDelete: "cascade" }),
    senderUserId: integer("sender_user_id")
      .notNull()
      .references(() => usersTable.uid, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().unique(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("creator_video_chat_video_idx").on(t.videoId, t.id)],
);
