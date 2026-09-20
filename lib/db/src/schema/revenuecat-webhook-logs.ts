import { pgTable, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
export const revenuecatWebhookLogsTable = pgTable('revenuecat_webhook_logs', {
  id: text('id').primaryKey(),
  eventId: text('event_id'), eventType: text('event_type').notNull(),
  appId: text('app_id'), environment: text('environment'), productId: text('product_id'),
  customerRef: text('customer_ref'), eventAt: timestamp('event_at', { withTimezone: true }),
  eventExpiresAt: timestamp('event_expires_at', { withTimezone: true }),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  outcome: text('outcome').notNull().default('received'), httpStatus: integer('http_status'), reason: text('reason'),
  vipChanges: jsonb('vip_changes').notNull().default([]),
}, table => [index('rc_webhook_logs_received_idx').on(table.receivedAt), index('rc_webhook_logs_event_idx').on(table.eventId), index('rc_webhook_logs_customer_idx').on(table.customerRef, table.receivedAt)]);
