-- 202615200700_factor_cash_reserve_rate.sql
-- ROUND 321 item 4 (Lead; owner enters the values): the factor setup carries BOTH reserve rates the factor applies --
-- reserve_rate (escrow reserve, existing) and cash_reserve_rate (Faro "Cash Rsv", new). Read by the Submit to Factor
-- candidates endpoint and the purchase engine for the expected split; Faro's actuals still override per invoice.
-- Default 0: the executed Faro agreement defines ONE 1.5% Security Reserve (CPA ANSWERS.docx), carried as escrow on 83 of
-- 89 purchases and as cash on 6 -- so a cash rate is the owner's setting, never inferred. Additive.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE factoring.factor ADD COLUMN IF NOT EXISTS cash_reserve_rate numeric(7,6) NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factor_cash_reserve_rate_range' AND conrelid = 'factoring.factor'::regclass) THEN
    ALTER TABLE factoring.factor ADD CONSTRAINT factor_cash_reserve_rate_range CHECK (cash_reserve_rate >= 0 AND cash_reserve_rate <= 1);
  END IF;
END $$;
COMMENT ON COLUMN factoring.factor.cash_reserve_rate IS 'Factor cash reserve rate (Faro "Cash Rsv"), 0..1; escrow reserve is reserve_rate.';
COMMIT;
