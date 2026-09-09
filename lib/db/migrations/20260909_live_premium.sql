-- Additive migration: existing streams and paid admissions remain valid.
ALTER TABLE live_stream_sessions ADD COLUMN IF NOT EXISTS rtc_channel_name text;
ALTER TABLE live_stream_sessions ADD COLUMN IF NOT EXISTS premium_free_viewer_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
