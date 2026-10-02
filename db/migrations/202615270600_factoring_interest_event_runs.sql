-- 202615270600_factoring_interest_event_runs.sql
-- Owner ruling 2026-10-02 (00-OWNER-RULING-2026-10-02-CC2-ACCEPTED-PLUS-FOUR-RULINGS.md): "If an invoice is repurchased or
-- paid on day 50, interest for days 36-50 must accrue at that moment, inside the same transaction as the repurchase ...
-- Build the repurchase-time accrual on the same approval path, same account pair, same idempotency key."
--
-- The month-end run table (202615240600) gets a second kind: an EVENT run — one Purchased Account, accrued through the
-- date it was collected or repurchased, proposed by one user and approved by another exactly like the month-end run, and
-- posting the same DR 6830 / CR 2155. Idempotency: one live period-close run per company and period end (as before), one
-- live event run per purchase line and date. Existing rows are period-close runs.

BEGIN;

ALTER TABLE accounting.factoring_interest_accrual_runs
  ADD COLUMN IF NOT EXISTS run_kind text NOT NULL DEFAULT 'period_close',
  ADD COLUMN IF NOT EXISTS event_purchase_line_id uuid REFERENCES accounting.factoring_purchase_lines(id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factoring_interest_accrual_runs_kind'
                   AND conrelid = 'accounting.factoring_interest_accrual_runs'::regclass) THEN
    ALTER TABLE accounting.factoring_interest_accrual_runs
      ADD CONSTRAINT factoring_interest_accrual_runs_kind CHECK (
        (run_kind = 'period_close' AND event_purchase_line_id IS NULL)
        OR (run_kind = 'event' AND event_purchase_line_id IS NOT NULL AND line_count = 1 AND period_start = period_end)
      );
  END IF;
END $$;

DROP INDEX IF EXISTS accounting.uq_factoring_interest_accrual_runs_live_period;
CREATE UNIQUE INDEX IF NOT EXISTS uq_factoring_interest_accrual_runs_live_period
  ON accounting.factoring_interest_accrual_runs (operating_company_id, period_end)
  WHERE state IN ('proposed', 'posted') AND run_kind = 'period_close';
CREATE UNIQUE INDEX IF NOT EXISTS uq_factoring_interest_accrual_runs_live_event
  ON accounting.factoring_interest_accrual_runs (event_purchase_line_id, period_end)
  WHERE state IN ('proposed', 'posted') AND run_kind = 'event';

-- The decided-run guard (202615240600) compares only decision fields; an event run is immutable once decided like any run.

COMMIT;
