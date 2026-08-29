-- GO-DWELL-01 / D-3 (owner 2026-08-29) — detention driver-pay is a real settlement line type.
--
-- driver_finance.settlement_lines' line_type CHECK is a live superset (202607380000's own comment:
-- "drop ALL line_type CHECKs, then ADD one superset" — never narrow, never re-derive from a partial
-- list). This migration follows the SAME pattern: drop every existing line_type CHECK, re-add the
-- full live 12-value set plus ONE new value, 'detention_pay' — the driver-side pay leg for a closed,
-- evidenced dispatch.detention_events row (customer-side detention BILLING already flows through
-- the ordinary invoice linehaul total via bridgeDetentionToBillingInClientTx; this is the separate,
-- previously-nonexistent DRIVER-side pay leg D-3 names).
--
-- Additive + idempotent (DROP CONSTRAINT IF EXISTS pattern via the same DO-block search-and-drop
-- 202607380000 uses, ADD CONSTRAINT with a new name). No data touched. No RLS/grant change.

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('driver_finance.settlement_lines') IS NULL THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'driver_finance.settlement_lines'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%line_type%'
  LOOP
    EXECUTE format('ALTER TABLE driver_finance.settlement_lines DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE driver_finance.settlement_lines
    ADD CONSTRAINT settlement_lines_line_type_chk_detention CHECK (
      line_type IN (
        'earnings',
        'extra_pay',
        'reimbursement',
        'deduction',
        'advance_recovery',
        'escrow',
        'abandonment_chargeback',
        'team_split_primary',
        'team_split_secondary',
        'auto_deduction',
        'dispute_adjustment',
        'escrow_contribution',
        'detention_pay'
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL; -- constraint already present on a re-run
END $$;

COMMIT;
