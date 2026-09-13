BEGIN;
ALTER TABLE identity_verifications
 ADD COLUMN IF NOT EXISTS verification_type text
 CHECK (verification_type IN ('selfie', 'id'));
-- Before this migration, only documentary ID + liveness + face match could verify an account.
UPDATE identity_verifications SET verification_type = 'id'
 WHERE is_verified = true AND verification_type IS NULL;
COMMIT;
