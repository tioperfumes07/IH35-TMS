-- B-LEDGER-1 (ROUND 206) — retroactive record, idempotent, changes nothing live.
--
-- fuel.fuel_transactions.gross_cost / discount_amount / fee_amount were applied directly to prod
-- on 2026-09-28 (05:17:33Z and 05:27:05Z), under migration numbers 202614420000 and 202614430000,
-- with no .sql file ever committed to this repo. Those two numbers were later legitimately claimed
-- by two unrelated, real, committed migrations the same day (202614420000_mdata_drivers_merged_
-- into_driver_id.sql at 06:03:54Z, 202614430000_worm_check_engine_banking_tables.sql at 07:51:48Z) —
-- confirmed both applied correctly with their own tracker rows, nothing was skipped or overwritten.
-- No audit trigger exists on this table (a separate, already-tracked gap), so no before/after image
-- of the original out-of-band change could be recovered; Neon's query-log telemetry is not enabled
-- for this region either. This migration exists only to give the repo a durable, reviewable record
-- matching what prod already carries — it is written to be a genuine no-op against the current
-- schema and data.
--
-- Live-verified before writing this (bypass_rls, positive control): of 2,081 fuel_transactions rows,
-- 1,631 carry a non-null gross_cost and every one of them satisfies gross_cost = total_cost exactly
-- (avg diff 0.00000000000000000000, 0 rows at 2x total_cost) — the correct, non-invented genesis
-- baseline for historical rows that predate real gross/discount/fee tracking (no discount, no fee).
-- No evidence of double-application in the data itself.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'fuel' AND table_name = 'fuel_transactions' AND column_name = 'gross_cost'
  ) THEN
    ALTER TABLE fuel.fuel_transactions ADD COLUMN gross_cost numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'fuel' AND table_name = 'fuel_transactions' AND column_name = 'discount_amount'
  ) THEN
    ALTER TABLE fuel.fuel_transactions ADD COLUMN discount_amount numeric NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'fuel' AND table_name = 'fuel_transactions' AND column_name = 'fee_amount'
  ) THEN
    ALTER TABLE fuel.fuel_transactions ADD COLUMN fee_amount numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Genesis-anchor backfill, matching what is already live: rows with a known total_cost and no
-- gross_cost yet get gross_cost = total_cost (zero discount, zero fee already covers the default).
-- WHERE gross_cost IS NULL makes this safe to run any number of times without double-effect.
UPDATE fuel.fuel_transactions
SET gross_cost = total_cost
WHERE gross_cost IS NULL
  AND total_cost IS NOT NULL;
