BEGIN;
-- Retain existing Remitly history while allowing observations for admin-created providers.
ALTER TABLE payout_catalog_observations DROP CONSTRAINT IF EXISTS payout_catalog_observations_source_check;
ALTER TABLE payout_catalog_observations ADD CONSTRAINT payout_catalog_observations_source_check CHECK (source IN ('signed_in_remitly_business','signed_in_provider'));
COMMIT;
