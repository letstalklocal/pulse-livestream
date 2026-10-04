BEGIN;
-- Account-scoped catalog, independent of wallets and future payout accounting.
CREATE TABLE IF NOT EXISTS payout_catalog_providers (
  id text PRIMARY KEY,
  name text NOT NULL,
  account_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(name, account_key)
);
CREATE TABLE IF NOT EXISTS payout_catalog_countries (
  id text PRIMARY KEY,
  provider_id text NOT NULL REFERENCES payout_catalog_providers(id),
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  name text NOT NULL,
  availability text NOT NULL CHECK (availability IN ('available','unavailable','quote_error','unverified')),
  enabled boolean NOT NULL DEFAULT true,
  last_verified_at timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id, country_code),
  UNIQUE(id, provider_id)
);
CREATE TABLE IF NOT EXISTS payout_catalog_methods (
  id text PRIMARY KEY,
  country_id text NOT NULL REFERENCES payout_catalog_countries(id),
  code text NOT NULL,
  name text NOT NULL,
  receive_currency text NOT NULL CHECK (receive_currency ~ '^[A-Z]{3}$'),
  availability text NOT NULL CHECK (availability IN ('available','unavailable','quote_error','unverified')),
  enabled boolean NOT NULL DEFAULT true,
  last_verified_at timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(country_id, code, receive_currency),
  UNIQUE(id, country_id)
);
-- Observations are immutable; a new quote is a new row. No fabricated global fee tiers.
CREATE TABLE IF NOT EXISTS payout_catalog_observations (
  id text PRIMARY KEY,
  provider_id text NOT NULL REFERENCES payout_catalog_providers(id),
  country_id text NOT NULL REFERENCES payout_catalog_countries(id),
  method_id text REFERENCES payout_catalog_methods(id),
  source text NOT NULL CHECK (source = 'signed_in_remitly_business'),
  observed_at timestamptz NOT NULL,
  availability text NOT NULL CHECK (availability IN ('available','unavailable','quote_error','unverified')),
  payload jsonb NOT NULL,
  fingerprint text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(country_id, provider_id) REFERENCES payout_catalog_countries(id, provider_id),
  FOREIGN KEY(method_id, country_id) REFERENCES payout_catalog_methods(id, country_id)
);
CREATE INDEX IF NOT EXISTS payout_catalog_observations_route_idx ON payout_catalog_observations(method_id, observed_at DESC, id);
CREATE TABLE IF NOT EXISTS payout_catalog_events (
  id bigserial PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  target text NOT NULL,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
