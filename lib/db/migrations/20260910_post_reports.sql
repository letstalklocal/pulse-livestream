CREATE TABLE IF NOT EXISTS post_reports (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  reported_post_id INTEGER NOT NULL,
  owner_user_id INTEGER REFERENCES users(uid) ON DELETE SET NULL,
  reporter_user_id INTEGER REFERENCES users(uid) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS post_reports_post_reporter_idx ON post_reports(reported_post_id, reporter_user_id);
CREATE INDEX IF NOT EXISTS post_reports_status_created_idx ON post_reports(status, created_at);
