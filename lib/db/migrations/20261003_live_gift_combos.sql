ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS gift_combo_id text;
ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS gift_combo_count integer;
ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS gift_combo_total_coins integer;
ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS gift_combo_closed_at timestamp;
CREATE INDEX IF NOT EXISTS coin_transactions_live_combo_idx ON coin_transactions(from_user_id,channel_id,to_user_id,created_at,id);
CREATE TABLE IF NOT EXISTS live_gift_combo_milestones (
  combo_id text NOT NULL,
  count integer NOT NULL CHECK(count IN (5,10)),
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY(combo_id,count)
);
