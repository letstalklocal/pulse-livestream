import { sql } from "drizzle-orm";
import { type AnyPgColumn, check, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { privateStreamInvitationsTable } from "./private-stream-invitations";

export const directMessagesTable = pgTable(
  "direct_messages",
  {
    id: serial("id").primaryKey(),
    fromUserId: integer("from_user_id")
      .notNull()
      .references(() => usersTable.uid, { onDelete: "cascade" }),
    toUserId: integer("to_user_id")
      .notNull()
      .references(() => usersTable.uid, { onDelete: "cascade" }),
    text: text("text").notNull(),
    kind: text("kind").notNull().default("text"),
    mediaPackId: integer("media_pack_id"),
    mediaObjectPath: text("media_object_path"),
    mediaContentType: text("media_content_type"),
    mediaWidth: integer("media_width"),
    mediaHeight: integer("media_height"),
    mediaDurationMs: integer("media_duration_ms"),
    mediaPrice: integer("media_price"),
    privateStreamInvitationId: integer("private_stream_invitation_id").references(
      () => privateStreamInvitationsTable.id,
      { onDelete: "cascade" },
    ),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    readAt: timestamp("read_at"),
    replyToMessageId: integer("reply_to_message_id").references((): AnyPgColumn => directMessagesTable.id, { onDelete: "set null" }),
  },
  (table) => [
    index("direct_messages_sender_idx").on(table.fromUserId, table.createdAt),
    index("direct_messages_recipient_idx").on(table.toUserId, table.createdAt),
    uniqueIndex("direct_messages_idempotency_key_idx").on(table.idempotencyKey),
    uniqueIndex("direct_messages_private_stream_invitation_idx").on(table.privateStreamInvitationId),
    check("direct_messages_media_price_nonnegative", sql`${table.mediaPrice} is null or ${table.mediaPrice} >= 0`),
  ],
);

export const directMediaPurchasesTable = pgTable(
  "direct_media_purchases",
  {
    id: serial("id").primaryKey(),
    messageId: integer("message_id").notNull().references(() => directMessagesTable.id, { onDelete: "cascade" }),
    buyerUserId: integer("buyer_user_id").notNull().references(() => usersTable.uid, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("direct_media_purchases_message_buyer_idx").on(table.messageId, table.buyerUserId),
    uniqueIndex("direct_media_purchases_idempotency_key_idx").on(table.idempotencyKey),
  ],
);

export type DirectMessage = typeof directMessagesTable.$inferSelect;
export type DirectMediaPurchase = typeof directMediaPurchasesTable.$inferSelect;