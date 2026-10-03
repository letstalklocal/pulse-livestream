CREATE TABLE IF NOT EXISTS dm_gift_combos (
  id text PRIMARY KEY,
  sender_id integer NOT NULL REFERENCES users(uid),
  recipient_id integer NOT NULL REFERENCES users(uid),
  gift_id text NOT NULL,
  count integer NOT NULL CHECK (count > 0),
  total_coins integer NOT NULL CHECK (total_coins > 0),
  last_paid_at timestamp NOT NULL,
  closed_at timestamp,
  message_id integer NOT NULL REFERENCES direct_messages(id)
);
CREATE INDEX IF NOT EXISTS dm_gift_combos_pair_idx ON dm_gift_combos(sender_id, recipient_id, last_paid_at);
CREATE TABLE IF NOT EXISTS dm_gift_combo_payments (
  idempotency_key text PRIMARY KEY,
  combo_id text NOT NULL REFERENCES dm_gift_combos(id),
  transaction_id integer NOT NULL REFERENCES coin_transactions(id),
  count integer NOT NULL CHECK (count > 0)
);
CREATE TABLE IF NOT EXISTS dm_gift_combo_milestones (
  combo_id text NOT NULL REFERENCES dm_gift_combos(id),
  count integer NOT NULL CHECK (count IN (5,10)),
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY(combo_id,count)
);
