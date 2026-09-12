CREATE TABLE IF NOT EXISTS identity_verifications (
 user_id integer PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
 reference uuid NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'not_started',
 is_verified boolean NOT NULL DEFAULT false,
 environment text NOT NULL CHECK (environment IN ('sandbox', 'live')),
 session_id text UNIQUE,
 session_url text,
 workflow_id text,
 verified_at timestamptz,
 mature_content_enabled boolean NOT NULL DEFAULT false,
 preference_updated_at timestamptz,
 preference_version text,
 consent_at timestamptz,
 consent_version text,
 attempts integer NOT NULL DEFAULT 0,
 attempt_window_at timestamptz NOT NULL DEFAULT now(),
 checked_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (status IN ('not_started','pending','verified','failed','review_needed')),
 CHECK (is_verified = (status = 'verified')),
 CHECK (NOT mature_content_enabled OR is_verified)
);
CREATE TABLE IF NOT EXISTS verification_web_sessions (
 token_hash text PRIMARY KEY,
 user_id integer NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('handoff','browser')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS verification_web_sessions_user_idx ON verification_web_sessions(user_id);
CREATE INDEX IF NOT EXISTS verification_web_sessions_expiry_idx ON verification_web_sessions(expires_at);
