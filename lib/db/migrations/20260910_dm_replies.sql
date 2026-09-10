ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS reply_to_message_id integer REFERENCES direct_messages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS direct_messages_reply_idx ON direct_messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;
