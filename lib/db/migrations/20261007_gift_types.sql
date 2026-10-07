-- Nullable for immutable historical revisions; their existing assets determine the type.
ALTER TABLE gift_revisions ADD COLUMN IF NOT EXISTS gift_type text
  CHECK (gift_type IN ('image', 'animation'));
