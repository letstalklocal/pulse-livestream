-- Approved: first withdrawal exactly $15; later withdrawals $25–$500 gross.
ALTER TABLE creator_withdrawals DROP CONSTRAINT IF EXISTS creator_withdrawals_gross_cents_check;
ALTER TABLE creator_withdrawals ADD CONSTRAINT creator_withdrawals_gross_cents_check CHECK(gross_cents=1500 OR gross_cents BETWEEN 2500 AND 50000);
ALTER TABLE creator_cash_accounts ALTER COLUMN repeat_allowed SET DEFAULT true;
UPDATE creator_cash_accounts SET repeat_allowed=true;
