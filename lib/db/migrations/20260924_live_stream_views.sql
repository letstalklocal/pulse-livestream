ALTER TABLE live_stream_sessions ADD COLUMN IF NOT EXISTS total_viewers integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS live_stream_viewers (
  id serial PRIMARY KEY,
  session_id integer NOT NULL REFERENCES live_stream_sessions(id) ON DELETE CASCADE,
  viewer_user_id integer NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS live_stream_viewers_session_user_unique
  ON live_stream_viewers(session_id, viewer_user_id);
