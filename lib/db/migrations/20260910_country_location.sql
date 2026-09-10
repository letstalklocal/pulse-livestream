ALTER TABLE users ADD COLUMN IF NOT EXISTS country_code text CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');
