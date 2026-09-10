CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(uid),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cancelled', 'rejected', 'completed')),
  reason text NOT NULL DEFAULT '',
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  review_notes text NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_pending_user_idx ON account_deletion_requests(user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS account_deletion_requests_status_date_idx ON account_deletion_requests(status, requested_at);
