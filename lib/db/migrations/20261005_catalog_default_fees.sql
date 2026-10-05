BEGIN;
ALTER TABLE payout_catalog_methods ADD COLUMN IF NOT EXISTS default_fee_cents integer;
ALTER TABLE payout_catalog_methods ADD COLUMN IF NOT EXISTS default_funding_method text;
ALTER TABLE payout_catalog_methods DROP CONSTRAINT IF EXISTS payout_catalog_methods_default_fee_check;
ALTER TABLE payout_catalog_methods ADD CONSTRAINT payout_catalog_methods_default_fee_check CHECK ((default_fee_cents IS NULL AND default_funding_method IS NULL) OR (default_fee_cents IS NOT NULL AND default_funding_method IS NOT NULL AND default_fee_cents BETWEEN 0 AND 100000000 AND default_funding_method IN ('debit_card','credit_card','bank_account')));
-- User-requested removal of redundant $500 catalog samples. Payment records are separate.
WITH removed AS (
 DELETE FROM payout_catalog_observations WHERE payload->>'sendAmountCents' = '50000' RETURNING provider_id
)
INSERT INTO payout_catalog_events(actor,action,target,after_value)
SELECT 'catalog_migration','retire_500_fee_samples',provider_id,jsonb_build_object('deletedObservations',count(*)) FROM removed GROUP BY provider_id;
-- Initialize the reference defaults from existing positive $15 samples only.
-- Zero samples remain unset; promotions must not silently become the standard fee.
WITH latest AS (
 SELECT DISTINCT ON (method_id) method_id,(payload->>'feeCents')::integer fee_cents,payload->>'fundingMethod' funding_method
 FROM payout_catalog_observations WHERE method_id IS NOT NULL AND payload->>'sendAmountCents'='1500' AND source='signed_in_remitly_business'
 ORDER BY method_id,observed_at DESC,id DESC
), initialized AS (
 UPDATE payout_catalog_methods m SET default_fee_cents=l.fee_cents,default_funding_method=l.funding_method,revision=m.revision+1,updated_at=now()
 FROM latest l WHERE m.id=l.method_id AND m.default_fee_cents IS NULL AND l.fee_cents>0
 RETURNING m.id,m.default_fee_cents,m.default_funding_method
)
INSERT INTO payout_catalog_events(actor,action,target,after_value)
SELECT 'catalog_migration','default_fee_initialization',id,jsonb_build_object('feeCents',default_fee_cents,'fundingMethod',default_funding_method,'referenceSendAmountCents',1500) FROM initialized;
COMMIT;
