import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * The invitation is the durable access-control record for a private stream.
 * `channelId` is deliberately generated and stored by the server rather than
 * derived from either client so it can be checked before issuing an RTC token.
 */
export const privateStreamInvitationsTable = pgTable(
  "private_stream_invitations",
  {
    id: serial("id").primaryKey(),
    streamerUserId: integer("streamer_user_id")
      .notNull()
      .references(() => usersTable.uid, { onDelete: "cascade" }),
    invitedUserId: integer("invited_user_id")
      .notNull()
      .references(() => usersTable.uid, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    title: text("title").notNull(),
    backgroundObjectPath: text("background_object_path").notNull(),
    status: text("status").notNull().default("pending"),
    requiredGiftId: text("required_gift_id"),
    requiredGiftName: text("required_gift_name"),
    requiredGiftAmount: integer("required_gift_amount").notNull().default(0),
    paymentStatus: text("payment_status").notNull().default("free"),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    paidAt: timestamp("paid_at"),
    refundedAt: timestamp("refunded_at"),
    declinedAt: timestamp("declined_at"),
    cancelledAt: timestamp("cancelled_at"),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("private_stream_invitations_channel_id_idx").on(table.channelId),
    index("private_stream_invitations_streamer_idx").on(table.streamerUserId, table.createdAt),
    index("private_stream_invitations_invited_idx").on(table.invitedUserId, table.createdAt),
    index("private_stream_invitations_status_expiry_idx").on(table.status, table.expiresAt),
    check(
      "private_stream_invitations_different_users",
      sql`${table.streamerUserId} <> ${table.invitedUserId}`,
    ),
    check(
      "private_stream_invitations_status_valid",
      sql`${table.status} in ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'active', 'ended')`,
    ),
    check(
      "private_stream_invitations_payment_valid",
      sql`${table.paymentStatus} in ('free', 'pending', 'paid', 'settled', 'refunded')
        and ${table.requiredGiftAmount} >= 0
        and ((${table.requiredGiftAmount} = 0 and ${table.requiredGiftId} is null and ${table.requiredGiftName} is null)
          or (${table.requiredGiftAmount} > 0 and ${table.requiredGiftId} is not null and ${table.requiredGiftName} is not null))`,
    ),
  ],
);

export type PrivateStreamInvitation = typeof privateStreamInvitationsTable.$inferSelect;