import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

// Production startup owns these records. Keep the table in the deployment
// schema so schema synchronization never removes the one-time import marker.
export const giftCatalogDataMigrationsTable = pgTable("gift_catalog_data_migrations", {
  id: text("id").primaryKey(),
  snapshotSha256: text("snapshot_sha256").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  previousCatalog: jsonb("previous_catalog").notNull(),
});
