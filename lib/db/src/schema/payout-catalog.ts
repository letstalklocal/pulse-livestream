import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  bigserial,
  uniqueIndex,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";

const version = () => ({
  revision: integer("revision").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const payoutCatalogProvidersTable = pgTable(
  "payout_catalog_providers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    accountKey: text("account_key").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    ...version(),
  },
  (t) => [
    uniqueIndex("payout_catalog_providers_name_account_key_key").on(
      t.name,
      t.accountKey,
    ),
  ],
);
export const payoutCatalogCountriesTable = pgTable(
  "payout_catalog_countries",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => payoutCatalogProvidersTable.id),
    countryCode: text("country_code").notNull(),
    name: text("name").notNull(),
    availability: text("availability").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastVerifiedAt: timestamp("last_verified_at", {
      withTimezone: true,
    }).notNull(),
    ...version(),
  },
  (t) => [
    uniqueIndex("payout_catalog_countries_provider_id_country_code_key").on(
      t.providerId,
      t.countryCode,
    ),
    uniqueIndex("payout_catalog_countries_id_provider_id_key").on(
      t.id,
      t.providerId,
    ),
  ],
);
export const payoutCatalogMethodsTable = pgTable(
  "payout_catalog_methods",
  {
    id: text("id").primaryKey(),
    countryId: text("country_id")
      .notNull()
      .references(() => payoutCatalogCountriesTable.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    receiveCurrency: text("receive_currency").notNull(),
    availability: text("availability").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastVerifiedAt: timestamp("last_verified_at", {
      withTimezone: true,
    }).notNull(),
    defaultFeeCents: integer("default_fee_cents"),
    defaultFundingMethod: text("default_funding_method"),
    ...version(),
  },
  (t) => [
    uniqueIndex(
      "payout_catalog_methods_country_id_code_receive_currency_key",
    ).on(t.countryId, t.code, t.receiveCurrency),
    uniqueIndex("payout_catalog_methods_id_country_id_key").on(
      t.id,
      t.countryId,
    ),
  ],
);
export const payoutCatalogObservationsTable = pgTable(
  "payout_catalog_observations",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => payoutCatalogProvidersTable.id),
    countryId: text("country_id")
      .notNull()
      .references(() => payoutCatalogCountriesTable.id),
    methodId: text("method_id").references(() => payoutCatalogMethodsTable.id),
    source: text("source").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    availability: text("availability").notNull(),
    payload: jsonb("payload").notNull(),
    fingerprint: text("fingerprint").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("payout_catalog_observations_route_idx").on(
      t.methodId,
      t.observedAt,
      t.id,
    ),
    foreignKey({
      columns: [t.countryId, t.providerId],
      foreignColumns: [
        payoutCatalogCountriesTable.id,
        payoutCatalogCountriesTable.providerId,
      ],
    }),
    foreignKey({
      columns: [t.methodId, t.countryId],
      foreignColumns: [
        payoutCatalogMethodsTable.id,
        payoutCatalogMethodsTable.countryId,
      ],
    }),
  ],
);
export const payoutCatalogEventsTable = pgTable("payout_catalog_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  beforeValue: jsonb("before_value"),
  afterValue: jsonb("after_value"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
