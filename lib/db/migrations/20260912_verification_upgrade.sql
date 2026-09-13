BEGIN;
ALTER TABLE identity_verifications
 ADD COLUMN IF NOT EXISTS upgrade_status text NOT NULL DEFAULT 'not_started'
 CHECK (upgrade_status IN ('not_started','pending','review_needed','verified','failed')),
 ADD COLUMN IF NOT EXISTS upgrade_session_id text UNIQUE,
 ADD COLUMN IF NOT EXISTS upgrade_session_url text,
 ADD COLUMN IF NOT EXISTS upgrade_workflow_id text,
 ADD COLUMN IF NOT EXISTS upgrade_consent_at timestamptz,
 ADD COLUMN IF NOT EXISTS upgrade_consent_version text,
 ADD COLUMN IF NOT EXISTS upgrade_checked_at timestamptz,
 ADD COLUMN IF NOT EXISTS upgrade_verified_at timestamptz;
COMMIT;
