CREATE TABLE IF NOT EXISTS stream_moderation (
 session_id integer NOT NULL REFERENCES live_stream_sessions(id) ON DELETE CASCADE,
 viewer_user_id integer NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
 muted boolean NOT NULL DEFAULT false, removed boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(session_id, viewer_user_id)
);
CREATE TABLE IF NOT EXISTS creator_blocks (
 host_user_id integer NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
 viewer_user_id integer NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(host_user_id, viewer_user_id)
);
CREATE TABLE IF NOT EXISTS stream_reports (
 id serial PRIMARY KEY, session_id integer NOT NULL REFERENCES live_stream_sessions(id),
 reporter_user_id integer NOT NULL REFERENCES users(uid), reason text NOT NULL,
 details text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS stream_reports_session_reporter_idx ON stream_reports(session_id, reporter_user_id);
