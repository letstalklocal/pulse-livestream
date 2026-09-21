ALTER TABLE creator_videos ADD COLUMN IF NOT EXISTS stickers jsonb NOT NULL DEFAULT '[]'::jsonb;
