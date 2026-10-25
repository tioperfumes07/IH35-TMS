-- 202616251000 — 443.346 follow-up: per-advance gap account for bank_wire_cents shortfall
-- When Faro wires less than the full net advance to BofA, the gap goes to one of two accounts:
--   • NULL (default): folds into factor_reserve_held (1230) — Faro kept the money as CCG reserve
--   • 8000 Inter-company: Faro ran an internal transfer to IH35 Reserves, not USMCA's reserve ledger
-- The engine reads this column at post-time; NULL = existing behaviour (gap → 1230).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'accounting'
       AND table_name   = 'factoring_advances'
       AND column_name  = 'bank_wire_gap_account_id'
  ) THEN
    ALTER TABLE accounting.factoring_advances
      ADD COLUMN bank_wire_gap_account_id uuid NULL
        REFERENCES catalogs.accounts(id);
  END IF;
END $$;
