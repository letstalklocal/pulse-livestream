-- Schema only. A completion row is written only by the successful catalog import.
-- Replit compares live development and production schemas during publication.
CREATE TABLE IF NOT EXISTS gift_catalog_data_migrations (
  id text PRIMARY KEY,
  snapshot_sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  previous_catalog jsonb NOT NULL
);
