ALTER TABLE user_blocks ADD COLUMN IF NOT EXISTS incognito_identity_id integer;
ALTER TABLE user_blocks ADD COLUMN IF NOT EXISTS incognito_alias text;
