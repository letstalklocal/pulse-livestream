CREATE TABLE IF NOT EXISTS notification_preferences (
 user_id integer PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
 preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);
