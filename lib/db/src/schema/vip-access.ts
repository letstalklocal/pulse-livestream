import { pgTable, integer, text, boolean, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { usersTable } from './users';
export const vipStoreAccessTable = pgTable('vip_store_access', {
  userId: integer('user_id').notNull().references(() => usersTable.uid),
  environment: text('environment').notNull(),
  active: boolean('active').notNull().default(false),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.userId, table.environment] })]);
