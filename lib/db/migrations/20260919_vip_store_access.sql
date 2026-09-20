CREATE TABLE IF NOT EXISTS vip_store_access (
  user_id integer NOT NULL REFERENCES users(uid),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'production')),
  active boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, environment)
);
