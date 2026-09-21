-- Align legacy asking prices with the selected gift. Historical payments are unchanged.
UPDATE media_packs
SET coin_price = CASE gift_id
  WHEN 'rose' THEN 1 WHEN 'heart' THEN 5 WHEN 'party' THEN 10
  WHEN 'diamond' THEN 50 WHEN 'rocket' THEN 100 WHEN 'crown' THEN 500
END
WHERE gift_id IN ('rose', 'heart', 'party', 'diamond', 'rocket', 'crown');
