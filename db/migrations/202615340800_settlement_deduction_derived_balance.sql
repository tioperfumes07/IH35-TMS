-- 202615340800_settlement_deduction_derived_balance.sql
-- ALL-SEATS ORDER "KILL THE SECOND SYSTEM" — CC-2: driver_finance.driver_settlement_deductions.remaining_balance_cents.
-- THE POLICY STAYS: the deduction row (amount_cents, reason, type, load, hold) is the stored document.
-- THE BALANCE IS DERIVED. A pending deduction is NOT in the GL (measured 2026-10-03: 67 of 67 USMCA deductions have no
-- posting and no spine link) — it reaches the books only when a settlement applies it, as a settlement_lines row
-- (line_type 'deduction', source_reference_id = the deduction) that posts with the driver_settlement entry. So the
-- balance a CPA can recompute is: amount_cents - the deduction's active, unvoided settlement deduction lines.
-- Measured drift, the reason this matters: 5 of 67 deductions already carry a line on a CLOSED settlement while the stored
-- column still says pending at full amount — 3 of them with applied_to_settlement_id NULL, i.e. eligible to be
-- materialized and deducted from the driver a second time. The view below gives every reader the true remaining.
-- Step 1 of the order's method: the view exists and readers repoint to it; the column is dropped in a later file.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;

CREATE INDEX IF NOT EXISTS idx_settlement_lines_deduction_source
  ON driver_finance.settlement_lines (source_reference_id)
  WHERE line_type = 'deduction';

CREATE OR REPLACE VIEW driver_finance.v_settlement_deduction_balances WITH (security_invoker = true) AS
SELECT d.id                   AS deduction_id,
       d.operating_company_id,
       d.driver_id,
       d.amount_cents,
       COALESCE(a.applied_cents, 0)::bigint AS applied_cents,
       CASE WHEN d.voided_at IS NOT NULL THEN 0::bigint
            ELSE GREATEST(d.amount_cents - COALESCE(a.applied_cents, 0), 0)::bigint END AS remaining_cents,
       a.line_count
  FROM driver_finance.driver_settlement_deductions d
  LEFT JOIN LATERAL (
    SELECT sum(round(abs(sl.amount) * 100))::bigint AS applied_cents, count(*)::int AS line_count
      FROM driver_finance.settlement_lines sl
      JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id
     WHERE sl.line_type = 'deduction'
       AND sl.source_reference_id = d.id
       AND sl.operating_company_id = d.operating_company_id
       AND sl.voided_at IS NULL
       AND COALESCE(sl.is_active, true)
       AND s.voided_at IS NULL
  ) a ON true;

COMMENT ON VIEW driver_finance.v_settlement_deduction_balances IS
  'Derived remaining balance per settlement deduction: amount_cents (the stored policy) minus its active settlement deduction lines. Readers use this, never remaining_balance_cents (KILL THE SECOND SYSTEM).';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    GRANT SELECT ON driver_finance.v_settlement_deduction_balances TO ih35_app;
  END IF;
  IF to_regclass('driver_finance.v_settlement_deduction_balances') IS NULL THEN
    RAISE EXCEPTION '202615340800: view missing';
  END IF;
END $$;

COMMIT;
