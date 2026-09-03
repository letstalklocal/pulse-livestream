import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const mediaPacksTable = pgTable("media_packs", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.uid, { onDelete: "cascade" }),
  name: text("name").notNull(),
  coinPrice: integer("coin_price").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("media_packs_owner_idx").on(t.ownerUserId, t.createdAt), check("media_packs_positive_price", sql`${t.coinPrice} > 0`)]);

export const mediaPackItemsTable = pgTable("media_pack_items", {
  id: serial("id").primaryKey(),
  packId: integer("pack_id").notNull().references(() => mediaPacksTable.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type").notNull(),
  width: integer("width"),
  height: integer("height"),
  durationMs: integer("duration_ms"),
}, (t) => [uniqueIndex("media_pack_items_position_idx").on(t.packId, t.position), check("media_pack_items_valid_position", sql`${t.position} >= 0`)]);

export const mediaPackPurchasesTable = pgTable("media_pack_purchases", {
  id: serial("id").primaryKey(),
  packId: integer("pack_id").notNull().references(() => mediaPacksTable.id, { onDelete: "cascade" }),
  buyerUserId: integer("buyer_user_id").notNull().references(() => usersTable.uid, { onDelete: "cascade" }),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("media_pack_purchases_pack_buyer_idx").on(t.packId, t.buyerUserId),
  uniqueIndex("media_pack_purchases_idempotency_key_idx").on(t.idempotencyKey),
]);