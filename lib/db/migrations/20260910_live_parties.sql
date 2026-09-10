CREATE TABLE IF NOT EXISTS live_parties (
  id text PRIMARY KEY,
  first_channel_id text NOT NULL REFERENCES live_stream_sessions(channel_id) ON DELETE CASCADE,
  second_channel_id text NOT NULL REFERENCES live_stream_sessions(channel_id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending','active','ended','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  first_ready_at timestamptz,
  second_ready_at timestamptz,
  CHECK (first_channel_id <> second_channel_id)
);
CREATE INDEX IF NOT EXISTS live_parties_first_idx ON live_parties(first_channel_id);
CREATE INDEX IF NOT EXISTS live_parties_second_idx ON live_parties(second_channel_id);
CREATE TABLE IF NOT EXISTS live_battles (
  id text PRIMARY KEY,
  party_id text NOT NULL REFERENCES live_parties(id) ON DELETE CASCADE,
  requester_uid integer NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','active','finished','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  first_score integer NOT NULL DEFAULT 0,
  second_score integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS live_battles_party_idx ON live_battles(party_id);
ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS battle_id text REFERENCES live_battles(id);
