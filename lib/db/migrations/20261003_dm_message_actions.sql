ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS edited_at timestamp;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS deleted_at timestamp;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS hidden_from_user_at timestamp;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS hidden_to_user_at timestamp;
