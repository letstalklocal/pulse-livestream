import { boolean, integer, pgTable, serial, uniqueIndex } from "drizzle-orm/pg-core";
import { liveStreamSessionsTable } from "./live-stream-sessions";
import { usersTable } from "./users";
export const premiumIdentitiesTable = pgTable("premium_identities", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => liveStreamSessionsTable.id, { onDelete: "cascade" }),
  viewerUserId: integer("viewer_user_id").notNull().references(() => usersTable.uid, { onDelete: "cascade" }),
  incognito: boolean("incognito").notNull(),
  aliasNumber: integer("alias_number"),
}, table => [uniqueIndex("premium_identity_viewer_unique").on(table.sessionId, table.viewerUserId), uniqueIndex("premium_identity_alias_unique").on(table.sessionId, table.aliasNumber)]);
