-- Additive catalog adoption: leave all legacy receipts/ledger rows unchanged.
BEGIN;
ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS gift_snapshot jsonb;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS gift_snapshot jsonb;
ALTER TABLE dm_gift_combos ADD COLUMN IF NOT EXISTS gift_revision_id text;
ALTER TABLE media_packs ADD COLUMN IF NOT EXISTS gift_snapshot jsonb;
COMMIT;
