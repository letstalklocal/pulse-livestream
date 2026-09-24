-- Additive foundation for future three- and four-host Party lives. Existing
-- Parties remain two-host because this nullable field is not populated yet.
ALTER TABLE live_parties
  ADD COLUMN IF NOT EXISTS third_channel_id text
  REFERENCES live_stream_sessions(channel_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS live_parties_third_idx
  ON live_parties(third_channel_id);

ALTER TABLE live_parties
  DROP CONSTRAINT IF EXISTS live_parties_third_channel_distinct;

ALTER TABLE live_parties
  ADD CONSTRAINT live_parties_third_channel_distinct CHECK (
    third_channel_id IS NULL
    OR (third_channel_id <> first_channel_id AND third_channel_id <> second_channel_id)
  );
