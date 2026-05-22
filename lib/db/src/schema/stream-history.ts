import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const streamHistoryTable = pgTable("stream_history", {
  id: serial("id").primaryKey(),
  channelId: text("channel_id").notNull().unique(),
  hostUid: integer("host_uid").notNull(),
  hostName: text("host_name").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at"),
  peakViewers: integer("peak_viewers").notNull().default(0),
});

export const insertStreamHistorySchema = createInsertSchema(streamHistoryTable).omit({
  id: true,
});

export type InsertStreamHistory = z.infer<typeof insertStreamHistorySchema>;
export type StreamHistory = typeof streamHistoryTable.$inferSelect;
