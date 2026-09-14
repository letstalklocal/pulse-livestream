CREATE TABLE IF NOT EXISTS premium_gift_requests (
  id text PRIMARY KEY,
  session_id integer NOT NULL REFERENCES live_stream_sessions(id),
  gift_id text NOT NULL,
  gift_name text NOT NULL,
  gift_emoji text NOT NULL,
  coin_cost integer NOT NULL CHECK (coin_cost > 0),
  duration_seconds integer NOT NULL CHECK (duration_seconds IN (30, 60)),
  created_at timestamptz NOT NULL DEFAULT now(),
  deadline timestamptz NOT NULL,
  settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS premium_gift_requests_session_idx ON premium_gift_requests(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS premium_gift_requests_active_idx ON premium_gift_requests(session_id) WHERE settled_at IS NULL;
CREATE TABLE IF NOT EXISTS premium_gift_viewers (
  request_id text NOT NULL REFERENCES premium_gift_requests(id),
  viewer_user_id integer NOT NULL REFERENCES users(uid),
  transaction_id integer REFERENCES coin_transactions(id),
  paid_at timestamptz,
  waived_at timestamptz,
  PRIMARY KEY(request_id, viewer_user_id)
);
CREATE INDEX IF NOT EXISTS premium_gift_viewers_user_idx ON premium_gift_viewers(viewer_user_id);
CREATE TABLE IF NOT EXISTS live_viewer_bans (
  id text PRIMARY KEY,
  session_id integer NOT NULL REFERENCES live_stream_sessions(id),
  viewer_user_id integer NOT NULL REFERENCES users(uid),
  rtc_channel_name text NOT NULL,
  rule_id integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS live_viewer_bans_session_user_idx ON live_viewer_bans(session_id, viewer_user_id);
