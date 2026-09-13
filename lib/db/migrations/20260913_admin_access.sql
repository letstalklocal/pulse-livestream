BEGIN;
CREATE TABLE IF NOT EXISTS admin_staff (
  clerk_user_id text PRIMARY KEY,
  role text NOT NULL CHECK (role = 'owner'),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_audit_events (
  id bigserial PRIMARY KEY,
  actor_clerk_id text NOT NULL,
  action text NOT NULL,
  target text,
  outcome text NOT NULL CHECK (outcome IN ('allowed','denied')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_events(created_at);
COMMIT;
