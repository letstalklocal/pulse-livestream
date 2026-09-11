CREATE TABLE IF NOT EXISTS moments (
  id serial PRIMARY KEY,
  owner_user_id integer NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  gift_transaction_id integer NOT NULL UNIQUE REFERENCES coin_transactions(id) ON DELETE CASCADE,
  object_path text NOT NULL,
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'ready', 'deleted')),
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moments_owner_created_idx ON moments(owner_user_id, created_at DESC);
