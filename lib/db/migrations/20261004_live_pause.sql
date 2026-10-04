ALTER TABLE live_stream_sessions ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false;
