CREATE TABLE IF NOT EXISTS message_preferences (
 user_id integer PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
 last_seen_online boolean NOT NULL DEFAULT true,
 read_receipts boolean NOT NULL DEFAULT true,
 gift_to_open_chat boolean NOT NULL DEFAULT true,
 required_gift_id text NOT NULL DEFAULT 'rose' CHECK(required_gift_id = 'rose'),
 last_active_at timestamptz
);
