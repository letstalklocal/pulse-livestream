-- Additive foundation for future four-host Party lives. Existing Parties keep
-- both optional channel fields null and retain their current two-host behavior.
ALTER TABLE live_parties
  ADD COLUMN IF NOT EXISTS fourth_channel_id text
  REFERENCES live_stream_sessions(channel_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS live_parties_fourth_idx
  ON live_parties(fourth_channel_id);

ALTER TABLE live_parties
  DROP CONSTRAINT IF EXISTS live_parties_fourth_channel_distinct;

ALTER TABLE live_parties
  ADD CONSTRAINT live_parties_fourth_channel_distinct CHECK (
    fourth_channel_id IS NULL
    OR (
      fourth_channel_id <> first_channel_id
      AND fourth_channel_id <> second_channel_id
      AND (third_channel_id IS NULL OR fourth_channel_id <> third_channel_id)
    )
  );
