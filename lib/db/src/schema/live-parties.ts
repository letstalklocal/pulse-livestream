import { integer, pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { liveStreamSessionsTable } from "./live-stream-sessions";

export const livePartiesTable = pgTable("live_parties", {
  id: text("id").primaryKey(),
  firstChannelId: text("first_channel_id").notNull().references(() => liveStreamSessionsTable.channelId, { onDelete: "cascade" }),
  secondChannelId: text("second_channel_id").notNull().references(() => liveStreamSessionsTable.channelId, { onDelete: "cascade" }),
  status: text("status").$type<"pending" | "active" | "ended" | "declined">().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  firstReadyAt: timestamp("first_ready_at", { withTimezone: true }),
  secondReadyAt: timestamp("second_ready_at", { withTimezone: true }),
}, t => [index("live_parties_first_idx").on(t.firstChannelId), index("live_parties_second_idx").on(t.secondChannelId)]);

export const liveBattlesTable = pgTable("live_battles", {
  id: text("id").primaryKey(),
  partyId: text("party_id").notNull().references(() => livePartiesTable.id, { onDelete: "cascade" }),
  requesterUid: integer("requester_uid").notNull(),
  status: text("status").$type<"pending" | "active" | "finished" | "cancelled">().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  firstScore: integer("first_score").notNull().default(0),
  secondScore: integer("second_score").notNull().default(0),
}, t => [index("live_battles_party_idx").on(t.partyId)]);
