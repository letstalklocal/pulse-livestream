CREATE TABLE IF NOT EXISTS user_blocks (
 blocker_user_id INTEGER NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
 blocked_user_id INTEGER NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(blocker_user_id, blocked_user_id)
);
CREATE TABLE IF NOT EXISTS user_reports (
 id SERIAL PRIMARY KEY,
 reporter_user_id INTEGER REFERENCES users(uid) ON DELETE SET NULL,
 reported_user_id INTEGER REFERENCES users(uid) ON DELETE SET NULL,
 reported_uid INTEGER NOT NULL,
 message_id INTEGER REFERENCES direct_messages(id) ON DELETE SET NULL,
 reference TEXT NOT NULL,
 source TEXT NOT NULL,
 reason TEXT NOT NULL,
 details TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_reports_identity_idx ON user_reports(reporter_user_id, reported_uid, reference);
