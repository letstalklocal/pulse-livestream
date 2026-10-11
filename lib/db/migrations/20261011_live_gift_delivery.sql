-- Global delivery policy only. No wallet, ledger, gift price or receipt changes.
CREATE TABLE IF NOT EXISTS live_gift_delivery_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
INSERT INTO live_gift_delivery_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
