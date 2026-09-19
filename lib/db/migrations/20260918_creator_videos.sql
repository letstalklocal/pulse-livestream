CREATE TABLE IF NOT EXISTS creator_videos (
 id uuid PRIMARY KEY,
 owner_user_id integer NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
 bunny_id text NOT NULL UNIQUE,
 filename text NOT NULL,
 status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','processing','ready','failed')),
 playback_url text,
 thumbnail_url text,
 duration_seconds integer,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_videos_owner_idx ON creator_videos(owner_user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS creator_video_settings (
 owner_user_id integer PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
 selected_video_id uuid REFERENCES creator_videos(id) ON DELETE SET NULL,
 enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS creator_video_views (
 id uuid PRIMARY KEY,
 video_id uuid NOT NULL REFERENCES creator_videos(id) ON DELETE CASCADE,
 viewer_user_id integer NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
 watched_seconds integer NOT NULL DEFAULT 0 CHECK(watched_seconds >= 0),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_video_views_video_idx ON creator_video_views(video_id,last_seen_at);
CREATE TABLE IF NOT EXISTS creator_video_gifts (
 transaction_id integer PRIMARY KEY REFERENCES coin_transactions(id) ON DELETE CASCADE,
 video_id uuid NOT NULL REFERENCES creator_videos(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS creator_video_gifts_video_idx ON creator_video_gifts(video_id);
CREATE TABLE IF NOT EXISTS creator_video_chat (
 id bigserial PRIMARY KEY,
 video_id uuid NOT NULL REFERENCES creator_videos(id) ON DELETE CASCADE,
 sender_user_id integer NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
 client_id uuid NOT NULL UNIQUE,
 message text NOT NULL CHECK(length(message) BETWEEN 1 AND 500),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_video_chat_video_idx ON creator_video_chat(video_id,id DESC);

-- Reapplicable while developing against an existing feature migration.
ALTER TABLE creator_video_settings DROP CONSTRAINT IF EXISTS creator_video_settings_selected_video_id_fkey;
ALTER TABLE creator_video_settings ADD CONSTRAINT creator_video_settings_selected_video_id_fkey FOREIGN KEY(selected_video_id) REFERENCES creator_videos(id) ON DELETE SET NULL;
ALTER TABLE creator_video_views DROP CONSTRAINT IF EXISTS creator_video_views_video_id_fkey;
ALTER TABLE creator_video_views ADD CONSTRAINT creator_video_views_video_id_fkey FOREIGN KEY(video_id) REFERENCES creator_videos(id) ON DELETE CASCADE;
ALTER TABLE creator_video_gifts DROP CONSTRAINT IF EXISTS creator_video_gifts_video_id_fkey;
ALTER TABLE creator_video_gifts ADD CONSTRAINT creator_video_gifts_video_id_fkey FOREIGN KEY(video_id) REFERENCES creator_videos(id) ON DELETE CASCADE;
ALTER TABLE creator_video_chat DROP CONSTRAINT IF EXISTS creator_video_chat_video_id_fkey;
ALTER TABLE creator_video_chat ADD CONSTRAINT creator_video_chat_video_id_fkey FOREIGN KEY(video_id) REFERENCES creator_videos(id) ON DELETE CASCADE;

ALTER TABLE creator_video_settings ADD COLUMN IF NOT EXISTS pending_video_id uuid REFERENCES creator_videos(id) ON DELETE SET NULL;
