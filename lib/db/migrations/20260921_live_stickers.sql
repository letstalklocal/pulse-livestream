ALTER TABLE live_stream_sessions ADD COLUMN IF NOT EXISTS stickers jsonb NOT NULL DEFAULT '[]'::jsonb;
