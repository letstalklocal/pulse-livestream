CREATE TABLE IF NOT EXISTS reaction_preferences (
  user_id integer PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
  emojis text[] NOT NULL CHECK (cardinality(emojis) = 8),
  updated_at timestamptz NOT NULL DEFAULT now()
);
