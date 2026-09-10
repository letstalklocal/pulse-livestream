CREATE TABLE IF NOT EXISTS privacy_preferences (
 user_id integer PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
 hide_location boolean NOT NULL DEFAULT false,
 party_invites text NOT NULL DEFAULT 'everyone' CHECK (party_invites IN ('everyone','friends')),
 posts_visibility text NOT NULL DEFAULT 'everyone' CHECK (posts_visibility IN ('everyone','friends')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
