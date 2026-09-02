-- MILES SPEC FOR DISPATCH, FINAL (owner direct instruction, 2026-09-02) — the deadhead-pay half.
-- "DRIVER PAY = (miles_shortest x rate_loaded) + (miles_deadhead x rate_empty). Two lines on the
-- settlement, always... rate_empty is its own config value per driver. It equals rate_loaded
-- today. Do not hardcode the equality."
--
-- mdata.loads already carries miles_shortest / miles_practical / miles_deadhead (verified live
-- before writing this) — captured at booking, editable via Edit Load, but never consumed by
-- driver-pay calculation (resolveDriverBasePayCents only read miles_shortest). This migration adds
-- what pay calculation needs to also carry the empty-mile leg, as ITS OWN config value, not a
-- literal duplicate of the loaded rate:
--
--   driver_finance.driver_pay_rates.rate_empty_per_mile_cents -- nullable. NULL means "no distinct
--     empty rate is configured yet" and the resolver falls back to rate_per_mile_cents (the loaded
--     rate) AT RESOLVE TIME, in application code -- never by writing the loaded value into this
--     column. "Equals rate_loaded today" stays true as a live fallback, not a frozen copy that
--     silently goes stale the day the owner actually sets a distinct empty rate.
--
--   driver_finance.driver_bills gains the breakdown a single payable row needs to still report as
--     two settlement lines: miles_deadhead, rate_empty_per_mile_cents (the resolved rate actually
--     used, snapshotted at mint time -- an audit record, not a live join), loaded_pay_cents,
--     deadhead_pay_cents. gross_amount_cents remains loaded_pay_cents + deadhead_pay_cents + the
--     existing stop-bonus/tarp/lumper additions -- the one payable total per load is unchanged;
--     these are the breakdown that total is now traceable to.
--
--   driver_finance.settlement_lines' line_type check constraint gains 'deadhead_pay' (additive --
--     widens the allowed set, drops nothing) and its uniqueness on source_driver_bill_id widens
--     from "one line per bill" to "one line per (bill, line_type)" -- a bill can now carry BOTH an
--     'earnings' line (loaded miles) and a 'deadhead_pay' line (empty miles) for the same driver
--     bill, which the old single-column unique index would have silently dropped the second of.
--
-- Additive only where possible; the CHECK constraint and UNIQUE INDEX changes are DROP+ADD because
-- Postgres has no ALTER CHECK / ALTER INDEX, but both changes strictly WIDEN what's allowed --
-- every existing row remains valid under the new constraints, nothing is narrowed or lost.

BEGIN;

ALTER TABLE driver_finance.driver_pay_rates
  ADD COLUMN IF NOT EXISTS rate_empty_per_mile_cents bigint NULL;

COMMENT ON COLUMN driver_finance.driver_pay_rates.rate_empty_per_mile_cents IS
  'MILES SPEC (owner 2026-09-02) -- the empty/deadhead-mile rate, its own config value, distinct from rate_per_mile_cents (the loaded rate). NULL = not yet configured; the resolver falls back to rate_per_mile_cents live, never a stored duplicate.';

ALTER TABLE driver_finance.driver_bills
  ADD COLUMN IF NOT EXISTS miles_deadhead numeric NULL,
  ADD COLUMN IF NOT EXISTS rate_empty_per_mile_cents bigint NULL,
  ADD COLUMN IF NOT EXISTS loaded_pay_cents bigint NULL,
  ADD COLUMN IF NOT EXISTS deadhead_pay_cents bigint NULL;

COMMENT ON COLUMN driver_finance.driver_bills.deadhead_pay_cents IS
  'MILES SPEC (owner 2026-09-02) -- the empty-mile portion of gross_amount_cents (miles_deadhead x the resolved rate_empty_per_mile_cents, snapshotted at mint time). gross_amount_cents = loaded_pay_cents + deadhead_pay_cents + stop bonuses/tarp/lumper. Renders as its own settlement_lines row ("Empty Miles at rate") alongside the loaded-miles line, never folded into one number.';

DO $widen_line_type$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'settlement_lines_line_type_chk_detention'
      AND conrelid = 'driver_finance.settlement_lines'::regclass
  ) THEN
    ALTER TABLE driver_finance.settlement_lines DROP CONSTRAINT settlement_lines_line_type_chk_detention;
  END IF;
  ALTER TABLE driver_finance.settlement_lines
    ADD CONSTRAINT settlement_lines_line_type_chk_detention
    CHECK (line_type = ANY (ARRAY[
      'earnings','extra_pay','reimbursement','deduction','advance_recovery','escrow',
      'abandonment_chargeback','team_split_primary','team_split_secondary','auto_deduction',
      'dispute_adjustment','escrow_contribution','detention_pay',
      'deadhead_pay' -- MILES SPEC (owner 2026-09-02) -- the empty-miles settlement line
    ]));
END
$widen_line_type$;

DROP INDEX IF EXISTS driver_finance.uniq_settlement_lines_source_driver_bill_id;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_settlement_lines_source_driver_bill_id_line_type
  ON driver_finance.settlement_lines (source_driver_bill_id, line_type)
  WHERE source_driver_bill_id IS NOT NULL;

COMMIT;
