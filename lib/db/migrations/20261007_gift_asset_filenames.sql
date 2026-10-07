-- Metadata for new uploads. Existing immutable asset rows are not rewritten.
ALTER TABLE gift_assets ADD COLUMN IF NOT EXISTS original_filename text
 CHECK (original_filename IS NULL OR char_length(original_filename) BETWEEN 1 AND 255);
