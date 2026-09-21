ALTER TABLE live_stream_sessions ADD COLUMN IF NOT EXISTS allow_incognito boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS premium_identities (
 id serial PRIMARY KEY,
 session_id integer NOT NULL REFERENCES live_stream_sessions(id) ON DELETE CASCADE,
 viewer_user_id integer NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
 incognito boolean NOT NULL,
 alias_number integer,
 CONSTRAINT premium_identity_viewer_unique UNIQUE(session_id, viewer_user_id),
 CONSTRAINT premium_identity_alias_unique UNIQUE(session_id, alias_number)
);
