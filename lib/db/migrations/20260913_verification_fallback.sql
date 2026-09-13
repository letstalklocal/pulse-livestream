BEGIN;
ALTER TABLE identity_verifications
 ADD COLUMN IF NOT EXISTS id_fallback_required boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS selfie_session_id text;
ALTER TABLE identity_verifications DROP CONSTRAINT IF EXISTS identity_verifications_status_check;
ALTER TABLE identity_verifications ADD CONSTRAINT identity_verifications_status_check
 CHECK (status IN ('not_started','pending','id_required','verified','failed','review_needed'));
COMMIT;
